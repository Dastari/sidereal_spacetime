/** Third development identity for exact r005 authoring/flight evidence. Never grants itself authority. */
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
import type { ConstructionDocument } from "../packages/content/src/construction";
import {
  createQualifiedWayfarerExterior,
  WAYFARER_EXTERIOR_SHA256,
} from "../packages/sim/src/wayfarer-exterior-qualification";
import { QUALIFIED_PILOT_APPROACH } from "../packages/sim/src/construction-pilot";
import { nextSequence, walkNative } from "./native-starter-smoke";

const host = process.env.SIDEREAL_SMOKE_URL;
const database = process.env.SIDEREAL_SMOKE_DATABASE;
const evidencePath = process.env.SIDEREAL_QUALIFIED_EVIDENCE;
const mode = process.argv[2];
if (
  !host ||
  !database ||
  !evidencePath ||
  !["--seed-authoring", "--spawn-qualified"].includes(mode)
)
  throw Error(
    "Explicit isolated endpoint/database/SIDEREAL_QUALIFIED_EVIDENCE and --seed-authoring or --spawn-qualified required",
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
)
  throw Error(
    "Qualified smoke only accepts local port 3191 and isolated sidereal-spacetime-dev-*-smoke databases",
  );
const capabilities = [
  "draft.read",
  "draft.write",
  "blueprint.publish",
  "instance.spawn",
];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(predicate: () => boolean, label: string, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (predicate()) return;
    await pause(40);
  }
  throw Error("Qualified power smoke timed out: " + label);
}
interface Evidence {
  schema: "sidereal.qualified-power-smoke.v1";
  host: string;
  database: string;
  phase: "awaiting-grants" | "spawned" | "flight-verified";
  token: string;
  principal: string;
  workspaceId: string;
  draftId: string;
  sourceSha256: string;
  characterId: string;
  originalShipId: string;
  blueprintId?: string;
  instanceId?: string;
  spawnOperationId: string;
  checks: Record<string, boolean | number | string>;
}
let prior: Evidence | undefined;
if (existsSync(evidencePath)) {
  const raw = readFileSync(evidencePath, "utf8");
  assert(raw.length < 100_000);
  prior = JSON.parse(raw) as Evidence;
  assert.equal(prior.schema, "sidereal.qualified-power-smoke.v1");
  assert.equal(prior.host, host);
  assert.equal(prior.database, database);
  assert.equal(prior.sourceSha256, WAYFARER_EXTERIOR_SHA256);
} else if (mode !== "--seed-authoring")
  throw Error("Seed the third authoring identity before requesting spawn");
function save(value: Evidence) {
  mkdirSync(dirname(evidencePath!), { recursive: true });
  writeFileSync(
    evidencePath! + ".pending",
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 },
  );
  chmodSync(evidencePath! + ".pending", 0o600);
  renameSync(evidencePath! + ".pending", evidencePath!);
}
let ready = false,
  failure: Error | undefined,
  token = prior?.token ?? "";
const connection = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .withToken(prior?.token)
  .onConnect((c, _id, saved) => {
    token = saved;
    c.subscriptionBuilder()
      .onApplied(() => {
        ready = true;
      })
      .onError(() => {
        failure = Error("Qualified author private subscription rejected");
      })
      .subscribe([
        tables.ownCharacters,
        tables.ownShips,
        tables.ownGameShipAccess,
        tables.ownConstructionGrants,
        tables.ownConstructionDrafts,
        tables.ownConstructionBlueprints,
        tables.ownConstructionInstances,
        tables.ownConstructionLocation,
        tables.ownAuthoredFlights,
        tables.ownAuthoredFlightPowerFittings,
        tables.ownActuatorOutputs,
        tables.ownWorldAdmission,
      ]);
  })
  .onConnectError(() => {
    failure = Error("Isolated author development connection failed");
  })
  .build();
const actor = () => [...connection.db.ownCharacters.iter()][0]!;
const flight = (id: string) =>
  [...connection.db.ownAuthoredFlights.iter()].find((r) => r.shipId === id)!;
const instance = (id: string) =>
  [...connection.db.ownConstructionInstances.iter()].find((r) => r.id === id)!;
const ship = (id: string) =>
  [...connection.db.ownShips.iter()].find((r) => r.id === id)!;
