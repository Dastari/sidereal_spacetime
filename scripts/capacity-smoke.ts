import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { availableParallelism, cpus, totalmem } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { DbConnection } from "../packages/net/src/generated";
import { gameViewKeys } from "../packages/net/src/game-subscriptions";
import { bindSharedWorld } from "../packages/net/src/bind-shared-world";
import { createConnectionResources } from "../packages/net/src/connection-resources";
import {
  byteCounters,
  deltaCounters,
  distribution,
  validatePopulation,
} from "./capacity-metrics";
import { meteredWebSocket } from "./capacity-transport";
import { createServerMetrics } from "./capacity-server-metrics";

// SDK diagnostics can carry transport URLs or private rows. This harness emits
// only explicitly constructed aggregates, even on failures.
let suppressedDiagnostics = 0;
console.log =
  console.warn =
  console.error =
    () => {
      suppressedDiagnostics++;
    };
function emit(value: unknown) {
  process.stdout.write(JSON.stringify(value) + "\n");
}
function required(key: string) {
  const value = process.env[key];
  if (!value) throw Error("CAPACITY_ENVIRONMENT");
  return value;
}
const host = required("SIDEREAL_SMOKE_URL"),
  database = required("SIDEREAL_SMOKE_DATABASE");
const evidence = required("SIDEREAL_SMOKE_EVIDENCE_DIR");
const population = validatePopulation(
  Number(required("SIDEREAL_CAPACITY_CLIENTS")),
);
const bindingsFile = resolve(required("SIDEREAL_IFCS_TEST_BINDINGS"));
const bindingsPath = resolve(bindingsFile, "..");
if (
  !database.endsWith("-smoke") ||
  !bindingsPath.startsWith(resolve(evidence) + "/")
)
  throw Error("CAPACITY_TARGET");
const fixture = (await import(pathToFileURL(bindingsFile).href)) as {
  DbConnection: typeof import("../packages/net/src/generated").DbConnection;
  tables: typeof import("../packages/net/src/generated").tables;
};
const serverMetrics = createServerMetrics(
  host,
  new Set([
    ...gameViewKeys().map((key) =>
      key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
    ),
    "own_world_admission",
    "visible_ship_motion",
    "visible_ship_descriptions",
    "visible_body_motion",
    "visible_body_descriptions",
    "own_capacity_input",
  ]),
);
type InputEvidence = {
  characterId: string;
  sequence: bigint;
  leaseSequence: bigint;
  leaseHeld: boolean;
};
type Connection = DbConnection & {
  reducers: DbConnection["reducers"] & {
    smokeCapacityInstallHost(args: { index: number }): Promise<void>;
    smokeCapacityJoinPassenger(args: {
      hostShipId: string;
      slot: number;
    }): Promise<void>;
    smokeCapacityAssert(args: { clients: number }): Promise<void>;
  };
  db: DbConnection["db"] & {
    ownCapacityInput: { iter(): Iterable<InputEvidence> };
  };
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function wait(check: () => boolean, code: string, timeout = 30_000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (check()) return;
    await sleep(10);
  }
  throw Error(code);
}
async function deadline<T>(
  promise: Promise<T>,
  code: string,
  timeout = 30_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error(code)), timeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
function one<T>(rows: Iterable<T>, code = "CAPACITY_ONE_ROW"): T {
  const list = [...rows];
  if (list.length !== 1) throw Error(code);
  return list[0];
}
type Client = {
  connection: Connection;
  resources: ReturnType<typeof createConnectionResources>;
  shared: ReturnType<typeof bindSharedWorld>;
  token: string;
  identity: string;
  bytes: ReturnType<typeof byteCounters>;
  sequence: bigint;
  actorHandle: ReturnType<
    ReturnType<DbConnection["subscriptionBuilder"]>["subscribe"]
  >;
  actorMs: number;
  socketMs: number;
  coverageMs: number;
  dispose(): void;
};
const all = new Set<Client>();
const lifetimeBytes: ReturnType<typeof byteCounters>[] = [];
let phase = "bootstrap",
  operation = 0,
  subscriptionErrors = 0;
