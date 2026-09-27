/** Real authority proof using local development identities on an explicitly isolated database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { LAB_FLIGHT_ACTUATORS } from "../packages/content/src/flight";
import { WAYFARER_REACTOR_ASSET_ID } from "../packages/content/src/device-services";
import type { ConstructionDocument } from "../packages/content/src/construction";
import { QUALIFIED_PILOT_APPROACH } from "../packages/sim/src/construction-pilot";
import {
  acquireNativePilot,
  leaveNativePilot,
  nextSequence,
  walkNative,
} from "./native-starter-smoke";

const host = process.env.SIDEREAL_SMOKE_URL;
const database = process.env.SIDEREAL_SMOKE_DATABASE;
const evidencePath = process.env.SIDEREAL_POWER_EVIDENCE;
const expectedTemplate = process.env.SIDEREAL_EXPECTED_TEMPLATE_SHA256;
const restart = process.argv.includes("--verify-restart");
if (!host || !database || !evidencePath)
  throw Error(
    "Explicit SIDEREAL_SMOKE_URL, SIDEREAL_SMOKE_DATABASE and SIDEREAL_POWER_EVIDENCE required",
  );
const endpoint = new URL(host);
if (
  !["http:", "ws:"].includes(endpoint.protocol) ||
  endpoint.hostname !== "127.0.0.1" ||
  endpoint.port !== "3191" ||
  endpoint.pathname !== "/" ||
  endpoint.search ||
  endpoint.username ||
  endpoint.password ||
  !/^sidereal-spacetime-dev-[a-z0-9-]+-smoke$/.test(database)
) {
  throw Error(
    "Device power smoke is restricted to local port 3191 and an explicitly isolated sidereal-spacetime-dev-*-smoke database",
  );
}
if (expectedTemplate && !/^[a-f0-9]{64}$/.test(expectedTemplate))
  throw Error("Expected template must be an exact SHA-256");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(predicate: () => boolean, label: string, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await pause(40);
  }
  throw Error("Device power smoke timed out: " + label);
}
interface Evidence {
  schema: "sidereal.device-power-smoke.v1";
  host: string;
  database: string;
  phase: "seeded" | "prepared" | "restart-verified";
  tokens: string[];
  characters: {
    id: string;
    shipId: string;
    templateSha256: string;
    engineIds: string[];
  }[];
  checks: Record<string, boolean>;
  disconnected?: {
    engineId: string;
    fittingId: string;
    sourceId: string;
    revision: string;
    operationId: string;
    expectedRevision: string;
  };
  preparedAt?: string;
  restartedAt?: string;
}
let evidence: Evidence | undefined;
if (existsSync(evidencePath)) {
  const raw = readFileSync(evidencePath, "utf8");
  assert(raw.length < 100_000, "bounded smoke evidence");
  evidence = JSON.parse(raw) as Evidence;
  assert.equal(evidence.schema, "sidereal.device-power-smoke.v1");
  assert.equal(evidence.host, host, "evidence endpoint must match exactly");
  assert.equal(evidence.database, database, "evidence cannot cross databases");
  assert.equal(evidence.tokens.length, 2);
} else if (restart)
  throw Error("Prepare this exact isolated database before verifying restart");
function save(value: Evidence) {
  mkdirSync(dirname(evidencePath!), { recursive: true });
  const temporary = evidencePath! + ".pending";
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
  chmodSync(temporary, 0o600);
  renameSync(temporary, evidencePath!);
}
async function client(token?: string) {
  let savedToken = token ?? "";
  let ready = false;
  let failure: Error | undefined;
  const connection = DbConnection.builder()
    .withUri(host!)
    .withDatabaseName(database!)
    .withToken(token)
    .onConnect((c, _identity, saved) => {
      savedToken = saved;
      c.subscriptionBuilder()
        .onApplied(() => {
          ready = true;
        })
        .onError(() => {
          failure = Error("Private device-power subscription rejected");
        })
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownGameShipAccess,
          tables.ownConstructionInstances,
          tables.ownConstructionLocation,
          tables.ownStations,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightPowerFittings,
          tables.ownActuatorOutputs,
          tables.ownWorldAdmission,
        ]);
    })
    .onConnectError(() => {
      failure = Error("Isolated device-power connection failed");
    })
    .build();
  try {
    await wait(() => {
      if (failure) throw failure;
      return ready;
    }, "development identity subscription");
  } catch (failure) {
    connection.disconnect();
    throw failure;
  }
  assert(savedToken, "server-issued development identity retained privately");
  return { connection, token: savedToken };
}
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
const binding = (c: DbConnection) =>
  [...c.db.ownAuthoredFlights.iter()].find(
    (row) => row.shipId === actor(c)?.shipId,
  )!;
const engines = (c: DbConnection) =>
  [...c.db.ownAuthoredFlightPowerFittings.iter()].filter(
    (row) => row.shipId === actor(c)?.shipId && row.kind === "actuator",
  );
const engine = (c: DbConnection, id: string) =>
  engines(c).find((row) => row.placedObjectId === id)!;
async function setPower(c: DbConnection, id: string, connected: boolean) {
  const before = binding(c);
  const request = {
    shipId: before.shipId,
    enginePlacedObjectId: id,
    connected,
    expectedRevision: before.revision,
    operationId: randomUUID(),
  };
  await c.reducers.setConstructionEnginePower(request);
  await wait(
    () =>
      engine(c, id)?.powered === connected &&
      binding(c).revision === before.revision + 1n,
    "powered state and revision committed",
  );
  return request;
}
async function intent(c: DbConnection, throttle: number) {
  await c.reducers.setIntent({
    sequence: nextSequence(c),
    throttle,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
}
async function poweredOutput(
  c: DbConnection,
  predicate: () => boolean,
  label: string,
) {
  const end = Date.now() + 6000;
  while (Date.now() < end) {
    await intent(c, 1);
    await pause(85);
    if (predicate()) return;
  }
  throw Error("Actual IFCS output failed: " + label);
}
const output = (c: DbConnection, fittingId: string) =>
  [...c.db.ownActuatorOutputs.iter()].find(
    (row) => row.actuatorId === fittingId,
  );
const sessions: Awaited<ReturnType<typeof client>>[] = [];
try {
  for (let i = 0; i < 2; i++) {
    const session = await client(evidence?.tokens[i]);
    sessions.push(session);
    const c = session.connection;
    await c.reducers.enterLab({
      name: i ? "Device Power Beta" : "Device Power Alpha",
    });
    await wait(
      () => !!actor(c) && !!binding(c) && engines(c).length === 9,
      "qualified character and nine engine fittings",
    );
    assert.equal(
      [...c.db.ownAuthoredFlightPowerFittings.iter()].length,
      10,
      "nine engines plus flight computer",
    );
    assert.deepEqual(
      engines(c)
        .map((row) => row.sourceDeviceId)
        .sort(),
      LAB_FLIGHT_ACTUATORS.map((row) => row.id).sort(),
    );
    assert(
      [...c.db.ownAuthoredFlightPowerFittings.iter()].every(
        (row) => row.shipId === actor(c).shipId,
      ),
      "private fitting view excludes another owner's ship",
    );
    const access = [...c.db.ownGameShipAccess.iter()].find(
      (row) => row.shipId === actor(c).shipId,
    )!;
    assert(access, "authoritative current game ship access");
    if (expectedTemplate)
      assert.equal(
        access.templateSha256,
        expectedTemplate,
        "exact candidate starter source",
      );
    const instance = [...c.db.ownConstructionInstances.iter()].find(
      (row) => row.id === actor(c).shipId,
    )!;
    assert(instance, "owned authored instance is inspectable");
    const document = JSON.parse(instance.documentJson) as ConstructionDocument;
    assert.equal(
      document.layout.assembly?.parts.filter(
        (part) => part.assetId === WAYFARER_REACTOR_ASSET_ID,
      ).length,
      1,
      "actual qualified reactor is installed",
    );
    if (evidence) {
      assert.equal(
        actor(c).id,
        evidence.characters[i].id,
        "character UUID survives reconnect/restart",
      );
      assert.equal(
        actor(c).shipId,
        evidence.characters[i].shipId,
        "ship UUID survives reconnect/restart",
      );
      assert.equal(
        access.templateSha256,
        evidence.characters[i].templateSha256,
      );
      assert.deepEqual(
        engines(c)
          .map((row) => row.placedObjectId)
          .sort(),
        evidence.characters[i].engineIds,
      );
    }
  }
  const a = sessions[0].connection,
    b = sessions[1].connection;
  assert.notEqual(actor(a).shipId, actor(b).shipId);
  evidence ??= {
    schema: "sidereal.device-power-smoke.v1",
    host,
    database,
    phase: "seeded",
    tokens: sessions.map((session) => session.token),
    characters: sessions.map(({ connection: c }) => ({
      id: actor(c).id,
      shipId: actor(c).shipId,
      templateSha256: [...c.db.ownGameShipAccess.iter()].find(
        (row) => row.shipId === actor(c).shipId,
      )!.templateSha256,
      engineIds: engines(c)
        .map((row) => row.placedObjectId)
        .sort(),
    })),
    checks: {},
  };
  evidence.tokens = sessions.map((session) => session.token);
  save(evidence);
  if (restart) {
    assert(
      evidence.disconnected &&
        ["prepared", "restart-verified"].includes(evidence.phase),
      "completed disconnect proof is required before restart",
    );
    const saved = evidence.disconnected;
    assert.equal(
      engine(a, saved.engineId).powered,
      false,
      "disconnected engine persists through managed server restart",
    );
    assert.equal(engines(a).filter((row) => row.powered).length, 8);
    assert(
      engines(b).every((row) => row.powered),
      "other owner power state remains unchanged",
    );
    const before = binding(a).revision;
    await a.reducers.setConstructionEnginePower({
      shipId: actor(a).shipId,
      enginePlacedObjectId: saved.engineId,
      connected: false,
      expectedRevision: BigInt(saved.expectedRevision),
      operationId: saved.operationId,
    });
    await pause(100);
    assert.equal(
      binding(a).revision,
      before,
      "operation receipt remains idempotent after restart",
    );
    assert.equal(engine(a, saved.engineId).powered, false);
    evidence.phase = "restart-verified";
    evidence.restartedAt = new Date().toISOString();
    evidence.checks.restartPersistence = true;
    evidence.checks.restartReplay = true;
    save(evidence);
    console.log(
      "Device power restart proof passed: both identities/ships and nine fitting UUIDs retained; one engine remains disconnected, other owner unchanged, exact operation replay remains idempotent.",
    );
  } else {
    for (const c of [a, b])
      for (const row of engines(c))
        if (!row.powered) await setPower(c, row.placedObjectId, true);
    await a.reducers.claimInputControl({});
    if (binding(a).seatState !== "seated") {
      for (const [x, y] of [[0, -2], [0, 7], QUALIFIED_PILOT_APPROACH])
        await walkNative(a, x, y);
      await acquireNativePilot(a);
    }
    const main = engines(a).filter((row) =>
      row.sourceDeviceId.startsWith("drives-main"),
    );
    await poweredOutput(
      a,
      () => main.some((row) => (output(a, row.id)?.throttle ?? 0) > 0.01),
      "connected main engine produces thrust",
    );
    const target = main.find(
      (row) => (output(a, row.id)?.throttle ?? 0) > 0.01,
    )!;
    console.log(
      "Installed reactor and nine engines verified; actual connected engine produces IFCS thrust.",
    );
    const disconnect = await setPower(a, target.placedObjectId, false);
    await poweredOutput(
      a,
      () =>
        output(a, target.id)?.throttle === 0 &&
        main.some(
          (row) =>
            row.id !== target.id && (output(a, row.id)?.throttle ?? 0) > 0.01,
        ),
      "disconnected engine has zero output while other main engines keep producing thrust",
    );
    await intent(a, 0);
    const unchanged = binding(a).revision;
    await a.reducers.setConstructionEnginePower(disconnect);
    await assert.rejects(
      a.reducers.setConstructionEnginePower({ ...disconnect, connected: true }),
      "same operation cannot be reused with a different payload",
    );
    await assert.rejects(
      a.reducers.setConstructionEnginePower({
        ...disconnect,
        connected: true,
        operationId: randomUUID(),
      }),
      "stale binding revision must reject",
    );
    await assert.rejects(
      b.reducers.setConstructionEnginePower({
        ...disconnect,
        expectedRevision: binding(a).revision,
        connected: true,
        operationId: randomUUID(),
      }),
      "another account cannot connect this engine",
    );
    const computer = [...a.db.ownAuthoredFlightPowerFittings.iter()].find(
      (row) => row.kind === "computer",
    )!;
    await assert.rejects(
      a.reducers.setConstructionEnginePower({
        ...disconnect,
        enginePlacedObjectId: computer.placedObjectId,
        expectedRevision: binding(a).revision,
        connected: true,
        operationId: randomUUID(),
      }),
      "computer cannot impersonate an engine power input",
    );
    assert.equal(
      binding(a).revision,
      unchanged,
      "all denied/replayed edits preserve binding revision",
    );
    assert.equal(engine(a, target.placedObjectId).powered, false);
    assert(engines(b).every((row) => row.powered));
    await setPower(a, target.placedObjectId, true);
    await poweredOutput(
      a,
      () => (output(a, target.id)?.throttle ?? 0) > 0.01,
      "reconnected engine returns to actual IFCS allocation",
    );
    await intent(a, 0);
    const final = await setPower(a, target.placedObjectId, false);
    await leaveNativePilot(a);
    evidence.disconnected = {
      engineId: target.placedObjectId,
      fittingId: target.id,
      sourceId: target.sourceDeviceId,
      revision: binding(a).revision.toString(),
      expectedRevision: final.expectedRevision.toString(),
      operationId: final.operationId,
    };
    evidence.phase = "prepared";
    evidence.preparedAt = new Date().toISOString();
    evidence.checks = {
      ...evidence.checks,
      twoPrivateOwners: true,
      installedReactor: true,
      nineRealEngines: true,
      connectedThrust: true,
      disconnectedZeroThrust: true,
      otherEnginesStillThrust: true,
      reconnectRestoresThrust: true,
      staleRejected: true,
      unauthorizedRejected: true,
      wrongDeviceRejected: true,
      replayIdempotent: true,
      replayConflictRejected: true,
    };
    save(evidence);
    console.log(
      "Device power proof passed: real disconnect/reconnect changes IFCS output; unauthorized, stale and conflicting edits reject; replay is idempotent. One engine is disconnected for the root-managed restart check.",
    );
  }
} finally {
  for (const session of sessions) session.connection.disconnect();
}