try {
  await wait(() => {
    if (failure) throw failure;
    return ready;
  }, "private development subscription");
  await connection.reducers.enterLab({ name: "Qualified Exterior Reviewer" });
  await wait(() => !!actor(), "author character admitted");
  assert(connection.identity, "connected author identity required");
  const evidence: Evidence = prior ?? {
    schema: "sidereal.qualified-power-smoke.v1",
    host,
    database,
    phase: "awaiting-grants",
    token,
    principal: connection.identity.toHexString(),
    workspaceId: "qualified-exterior-" + randomUUID(),
    draftId: randomUUID(),
    sourceSha256: WAYFARER_EXTERIOR_SHA256,
    characterId: actor().id,
    originalShipId: actor().shipId,
    spawnOperationId: randomUUID(),
    checks: {},
  };
  assert.equal(connection.identity.toHexString(), evidence.principal);
  assert.equal(actor().id, evidence.characterId);
  evidence.token = token;
  save(evidence);
  if (mode === "--seed-authoring") {
    console.log(
      JSON.stringify(
        {
          phase: evidence.phase,
          principal: evidence.principal,
          workspaceId: evidence.workspaceId,
          capabilities,
          sourceSha256: evidence.sourceSha256,
        },
        null,
        2,
      ),
    );
  } else {
    for (const capability of capabilities)
      assert(
        [...connection.db.ownConstructionGrants.iter()].some(
          (g) =>
            g.workspaceId === evidence.workspaceId &&
            g.capability === capability &&
            !g.revoked &&
            g.expiresMicros > BigInt(Date.now()) * 1000n,
        ),
        "Operator must grant " +
          capability +
          " to this isolated author workspace",
      );
    const source = createQualifiedWayfarerExterior();
    assert.equal(source.sourceSha256, evidence.sourceSha256);
    if (!evidence.blueprintId) {
      const old = [...connection.db.ownConstructionDrafts.iter()].find(
        (d) => d.id === evidence.draftId,
      );
      await connection.reducers.saveConstructionDraft({
        workspaceId: evidence.workspaceId,
        draftId: evidence.draftId,
        documentJson: source.canonical,
        expectedRevision: old?.revision ?? 0n,
        operationId: randomUUID(),
      });
      await wait(
        () =>
          [...connection.db.ownConstructionDrafts.iter()].some(
            (d) =>
              d.id === evidence.draftId &&
              d.revision === (old?.revision ?? 0n) + 1n,
          ),
        "exact source draft saved",
      );
      const draft = [...connection.db.ownConstructionDrafts.iter()].find(
        (d) => d.id === evidence.draftId,
      )!;
      await connection.reducers.publishConstructionBlueprint({
        workspaceId: evidence.workspaceId,
        draftId: draft.id,
        expectedRevision: draft.revision,
        operationId: randomUUID(),
      });
      await wait(
        () =>
          [...connection.db.ownConstructionBlueprints.iter()].some(
            (b) =>
              b.draftId === draft.id && b.sourceRevision === draft.revision,
          ),
        "exact blueprint published",
      );
      const blueprint = [
        ...connection.db.ownConstructionBlueprints.iter(),
      ].find(
        (b) => b.draftId === draft.id && b.sourceRevision === draft.revision,
      )!;
      assert.equal(blueprint.sha256, evidence.sourceSha256);
      evidence.blueprintId = blueprint.id;
      save(evidence);
    }
    await connection.reducers.spawnConstructionBlueprint({
      blueprintId: evidence.blueprintId,
      expectedSha256: evidence.sourceSha256,
      sourceDeckId: source.document.layout.playableDeckId,
      operationId: evidence.spawnOperationId,
    });
    await wait(
      () =>
        [...connection.db.ownConstructionInstances.iter()].some(
          (i) => i.blueprintId === evidence.blueprintId,
        ),
      "source spawned through normal authority",
    );
    const spawned = [...connection.db.ownConstructionInstances.iter()].filter(
      (i) => i.blueprintId === evidence.blueprintId,
    );
    assert.equal(
      spawned.length,
      1,
      "spawn operation replay must retain one instance",
    );
    const candidate = spawned[0];
    assert.equal(candidate.blueprintSha256, evidence.sourceSha256);
    if (evidence.instanceId) assert.equal(candidate.id, evidence.instanceId);
    evidence.instanceId = candidate.id;
    const document = JSON.parse(candidate.documentJson) as ConstructionDocument;
    assert.equal(document.layout.serviceConnections?.length, 9);
    assert.equal(
      document.layout.nodes.length,
      source.document.layout.nodes.length,
    );
    assert.equal(
      document.layout.routes.length,
      source.document.layout.routes.length,
    );
    const placed = new Set(document.layout.assembly!.parts.map((p) => p.id));
    for (const link of document.layout.serviceConnections!) {
      assert(
        placed.has(link.fromDeviceId) && placed.has(link.toDeviceId),
        "logical endpoints remapped to actual instance device IDs",
      );
      assert.equal(link.fromPortId, "power-out");
      assert.equal(link.toPortId, "power-in");
    }
    evidence.phase = "spawned";
    evidence.checks = {
      ...evidence.checks,
      exactSource: true,
      spawnIdempotent: true,
      logicalConnections: 9,
      physicalRoutesUnaffected: true,
    };
    save(evidence);
    const id = candidate.id;
    if (!flight(id)) {
      await connection.reducers.installAuthoredShipFlight({
        instanceId: id,
        expectedInstanceRevision: instance(id).revision,
        operationId: randomUUID(),
      });
      await wait(() => !!flight(id), "qualified flight installation");
    }
    if (!flight(id).active) {
      await connection.reducers.activateAuthoredShipFlight({
        shipId: id,
        expectedRevision: flight(id).revision,
        operationId: randomUUID(),
      });
      await wait(() => flight(id).active, "qualified flight activation");
    }
    if (actor().shipId !== id) {
      assert.equal(
        actor().shipId,
        evidence.originalShipId,
        "review must start from the third account's own original ship",
      );
      await connection.reducers.enterConstructionReview({
        instanceId: id,
        expectedShipId: actor().shipId,
        operationId: randomUUID(),
      });
      await wait(
        () =>
          [...connection.db.ownConstructionLocation.iter()].some(
            (v) => v.instanceId === id,
          ),
        "qualified native review entry",
      );
    }
    if (!flight(id).flightAdmitted) {
      const visit = [...connection.db.ownConstructionLocation.iter()].find(
        (v) => v.instanceId === id,
      )!;
      await connection.reducers.beginAuthoredFlightReview({
        expectedVisitId: visit.visitId,
        expectedVisitRevision: visit.revision,
        expectedAdmissionRevision: flight(id).admissionRevision,
        operationId: randomUUID(),
      });
      await wait(() => flight(id).flightAdmitted, "qualified flight admission");
    }
    const fittings = () =>
      [...connection.db.ownAuthoredFlightPowerFittings.iter()].filter(
        (f) => f.shipId === id,
      );
    await wait(
      () => fittings().length === 10,
      "nine qualified engines and computer",
    );
    assert.equal(
      fittings().filter((f) => f.kind === "actuator" && f.powered).length,
      9,
    );
    assert.equal(fittings().filter((f) => f.kind === "computer").length, 1);
    await connection.reducers.claimInputControl({});
    if (flight(id).seatState !== "seated") {
      for (const [x, y] of [[0, -2], [0, 7], QUALIFIED_PILOT_APPROACH])
        await walkNative(connection, x, y);
      await connection.reducers.enterAuthoredPilot({
        stationId: flight(id).stationId,
        expectedStationRevision: flight(id).stationRevision,
        operationId: randomUUID(),
      });
      await wait(
        () => flight(id).seatState === "seated",
        "qualified native pilot acquired",
      );
    }
    const before = { x: ship(id).x, y: ship(id).y };
    let positive = false;
    const send = (throttle: number) =>
      connection.reducers.setIntent({
        sequence: nextSequence(connection),
        dx: 0,
        dy: 0,
        throttle,
        turn: 0,
        sprint: false,
      });
    try {
      for (let n = 0; n < 16; n++) {
        await send(1);
        await pause(85);
        positive ||= [...connection.db.ownActuatorOutputs.iter()].some(
          (o) => o.shipId === id && o.throttle > 0,
        );
      }
    } finally {
      await send(0);
    }
    assert(
      positive,
      "qualified runtime IFCS must produce actual engine output",
    );
    await wait(
      () => Math.hypot(ship(id).x - before.x, ship(id).y - before.y) > 0.05,
      "qualified authority must move exact-source ship",
    );
    evidence.checks = {
      ...evidence.checks,
      installedEngines: 9,
      poweredEngines: 9,
      walkedNativeFloor: true,
      pilotSeated: true,
      positiveActuatorOutput: true,
      authoritativeMotion: true,
    };
    await connection.reducers.leaveAuthoredPilot({});
    await wait(
      () => flight(id).seatState === "none",
      "qualified supported pilot exit",
    );
    evidence.phase = "flight-verified";
    save(evidence);
    console.log(
      JSON.stringify(
        {
          phase: evidence.phase,
          sourceSha256: evidence.sourceSha256,
          instanceId: id,
          workspaceId: evidence.workspaceId,
          checks: evidence.checks,
        },
        null,
        2,
      ),
    );
  }
} finally {
  connection.disconnect();
}