const report: Record<string, unknown> = {
  schemaVersion: 1,
  status: "running",
  sourceBase: "e749d5d877ef18ac7421fb003f55effd7e01a404",
  candidateDriverManifestSha256: required("SIDEREAL_CAPACITY_DRIVER_SHA256"),
  population,
  scope:
    "Node SDK; 57 actor views +1 fixture input ack plus production spatial binder; Wren-only fixture passenger qualification",
  compression: "gzip",
  network:
    "same-host loopback; payload bytes exclude WebSocket/TCP/TLS/HTTP headers",
  fixtureBoundary:
    "Personal kits/host install/normal origin boarding are real; other passengers have unavailable source-return relations. No production qualification or cap changes.",
  host: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    availableParallelism: availableParallelism(),
    memoryBytes: totalmem(),
    node: process.version,
    sdk: "2.10.2",
  },
  phases: [],
};
function safeTextFile(path: string) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}
(report.host as Record<string, unknown>).cgroupCpuMax = safeTextFile(
  "/sys/fs/cgroup/cpu.max",
);
(report.host as Record<string, unknown>).cgroupMemoryMax = safeTextFile(
  "/sys/fs/cgroup/memory.max",
);

async function connect(token?: string, hydrate = false): Promise<Client> {
  const bytes = byteCounters(),
    resources = createConnectionResources();
  lifetimeBytes.push(bytes);
  const start = performance.now();
  let actorApplied = false,
    inputApplied = false,
    socketMs = 0,
    actorMs = 0;
  let actorHandle!: Client["actorHandle"];
  let saved = "",
    identity = "",
    shared: ReturnType<typeof bindSharedWorld> | undefined,
    failed = false;
  const connection = fixture.DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .withWSFn(meteredWebSocket(bytes))
    .onConnect(async (raw, i, t) => {
      try {
        socketMs = performance.now() - start;
        saved = token ?? t;
        identity = i.toHexString();
        const c = raw as Connection;
        if (hydrate)
          await c.reducers.enterLab({ name: "Capacity returning actor" });
        shared = bindSharedWorld({
          connection: c,
          resources,
          onError: () => {
            subscriptionErrors++;
            failed = true;
          },
        });
        const actorStart = performance.now();
        actorHandle = c
          .subscriptionBuilder()
          .onApplied(() => {
            actorMs = performance.now() - actorStart;
            actorApplied = resources.applied(actorHandle);
          })
          .onError(() => {
            subscriptionErrors++;
            failed = true;
          })
          .subscribe(gameViewKeys().map((key) => fixture.tables[key]));
        resources.retain("game", actorHandle);
        const inputHandle = c
          .subscriptionBuilder()
          .onApplied(() => {
            inputApplied = resources.applied(inputHandle);
          })
          .onError(() => {
            subscriptionErrors++;
            failed = true;
          })
          .subscribe("SELECT * FROM own_capacity_input");
        resources.retain("fixture-input", inputHandle);
      } catch {
        failed = true;
      }
    })
    .onConnectError(() => {
      failed = true;
    })
    .build() as Connection;
  try {
    await wait(
      () => failed || (!!shared && actorApplied && inputApplied),
      "CAPACITY_CONNECT_TIMEOUT",
    );
    if (failed || !shared) throw Error("CAPACITY_CONNECT_FAILED");
    const client: Client = {
      connection,
      resources,
      shared,
      token: saved,
      identity,
      bytes,
      sequence: 0n,
      actorHandle,
      actorMs,
      socketMs,
      coverageMs: 0,
      dispose() {
        resources.dispose();
        connection.disconnect();
        all.delete(client);
      },
    };
    all.add(client);
    return client;
  } catch {
    resources.dispose();
    connection.disconnect();
    throw Error("CAPACITY_CONNECT_FAILED");
  }
}
const actor = (client: Client) =>
  one(client.connection.db.ownCharacters.iter(), "CAPACITY_CHARACTER_ROW");
const location = (client: Client) =>
  one(
    client.connection.db.ownConstructionLocation.iter(),
    "CAPACITY_LOCATION_ROW",
  );
const admission = (client: Client) =>
  one(client.connection.db.ownWorldAdmission.iter(), "CAPACITY_ADMISSION_ROW");
