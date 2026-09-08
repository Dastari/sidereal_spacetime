import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      "Use npm run smoke or npm run smoke:restart to load dev.toml",
    );
  return value;
}
const host = requiredEnv("SIDEREAL_SMOKE_URL");
const database = requiredEnv("SIDEREAL_SMOKE_DATABASE");
if (!database.endsWith("-smoke"))
  throw new Error("Smoke requires an isolated -smoke database");
const wait = async (fn: () => boolean, message: string) => {
  const end = Date.now() + 7000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Timeout: " + message);
};
async function client(token?: string) {
  let saved = "";
  let ready = false;
  const connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c, _i, t) => {
      saved = t;
      c.subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownEditReceipts,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  return { connection, token: saved };
}
const summary: Record<string, unknown> = {
  date: new Date().toISOString(),
  database,
};
const restore = process.argv.includes("--verify-restart");
if (restore) {
  const evidence = JSON.parse(
    readFileSync(".runtime/smoke-identity.json", "utf8"),
  );
  const { connection: a } = await client(evidence.token);
  try {
    await wait(
      () =>
        [...a.db.ownShips.iter()].some(
          (s) => s.id === evidence.shipId && s.name === "Persistent Wayfarer",
        ),
      "restart persisted identity/name",
    );
    assert.equal([...a.db.ownEditReceipts.iter()].length, 1);
    console.log(
      "Restart proof passed: ship UUID, name and edit receipt survived.",
    );
  } finally {
    a.disconnect();
  }
} else {
  const first = await client(),
    second = await client();
  const a = first.connection,
    b = second.connection;
  try {
    await a.reducers.enterLab({ name: "Smoke Alpha" });
    await b.reducers.enterLab({ name: "Smoke Beta" });
    await wait(
      () => a.db.ownShips.count() === 1n && b.db.ownShips.count() === 1n,
      "two private ships",
    );
    const ship = [...a.db.ownShips.iter()][0];
    const other = [...b.db.ownShips.iter()][0];
    assert.notEqual(ship.id, other.id);
    assert.equal(a.db.ownShips.count(), 1n);
    assert.equal(b.db.ownShips.count(), 1n);
    summary.isolated_views = true;
    await assert.rejects(
      b.reducers.renameShip({
        shipId: ship.id,
        name: "Intrusion",
        expectedRevision: ship.revision,
        operationId: "forbidden-edit",
      }),
    );
    summary.unauthorized_edit_rejected = true;
    let privateRejected = false;
    const attack = b
      .subscriptionBuilder()
      .onError(() => (privateRejected = true))
      .subscribe("SELECT * FROM ship");
    await wait(() => privateRejected, "private table rejection");
    summary.private_table_rejected = true;
    await a.reducers.renameShip({
      shipId: ship.id,
      name: "Persistent Wayfarer",
      expectedRevision: ship.revision,
      operationId: "persistent-edit",
    });
    await a.reducers.renameShip({
      shipId: ship.id,
      name: "Persistent Wayfarer",
      expectedRevision: ship.revision,
      operationId: "persistent-edit",
    });
    await assert.rejects(
      a.reducers.renameShip({
        shipId: ship.id,
        name: "Stale",
        expectedRevision: ship.revision,
        operationId: "stale-edit",
      }),
    );
    await assert.rejects(
      a.reducers.renameShip({
        shipId: ship.id,
        name: "Wrong payload",
        expectedRevision: ship.revision,
        operationId: "persistent-edit",
      }),
    );
    await wait(
      () => a.db.ownEditReceipts.count() === 1n,
      "one idempotent receipt",
    );
    summary.revision_idempotency = true;
    await a.reducers.setIntent({
      sequence: 1n,
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
    });
    await wait(() => [...a.db.ownShips.iter()][0].vy > 0, "authority thrust");
    summary.authoritative_flight = true;
    await a.reducers.useStation({});
    await assert.rejects(
      a.reducers.setIntent({
        sequence: 2n,
        throttle: 1,
        turn: 0,
        dx: 0,
        dy: 0,
      }),
    );
    summary.unseated_control_rejected = true;
    await a.reducers.setIntent({
      sequence: 3n,
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
    });
    await wait(
      () => [...a.db.ownCharacters.iter()][0].localX > 0,
      "local-frame walking",
    );
    summary.authoritative_walk = true;
    await assert.rejects(
      a.reducers.setIntent({
        sequence: 4n,
        throttle: 0,
        turn: 0,
        dx: 100,
        dy: 0,
      }),
    );
    summary.invalid_input_rejected = true;
    writeFileSync(
      ".runtime/smoke-identity.json",
      JSON.stringify({ token: first.token, shipId: ship.id }),
      { mode: 0o600 },
    );
    writeFileSync(
      ".runtime/smoke-results.json",
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    a.disconnect();
    b.disconnect();
  }
}
