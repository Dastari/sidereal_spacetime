import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE;
assert(
  host && database?.endsWith("-smoke"),
  "Use managed isolated smoke configuration",
);
const gameToken = readFileSync(
  process.env.SIDEREAL_SMOKE_OIDC_TOKEN_FILE!,
  "utf8",
).trim();
const dashboardToken = readFileSync(
  process.env.SIDEREAL_SMOKE_DASHBOARD_TOKEN_FILE!,
  "utf8",
).trim();
const claims = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
const gameClaims = claims(gameToken),
  dashboardClaims = claims(dashboardToken);
assert.equal(
  gameClaims.sub,
  dashboardClaims.sub,
  "Negative probe requires the same real provider subject",
);
assert.equal(
  gameClaims.iss,
  dashboardClaims.iss,
  "Negative probe requires the same real provider issuer",
);
assert(
  [dashboardClaims.aud].flat().includes("sidereal-dashboard"),
  "Use a genuine dashboard-audience token",
);
assert(
  ![dashboardClaims.aud].flat().includes("sidereal-game"),
  "Dashboard negative token must not also grant game audience",
);
async function probe(token: string, denied: boolean) {
  let connection: DbConnection | undefined;
  let ready = false,
    rejected = false;
  try {
    connection = DbConnection.builder()
      .withUri(host!)
      .withDatabaseName(database!)
      .withToken(token)
      .onConnect((c) => {
        c.subscriptionBuilder()
          .onApplied(() => {
            ready = true;
          })
          .onError(() => {
            rejected = true;
          })
          .subscribe([tables.ownCharacters]);
      })
      .onConnectError(() => {
        rejected = true;
      })
      .onDisconnect(() => {
        if (!ready) rejected = true;
      })
      .build();
    const deadline = Date.now() + 15000;
    while (!ready && !rejected && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 25));
    assert(ready || rejected, "Admission probe timed out without a result");
    if (!denied) {
      assert(ready && !rejected, "Valid game token must subscribe");
      assert(
        connection.db.ownCharacters.count() > 0n,
        "Existing isolated OIDC character must be visible",
      );
      return connection;
    }
    if (ready) {
      assert.equal(
        connection.db.ownCharacters.count(),
        0n,
        "Dashboard token must not inherit simultaneous same-principal game projection",
      );
      await assert.rejects(
        connection.reducers.enterLab({ name: "Must Not Be Created" }),
        "Dashboard credential must not execute gameplay",
      );
    }
    connection.disconnect();
    return undefined;
  } catch (error) {
    connection?.disconnect();
    throw error;
  }
}
const game = await probe(gameToken, false);
try {
  await probe(dashboardToken, true);
  console.log(
    JSON.stringify({
      real_dashboard_audience_denied: true,
      simultaneous_game_projection_not_inherited: true,
    }),
  );
} finally {
  game?.disconnect();
}