async function coverage(client: Client) {
  const started = performance.now();
  await wait(() => {
    const s = client.shared.subscriptions.getState(),
      snap = client.shared.store.getSnapshot();
    return (
      s.running &&
      s.pending === 0 &&
      s.cellSets === 1 &&
      snap.admission.length === 1 &&
      snap.shipMotion.length === population.canonicalShips
    );
  }, "CAPACITY_SPATIAL_COVERAGE");
  client.coverageMs = performance.now() - started;
}
async function grant(owner: Client, guest: Client, op: string) {
  const a = actor(owner),
    i = one(
      owner.connection.db.ownConstructionInstances.iter(),
      "CAPACITY_HOST_INSTANCE_ROW",
    ),
    f = one(
      owner.connection.db.ownAuthoredFlights.iter(),
      "CAPACITY_HOST_FLIGHT_ROW",
    );
  await owner.connection.reducers.grantShipPassenger({
    shipId: a.shipId,
    granteeId: actor(guest).id,
    expectedInstanceRevision: i.revision,
    expectedFlightRevision: f.revision,
    durationSeconds: 3600,
    operationId: op,
  });
  await wait(
    () =>
      [...guest.connection.db.ownPassengerGrants.iter()].some(
        (g) => g.shipId === a.shipId,
      ),
    "CAPACITY_GRANT_APPLY",
  );
  return one(
    [...guest.connection.db.ownPassengerGrants.iter()].filter(
      (g) => g.shipId === a.shipId,
    ),
  );
}
async function normalBoard(
  guest: Client,
  grantRow: { id: string; revision: bigint; shipId: string },
) {
  const l = location(guest),
    m = admission(guest);
  await guest.connection.reducers.boardShipPassenger({
    grantId: grantRow.id,
    expectedGrantRevision: grantRow.revision,
    expectedVisitId: l.visitId,
    expectedLocationRevision: l.revision,
    expectedAdmissionRevision: m.revision,
    operationId: `capacity-board-${++operation}`,
  });
  await wait(() => {
    const interior = [
        ...guest.connection.db.currentPassengerInterior.iter(),
      ][0],
      nextLocation = [...guest.connection.db.ownConstructionLocation.iter()][0],
      nextAdmission = [...guest.connection.db.ownWorldAdmission.iter()][0],
      visit = [...guest.connection.db.ownPassengerVisit.iter()][0];
    return (
      !!interior &&
      interior.characterId === actor(guest).id &&
      interior.shipId === grantRow.shipId &&
      actor(guest).shipId === grantRow.shipId &&
      nextLocation?.instanceId === interior.shipId &&
      nextLocation.revision > l.revision &&
      nextAdmission?.shipId === interior.shipId &&
      nextAdmission.revision > m.revision &&
      visit?.admitted &&
      visit.grantId === grantRow.id &&
      visit.shipId === interior.shipId
    );
  }, "CAPACITY_BOARD_APPLY");
}
function verifyPrivacy(clients: Client[], hosts: Client[]) {
  const characterIds = new Set(clients.map((c) => actor(c).id)),
    identities = new Set(clients.map((c) => c.identity));
  if (
    characterIds.size !== population.clients ||
    identities.size !== population.clients
  )
    throw Error("CAPACITY_DISTINCT_ACTORS");
  const inventories = clients.map(
    (c) =>
      new Set([...c.connection.db.ownInventoryItems.iter()].map((i) => i.id)),
  );
  for (let n = 0; n < clients.length; n++) {
    const c = clients[n],
      a = actor(c),
      l = location(c),
      m = admission(c),
      crew = [...c.connection.db.currentInteriorCrew.iter()];
    const expectedCrew = new Set(
      clients
        .filter((other) => actor(other).shipId === a.shipId)
        .map((other) => actor(other).id),
    );
    if (
      !a.connected ||
      l.instanceId !== a.shipId ||
      m.shipId !== a.shipId ||
      crew.length !== 5 ||
      expectedCrew.size !== 5 ||
      new Set(crew.map((row) => row.characterId)).size !== 5 ||
      crew.some(
        (row) => row.shipId !== a.shipId || !expectedCrew.has(row.characterId),
      )
    )
      throw Error("CAPACITY_CREW_RELATION");
    const expected = hosts.includes(c)
      ? 1
      : c === clients[population.hosts]
        ? 1
        : 0;
    if ([...c.connection.db.ownShips.iter()].length !== expected)
      throw Error("CAPACITY_PRIVATE_SHIPS");
    if (inventories[n].size === 0) throw Error("CAPACITY_PERSONAL_KIT");
    for (let j = 0; j < inventories.length; j++)
      if (j !== n && [...inventories[n]].some((id) => inventories[j].has(id)))
        throw Error("CAPACITY_PRIVATE_INVENTORY");
    if (
      !hosts.includes(c) &&
      one(c.connection.db.ownPassengerVisit.iter()).recoveryReason
    )
      throw Error("CAPACITY_PASSENGER_RECOVERY");
  }
  return {
    distinctPrincipals: identities.size,
    distinctCharacters: characterIds.size,
    crews: hosts.length,
    crewSize: 5,
    privateInventoryDisjoint: true,
  };
}
async function staleLeaseOracle(client: Client) {
  const shadow = await connect(client.token, true);
  try {
    await shadow.connection.reducers.claimInputControl({});
    await wait(
      () => one(shadow.connection.db.ownCapacityInput.iter()).leaseHeld,
      "CAPACITY_SHADOW_LEASE",
    );
    const before = one(shadow.connection.db.ownCapacityInput.iter()).sequence;
    const lease = one(
      shadow.connection.db.ownCapacityInput.iter(),
    ).leaseSequence;
    await wait(() => {
      const own = one(client.connection.db.ownCapacityInput.iter());
      return own.sequence === before && own.leaseSequence === lease;
    }, "CAPACITY_LEASE_BASELINE");
    await client.connection.reducers.setIntent({
      sequence: before + 1n,
      throttle: 0,
      turn: 0,
      dx: 0.1,
      dy: 0,
      sprint: false,
    });
    // The SDK applies the issuing socket's Ok.transactionUpdate before the
    // reducer promise resolves; a delayed shadow projection cannot hide a write.
    if (one(client.connection.db.ownCapacityInput.iter()).sequence !== before)
      throw Error("CAPACITY_STALE_LEASE_ACCEPTED");
    await shadow.connection.reducers.setIntent({
      sequence: before + 1n,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await wait(
      () =>
        one(shadow.connection.db.ownCapacityInput.iter()).sequence ===
        before + 1n,
      "CAPACITY_CURRENT_LEASE_REJECTED",
    );
    report.inputLeaseOracle = {
      staleSocketNoOp: true,
      currentSocketAccepted: true,
      extraSamePrincipalSocketOutsideTiming: true,
    };
  } finally {
    shadow.dispose();
  }
}

async function privateBaseDenied(client: Client) {
  let denied = false,
    applied = false;
  const handle = client.connection
    .subscriptionBuilder()
    .onError(() => {
      denied = true;
    })
    .onApplied(() => {
      applied = true;
    })
    .subscribe("SELECT * FROM character");
  await wait(() => denied || applied, "CAPACITY_BASE_DENIAL_TIMEOUT");
  if (applied) {
    handle.unsubscribe();
    throw Error("CAPACITY_PRIVATE_BASE_EXPOSED");
  }
}
function phaseMetrics(
  clients: Client[],
  before: ReturnType<typeof byteCounters>[],
  elapsedMs: number,
) {
  const rows = clients.map((c, i) => deltaCounters(c.bytes, before[i]));
  const total = byteCounters();
  for (const row of rows)
    for (const key of Object.keys(total) as (keyof typeof total)[])
      total[key] += row[key];
  return {
    elapsedMs,
    total,
    perClientIncomingPayloadBytes: distribution(
      rows.map((r) => r.incomingPayloadBytes),
    ),
    incomingPayloadBytesPerSecond:
      total.incomingPayloadBytes / (elapsedMs / 1000),
  };
}
const phaseRows = report.phases as Record<string, unknown>[];
async function coldActorApply(clients: Client[]) {
  phase = "populated-actor-view-reapply";
  const before = clients.map((c) => ({ ...c.bytes })),
    times: number[] = [],
    start = performance.now();
  await deadline(
    Promise.all(
      clients.map(async (c) => {
        await new Promise<void>((done) =>
          c.actorHandle.unsubscribeThen(() => done()),
        );
        c.resources.remove("game");
        const t = performance.now();
        await new Promise<void>((done, reject) => {
          c.actorHandle = c.connection
            .subscriptionBuilder()
            .onApplied(() => {
              if (!c.resources.applied(c.actorHandle)) {
                reject(Error("CAPACITY_REAPPLY_DISPOSED"));
                return;
              }
              times.push(performance.now() - t);
              done();
            })
            .onError(() => reject(Error("CAPACITY_REAPPLY_FAILED")))
            .subscribe(gameViewKeys().map((key) => fixture.tables[key]));
          c.resources.retain("game", c.actorHandle);
        });
      }),
    ),
    "CAPACITY_REAPPLY_TIMEOUT",
  );
  phaseRows.push({
    name: phase,
    actorViewApplyMs: distribution(times),
    sameSocket: true,
    worldBinderRetained: true,
    ...phaseMetrics(clients, before, performance.now() - start),
  });
}

async function idle(clients: Client[]) {
  phase = "warm-idle";
  const before = clients.map((c) => ({ ...c.bytes })),
    start = performance.now();
  await sleep(5000);
  phaseRows.push({
    name: phase,
    ...phaseMetrics(clients, before, performance.now() - start),
  });
}
async function walking(clients: Client[]) {
  phase = "walking";
  for (const c of clients) {
    await c.connection.reducers.claimInputControl({});
    c.sequence = one(c.connection.db.ownCapacityInput.iter()).sequence;
  }
  await wait(
    () =>
      clients.every(
        (c) => one(c.connection.db.ownCapacityInput.iter()).leaseHeld,
      ),
    "CAPACITY_LEASE_READY",
  );
  const before = clients.map((c) => ({ ...c.bytes })),
    origins = clients.map((c) => ({ ...actor(c) }));
  const maximumDisplacement = clients.map(() => 0);
  const movementListeners = clients.map((c, i) => {
    const observed = () => {
      const a = actor(c);
      maximumDisplacement[i] = Math.max(
        maximumDisplacement[i],
        Math.hypot(a.localX - origins[i].localX, a.localY - origins[i].localY),
      );
    };
    c.connection.db.ownCharacters.onUpdate(observed);
    return () => c.connection.db.ownCharacters.removeOnUpdate(observed);
  });
  const rtt: number[] = [],
    accepted: number[] = [],
    outstanding = new Set<Client>();
  const counts = {
    scheduled: 0,
    attempted: 0,
    confirmed: 0,
    errors: 0,
    timeouts: 0,
    skipped: 0,
  };
  const pending: Promise<void>[] = [];
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const start = performance.now(),
    periodMs = 200,
    durationMs = 10_000;
  const offer = async (c: Client, tick: number) => {
    outstanding.add(c);
    counts.attempted++;
    const sequence = ++c.sequence,
      t = performance.now();
    try {
      await c.connection.reducers.setIntent({
        sequence,
        throttle: 0,
        turn: 0,
        dx: tick % 20 < 10 ? 0.15 : -0.15,
        dy: 0,
        sprint: false,
      });
      rtt.push(performance.now() - t);
      await wait(
        () =>
          one(c.connection.db.ownCapacityInput.iter()).sequence === sequence,
        "CAPACITY_INPUT_CONFIRM",
        5000,
      );
      counts.confirmed++;
      accepted.push(performance.now() - t);
    } catch (e) {
      if (e instanceof Error && e.message === "CAPACITY_INPUT_CONFIRM")
        counts.timeouts++;
      else counts.errors++;
    } finally {
      outstanding.delete(c);
    }
  };
  for (let tick = 0; tick < durationMs / periodMs; tick++) {
    const deadline = start + tick * periodMs;
    await sleep(Math.max(0, deadline - performance.now()));
    for (const c of clients) {
      counts.scheduled++;
      if (outstanding.has(c)) {
        counts.skipped++;
        continue;
      }
      pending.push(offer(c, tick));
    }
  }
  await sleep(Math.max(0, start + durationMs - performance.now()));
  await Promise.all(pending);
  for (const c of clients)
    await c.connection.reducers.setIntent({
      sequence: ++c.sequence,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
  for (const remove of movementListeners) remove();
  const moved = maximumDisplacement.filter((value) => value > 1e-5).length;
  loop.disable();
  phaseRows.push({
    name: phase,
    offeredHzPerClient: 5,
    plannedDurationMs: durationMs,
    counts,
    reducerRoundTripMs: distribution(rtt),
    sendToSequenceConfirmationMs: distribution(accepted),
    actorsWithObservedDisplacement: moved,
    actorsWithoutObservedDisplacement: clients.length - moved,
    maximumDisplacementMetres: distribution(maximumDisplacement),
    eventLoopLagMs: {
      p95: loop.percentile(95) / 1e6,
      p99: loop.percentile(99) / 1e6,
      max: loop.max / 1e6,
    },
    ...phaseMetrics(clients, before, performance.now() - start),
  });
  const qualified = !(
    counts.errors ||
    counts.timeouts ||
    counts.skipped ||
    counts.confirmed !== counts.scheduled ||
    moved !== clients.length
  );
  report.offeredWalkingLoadQualified = qualified;
  // Collect independent recovery/privacy evidence even if backpressure prevents
  // this offered rate. The final result still fails the workload acceptance gate.
}
async function reconnect(clients: Client[]) {
  phase = "reconnect";
  const previous = clients.map((c, i) => ({
    token: c.token,
    id: actor(c).id,
    shipId: actor(c).shipId,
    ownedShipIds: [...c.connection.db.ownShips.iter()].map((s) => s.id),
    locationRevision: i === population.hosts ? location(c).revision : 0n,
    admissionRevision: i === population.hosts ? admission(c).revision : 0n,
    client: c,
  }));
  for (const c of clients) c.dispose();
  await sleep(1000);
  const fresh: Client[] = [];
  const start = performance.now();
  for (let i = 0; i < previous.length; i += 10)
    fresh.push(
      ...(await Promise.all(
        previous.slice(i, i + 10).map((c) => connect(c.token, true)),
      )),
    );
  await wait(
    () =>
      fresh.every((c, i) => {
        const a = [...c.connection.db.ownCharacters.iter()][0],
          m = [...c.connection.db.ownWorldAdmission.iter()][0],
          v = [...c.connection.db.ownPassengerVisit.iter()][0];
        if (!a?.connected) return false;
        if (i < population.hosts) return m?.shipId === previous[i].shipId;
        if (i === population.hosts) {
          const l = [...c.connection.db.ownConstructionLocation.iter()][0];
          return (
            (m?.shipId === previous[i].ownedShipIds[0] &&
              !v &&
              l?.instanceId === previous[i].ownedShipIds[0] &&
              l.revision > previous[i].locationRevision &&
              m.revision > previous[i].admissionRevision) ||
            (!!v?.admitted &&
              !v.recoveryReason &&
              m?.shipId === previous[i].shipId)
          );
        }
        return (
          !!v &&
          (v.admitted
            ? !v.recoveryReason && m?.shipId === previous[i].shipId
            : !!v.recoveryReason && !m)
        );
      }),
    "CAPACITY_RECONNECT_RECOVERY",
  );
  const resumed = fresh.filter(
    (c, i) =>
      i > population.hosts &&
      one(c.connection.db.ownPassengerVisit.iter()).admitted,
  );
  const blocked = fresh.filter(
    (c, i) =>
      i > population.hosts &&
      !one(c.connection.db.ownPassengerVisit.iter()).admitted,
  );
  const normalReturned =
    [...fresh[population.hosts].connection.db.ownPassengerVisit.iter()]
      .length === 0;
  const blockedPrivateRows = Object.fromEntries(
    [
      "currentPassengerInterior",
      "currentInteriorCrew",
      "visibleCrewPresentation",
      "ownConstructionInstances",
      "ownAuthoredFlights",
      "visibleShipLogic",
    ].map((key) => [
      key,
      distribution(
        blocked.map(
          (c) =>
            [
              ...(
                c.connection.db[key as keyof Connection["db"]] as {
                  iter(): Iterable<unknown>;
                }
              ).iter(),
            ].length,
        ),
      ),
    ]),
  );
  report.blockedRecoveryPrivateRows = blockedPrivateRows;
  await Promise.all(
    [...fresh.slice(0, population.hosts + 1), ...resumed].map(coverage),
  );
  for (let i = 0; i < fresh.length; i++) {
    const old = previous[i],
      next = fresh[i],
      snap = old.client.shared.store.getSnapshot();
    if (
      actor(next).id !== old.id ||
      actor(next).shipId !==
        (i === population.hosts && normalReturned
          ? old.ownedShipIds[0]
          : old.shipId) ||
      next.identity !== old.client.identity ||
      old.client.shared.subscriptions.getState().running ||
      snap.admission.length ||
      snap.shipMotion.length
    )
      throw Error("CAPACITY_RECONNECT_IDENTITY");
    if (i <= population.hosts || resumed.includes(next)) {
      if (i > population.hosts || (i === population.hosts && !normalReturned)) {
        const interior = one(
          next.connection.db.currentPassengerInterior.iter(),
        );
        if (
          interior.shipId !== old.shipId ||
          location(next).instanceId !== old.shipId ||
          admission(next).shipId !== old.shipId
        )
          throw Error("CAPACITY_RESUMED_PASSENGER_RELATION");
      }
      await next.connection.reducers.claimInputControl({});
    } else {
      const c = next.connection;
      if (
        [...c.db.currentPassengerInterior.iter()].length ||
        [...c.db.currentInteriorCrew.iter()].length ||
        [...c.db.visibleCrewPresentation.iter()].length ||
        [...c.db.ownConstructionInstances.iter()].length ||
        [...c.db.ownAuthoredFlights.iter()].length ||
        [...c.db.visibleShipLogic.iter()].length
      )
        throw Error("CAPACITY_RECOVERY_PRIVACY");
      const l = [...c.db.ownConstructionLocation.iter()][0];
      if (l && l.instanceId !== old.shipId)
        throw Error("CAPACITY_RECOVERY_PHYSICAL_FRAME");
    }
  }
  if (!blocked.includes(fresh[population.hosts + 1]))
    throw Error("CAPACITY_REVOKED_RECONNECT_ACCESS");
  phaseRows.push({
    name: phase,
    elapsedMs: performance.now() - start,
    batchSize: 10,
    disconnectGapMs: 1000,
    recoveredOwnedContexts: population.hosts + (normalReturned ? 1 : 0),
    acceptedOwnerOrNormalActorContexts: population.hosts + 1,
    normallyReturnedPassenger: normalReturned ? 1 : 0,
    normallyResumedPassenger: normalReturned ? 0 : 1,
    syntheticBlockedRecovery: blocked.length,
    syntheticAuthorizedResume: resumed.length,
    preRevokedSynthetic: 1,
    newlyBlockedSynthetic: blocked.length - 1,
    socketMs: distribution(fresh.map((c) => c.socketMs)),
    actorViewApplyMs: distribution(fresh.map((c) => c.actorMs)),
    coverageAfterAllSocketsMs: distribution(
      [...fresh.slice(0, population.hosts + 1), ...resumed].map(
        (c) => c.coverageMs,
      ),
    ),
    incomingPayloadBytes: distribution(
      fresh.map((c) => c.bytes.incomingPayloadBytes),
    ),
    sameIdentityAndCharacter: true,
    oldPresentationEmpty: true,
  });
  return fresh;
}
try {
  emit({
    capacity: "starting",
    clients: population.clients,
    scope: "SDK replication baseline",
  });
  const clients: Client[] = [];
  for (let i = 0; i < population.clients; i += 10)
    clients.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(10, population.clients - i) }, () =>
          connect(),
        ),
      )),
    );
  for (let n = 0; n < clients.length; n++)
    await clients[n].connection.reducers.enterLab({
      name: `Capacity actor ${n}`,
    });
  await wait(
    () =>
      clients.every(
        (c) => [...c.connection.db.ownCharacters.iter()].length === 1,
      ),
    "CAPACITY_CHARACTERS",
  );
  const hosts = clients.slice(0, population.hosts),
    guests = clients.slice(population.hosts);
  for (let n = 0; n < hosts.length; n++) {
    await hosts[n].connection.reducers.smokeCapacityInstallHost({ index: n });
    await wait(
      () =>
        [...hosts[n].connection.db.ownConstructionLocation.iter()].length ===
          1 &&
        [...hosts[n].connection.db.ownAuthoredFlights.iter()].length === 1,
      "CAPACITY_HOST_READY",
    );
  }
  const recovery = guests[0];
  await recovery.connection.reducers.smokeCapacityInstallHost({ index: 20 });
  await wait(
    () =>
      [...recovery.connection.db.ownConstructionLocation.iter()].length === 1 &&
      [...recovery.connection.db.ownWorldAdmission.iter()].length === 1 &&
      [...recovery.connection.db.ownAuthoredFlights.iter()].length === 1,
    "CAPACITY_ORIGIN_READY",
  );
  phase = "normal-boarding-recovery";
  const originShip = actor(recovery).shipId;
  const firstGrant = await grant(
    hosts[0],
    recovery,
    `capacity-grant-${++operation}`,
  );
  phase = "normal-first-board";
  await normalBoard(recovery, firstGrant);
  const boardedLocation = location(recovery),
    boardedAdmission = admission(recovery);
  phase = "normal-revoke-return";
  await hosts[0].connection.reducers.revokeShipPassenger({
    grantId: firstGrant.id,
    expectedRevision: firstGrant.revision,
    operationId: `capacity-revoke-${++operation}`,
  });
  await wait(
    () =>
      actor(recovery).shipId === originShip &&
      [...recovery.connection.db.currentPassengerInterior.iter()].length === 0,
    "CAPACITY_NORMAL_RETURN",
  );
  await wait(() => {
    const l = [...recovery.connection.db.ownConstructionLocation.iter()][0],
      m = [...recovery.connection.db.ownWorldAdmission.iter()][0];
    return (
      l?.instanceId === originShip &&
      m?.shipId === originShip &&
      l.revision > boardedLocation.revision &&
      m.revision > boardedAdmission.revision &&
      [...recovery.connection.db.ownPassengerVisit.iter()].length === 0
    );
  }, "CAPACITY_COHERENT_RETURN");
  const second = await grant(
    hosts[0],
    recovery,
    `capacity-grant-${++operation}`,
  );
  phase = "normal-second-board";
  await normalBoard(recovery, second);
  report.normalBoardingRecovery = {
    passed: true,
    productionReducers: true,
    pinnedFixtureQualification: true,
  };
  for (let n = 1; n < guests.length; n++) {
    const owner = hosts[Math.floor(n / 4)],
      g = guests[n];
    await grant(owner, g, `capacity-grant-${++operation}`);
    await g.connection.reducers.smokeCapacityJoinPassenger({
      hostShipId: actor(owner).shipId,
      slot: n % 4,
    });
  }
  await wait(
    () =>
      clients.every(
        (c) => [...c.connection.db.currentInteriorCrew.iter()].length === 5,
      ),
    "CAPACITY_CREW_APPLY",
  );
  await hosts[0].connection.reducers.smokeCapacityAssert({
    clients: population.clients,
  });
  await Promise.all(clients.map(coverage));
  report.populationOracle = verifyPrivacy(clients, hosts);
  await privateBaseDenied(clients[0]);
  const outsider = await connect();
  if (
    [...outsider.connection.db.ownCharacters.iter()].length ||
    [...outsider.connection.db.currentInteriorCrew.iter()].length ||
    [...outsider.connection.db.ownInventoryItems.iter()].length
  )
    throw Error("CAPACITY_OUTSIDER");
  outsider.dispose();
  report.privacyOracle = {
    ownCharacterAndAdmission: true,
    crewComplete: true,
    privateBaseDenied: true,
    outsiderEmpty: true,
    personalInventoryDisjoint: true,
  };
  await serverMetrics.measure("populated-actor-view-reapply", () =>
    coldActorApply(clients),
  );
  verifyPrivacy(clients, hosts);
  await staleLeaseOracle(clients[0]);
  await serverMetrics.measure("warm-idle", () => idle(clients));
  await serverMetrics.measure("walking", () => walking(clients));
  phase = "revocation-fail-closed";
  const synthetic = clients[population.hosts + 1],
    host0 = clients[0],
    visit = one(synthetic.connection.db.ownPassengerVisit.iter());
  const revoke = one(
    [...host0.connection.db.ownPassengerGrants.iter()].filter(
      (g) => g.id === visit.grantId,
    ),
  );
  if (
    one(synthetic.connection.db.currentPassengerInterior.iter()).shipId !==
      actor(host0).shipId ||
    !visit.admitted
  )
    throw Error("CAPACITY_REVOKE_PRECONDITION");
  await host0.connection.reducers.revokeShipPassenger({
    grantId: revoke.id,
    expectedRevision: revoke.revision,
    operationId: `capacity-revoke-${++operation}`,
  });
  await wait(
    () =>
      [...synthetic.connection.db.currentPassengerInterior.iter()].length ===
        0 &&
      [...synthetic.connection.db.currentInteriorCrew.iter()].length === 0 &&
      [...synthetic.connection.db.visibleCrewPresentation.iter()].length ===
        0 &&
      [...synthetic.connection.db.ownConstructionInstances.iter()].length ===
        0 &&
      [...synthetic.connection.db.visibleShipLogic.iter()].length === 0,
    "CAPACITY_REVOKE_PRIVACY",
  );
  report.revocationOracle = {
    syntheticReturnUnavailable: true,
    interiorCrewPresentationGeometryAndLogicRemoved: true,
  };
  await serverMetrics.measure("reconnect", () => reconnect(clients));
  if (subscriptionErrors) throw Error("CAPACITY_SUBSCRIPTION_ERRORS");
  if (lifetimeBytes.some((c) => c.decodeErrors || c.deliveryInversions))
    throw Error("CAPACITY_TRANSPORT_CORRECTNESS");
  if (!report.offeredWalkingLoadQualified) {
    report.status = "failed";
    report.failedPhase = "walking";
    report.failure = "CAPACITY_OFFERED_LOAD_NOT_SUSTAINED";
    process.exitCode = 1;
  } else report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failedPhase = phase;
  report.failure =
    error instanceof Error && /^CAPACITY_[A-Z_]+$/.test(error.message)
      ? error.message
      : "CAPACITY_OPERATION_REJECTED";
  process.exitCode = 1;
} finally {
  report.serverMetrics = serverMetrics.reports;
  report.serverDiagnosisQualified =
    serverMetrics.reports.length === 4 &&
    serverMetrics.reports.every((row) => row.qualified);
  const lifetime = byteCounters();
  for (const row of lifetimeBytes)
    for (const key of Object.keys(lifetime) as (keyof typeof lifetime)[])
      lifetime[key] += row[key];
  report.lifetimeTransport = lifetime;
  report.finalClientState = {
    clients: all.size,
    admissionRows: distribution(
      [...all].map((c) => [...c.connection.db.ownWorldAdmission.iter()].length),
    ),
    passengerRecoveryBlocked: [...all].filter((c) =>
      [...c.connection.db.ownPassengerVisit.iter()].some(
        (v) => !!v.recoveryReason,
      ),
    ).length,
    admittedPassengers: [...all].filter((c) =>
      [...c.connection.db.ownPassengerVisit.iter()].some((v) => v.admitted),
    ).length,
    runningBinders: [...all].filter(
      (c) => c.shared.subscriptions.getState().running,
    ).length,
  };
  report.subscriptionErrors = subscriptionErrors;
  report.suppressedSdkDiagnostics = suppressedDiagnostics;
  for (const c of [...all]) c.dispose();
  writeFileSync(
    join(evidence, "capacity-result.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  emit({
    capacity: report.status,
    clients: population.clients,
    failedPhase: report.failedPhase,
    failure: report.failure,
  });
}
