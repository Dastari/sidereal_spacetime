/** Isolated in-place prefab upgrade rehearsal, post-publication half. Run through
 * `npm run smoke:ship-upgrade -- --label <label> [--baseline-ref <ref>]`
 * (scripts/ship_wipe_rehearsal.py --smoke upgrade), never against a live database.
 *
 * The database was seeded under a prefab-era baseline module (scripts/ship-wipe-seed.ts: the
 * operator assigned the baseline's pinned Wren to the first account, which dropped a scanner on
 * its deck) and then upgraded in place to this module. This script runs the operator runbook
 * exactly as documented:
 *   1. stock the owner's Wren: hold crate (uniforms-and-tiers, 18) and wall locker (role-sets, 27);
 *   2. export a backup, dry-run and apply `operator_upgrade_prefab_ship`, verify against the backup;
 *      then (r8+) stock the EVA suit into the new suit locker socket with scripts/ship_cargo.py;
 *   3. as the owner: same ship id, target pins, walk from spawn to every container and see every
 *      item, see the ground drop, reach the suit locker from the inside airlock button, take the
 *      helm and fly.
 * Evidence: ship-upgrade-smoke.json in SIDEREAL_SMOKE_EVIDENCE_DIR. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabById } from "../packages/content/src/prefabs/index";
import { prefabStats } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import { prefabCargoSockets } from "../packages/sim/src/prefab-cargo-sockets";
import { shipLogicModel } from "../packages/sim/src/ship-logic-model";
import { CREW_WARDROBE_KITS } from "../packages/content/src/crew-wardrobe";
import {
  FED_WREN_PIN,
  PREFAB_UPGRADE_SOURCES,
  WREN_SUIT_LOCKER_SOCKET,
} from "../packages/world/src/prefab-ship-pins";

const host = process.env.SIDEREAL_SMOKE_URL ?? "";
const database = process.env.SIDEREAL_SMOKE_DATABASE ?? "";
const evidenceDirectory = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? ".runtime";
if (!host || !database.endsWith("-smoke"))
  throw Error("Ship upgrade smoke requires an isolated -smoke database");
if (new URL(host).port === "3100")
  throw Error("Refusing to rehearse on the live server port");
const seed = JSON.parse(
  readFileSync(join(evidenceDirectory, "ship-wipe-seed.json"), "utf8"),
) as {
  database: string;
  baseline?: "prefab" | "wayfarer";
  accounts: {
    prefabId?: string;
    blueprintSha256?: string;
    name: string;
    token: string;
    characterId: string;
    shipId: string;
    groundItemId?: string;
  }[];
};
if (seed.database !== database)
  throw Error("Seed evidence belongs to another database");
if (seed.baseline !== "prefab")
  throw Error("The upgrade rehearsal needs a prefab-era baseline");
const owner = seed.accounts[0]!;
const source = PREFAB_UPGRADE_SOURCES.find(
  (p) => p.blueprintSha256 === owner.blueprintSha256,
);
assert(source, `seeded Wren ${owner.blueprintSha256} is an upgrade source`);

const wait = async (fn: () => boolean, message: string, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + message);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function client(token?: string) {
  let ready = false;
  const connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c) => {
      c.subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownGameShipAccess,
          tables.ownConstructionLocation,
          tables.ownWorldAdmission,
          tables.ownInventoryState,
          tables.ownInventoryItems,
          tables.ownGroundItems,
          tables.ownReachableCargoContainers,
          tables.ownReachableCargoItems,
          tables.ownStations,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightPhysics,
          tables.ownAuthoredFlightActuators,
          tables.visibleShipLogic,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  return connection;
}
const python = (script: string, ...args: string[]) =>
  execFileSync(
    "python3",
    [
      `scripts/${script}`,
      args[0]!,
      "--server",
      host,
      "--database",
      database,
      ...args.slice(1),
    ],
    { encoding: "utf8" },
  );
const json = (text: string) => JSON.parse(text.slice(text.indexOf("{")));
const sqlRows = (query: string) => {
  const out = execFileSync(
    ".tools/spacetime/spacetime",
    [
      "--root-dir=.tools/spacetime",
      "sql",
      "--server",
      host,
      "--yes",
      "--no-config",
      "--format",
      "json",
      database,
      query,
    ],
    { encoding: "utf8" },
  );
  const payload = JSON.parse(out.slice(out.indexOf("["))) as {
    schema: { elements: { name: { some?: string } }[] };
    rows: unknown[][];
  }[];
  return payload.flatMap((r) =>
    r.rows.map((row) =>
      Object.fromEntries(
        r.schema.elements.map((e, i) => [e.name.some ?? `c${i}`, row[i]]),
      ),
    ),
  ) as Record<string, unknown>[];
};
const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;
const held = () => {
  const containers = sqlRows(
    `SELECT id, name, local_x, local_y FROM inventory_container WHERE ship_id = ${quote(owner.shipId)}`,
  );
  const ids = new Set(containers.map((c) => c.id as string));
  const items = sqlRows(
    "SELECT id, container_id, definition_id, x, y FROM inventory_item",
  ).filter((i) => ids.has(i.container_id as string));
  return {
    containers: containers
      .map((c) => ({
        id: c.id as string,
        name: c.name as string,
        at: [c.local_x, c.local_y],
      }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
    items: items.map((i) => `${i.id}@${i.container_id}:${i.x},${i.y}`).sort(),
  };
};

const evidence: Record<string, unknown> = {
  date: new Date().toISOString(),
  database,
  source,
  target: FED_WREN_PIN,
  shipId: owner.shipId,
  characterId: owner.characterId,
};

// 1. Operator stocks the seeded Wren exactly as live's was stocked.
const stocked: Record<string, string[]> = {};
for (const [socket, kit, name] of [
  ["hold/cargo.standard.medium", "uniforms-and-tiers", "Storage crate"],
  ["bunks/shipyard.equipment.wall-locker", "role-sets", "Wall locker"],
] as const) {
  const out = json(
    python(
      "ship_cargo.py",
      "apply",
      "--operation-id",
      `rehearsal-stock-${kit}`,
      "--character-id",
      owner.characterId,
      "--ship-id",
      owner.shipId,
      "--socket",
      socket,
      "--container-name",
      name,
      "--kit",
      kit,
      "--confirm-database",
      database,
    ),
  );
  stocked[socket] = (out.summary.items as { id: string }[]).map((i) => i.id);
  evidence[`stocked:${socket}`] = {
    containerId: out.summary.containerId,
    items: stocked[socket].length,
  };
}
assert.equal(
  stocked["hold/cargo.standard.medium"]!.length,
  CREW_WARDROBE_KITS["uniforms-and-tiers"]!.length,
);
assert.equal(stocked["bunks/shipyard.equipment.wall-locker"]!.length, 27);
const before = held();
evidence.heldBefore = {
  containers: before.containers,
  items: before.items.length,
};

// The stocked source revision still compiles flight with its payload (prefab socket cargo).
{
  const x = await client(owner.token);
  await x.reducers.enterLab({ name: "ignored" });
  await wait(
    () =>
      [...x.db.ownAuthoredFlightPhysics.iter()].some(
        (p) => p.shipId === owner.shipId && p.status === "ready",
      ),
    "stocked source flight ready",
  );
  evidence.sourceMassKg = [...x.db.ownAuthoredFlightPhysics.iter()].find(
    (p) => p.shipId === owner.shipId,
  )!.massKg;
  // Ordinary identities can never reach the upgrade reducer.
  await assert.rejects(
    x.reducers.operatorUpgradePrefabShip({
      operationId: "attack-upgrade-0001",
      dryRun: true,
      shipId: owner.shipId,
      expectedSourceBlueprintSha256: source.blueprintSha256,
      expectedInstanceRevision: 1n,
      targetPrefabId: "fed.s.wren",
      expectedTargetBlueprintSha256: FED_WREN_PIN.blueprintSha256,
    }),
  );
  // The owner logs out for the maintenance window.
  x.disconnect();
  await pause(500);
}

// 2. Runbook: export, dry-run, apply, verify.
const backupDir = join(evidenceDirectory, "backups");
const backup = json(
  python("ship_upgrade.py", "export", "--out-dir", backupDir),
) as { backup: string; sha256: string };
evidence.backup = { file: backup.backup, sha256: backup.sha256 };
const dry = json(
  python(
    "ship_upgrade.py",
    "dry-run",
    "--operation-id",
    "rehearsal-upgrade-dry-0001",
    "--character-id",
    owner.characterId,
  ),
);
assert.deepEqual(dry.summary.refusals, []);
assert.equal(dry.summary.shipId, owner.shipId);
assert.equal(dry.summary.source.blueprintSha256, source.blueprintSha256);
assert.equal(dry.summary.target.blueprintSha256, FED_WREN_PIN.blueprintSha256);
assert.deepEqual(held(), before, "dry-run changes no inventory");
evidence.dryRun = dry.summary;
const applied = json(
  python(
    "ship_upgrade.py",
    "apply",
    "--operation-id",
    "rehearsal-upgrade-apply-0001",
    "--from-dry-run",
    "rehearsal-upgrade-dry-0001",
    "--backup",
    backup.backup,
    "--confirm-database",
    database,
  ),
);
assert.equal(applied.kind, "upgrade-prefab");
evidence.applied = {
  archivedRows: applied.summary.archivedRows,
  sockets: applied.summary.sockets,
  groundDrops: applied.summary.groundDrops,
  characterM: applied.summary.characterM,
};
const verified = json(
  python(
    "ship_upgrade.py",
    "verify",
    "--operation-id",
    "rehearsal-upgrade-apply-0001",
    "--backup",
    backup.backup,
  ),
);
assert.equal(verified.ok, true);
evidence.verify = verified;
const after = held();
assert.deepEqual(
  after.containers.map((c) => c.id),
  before.containers.map((c) => c.id),
);
assert.deepEqual(after.items, before.items, "same items, containers, cells");
evidence.heldAfter = {
  containers: after.containers,
  items: after.items.length,
};
// Replays are no-ops; a second upgrade is refused (already r4).
python(
  "ship_upgrade.py",
  "apply",
  "--operation-id",
  "rehearsal-upgrade-apply-0001",
  "--from-dry-run",
  "rehearsal-upgrade-dry-0001",
  "--backup",
  backup.backup,
  "--confirm-database",
  database,
);
assert.deepEqual(held(), after);
let refusedAgain = "";
try {
  python(
    "ship_upgrade.py",
    "dry-run",
    "--operation-id",
    "rehearsal-upgrade-dry-0002",
    "--character-id",
    owner.characterId,
  );
} catch (error) {
  refusedAgain = String((error as { stdout?: string }).stdout ?? error);
}
assert.match(refusedAgain, /already has the target revision/);

// 2b. Wren r8: the upgrade adds the suit locker empty; the operator stocks the EVA suit into it
// (the new socket, beside the crate and locker stocked as full as live's).
{
  const target = prefabCargoSockets(
    prefabById("fed.s.wren")!,
    0,
    defaultPrefabComponentCatalog(),
  );
  if (target.some((s) => s.key === WREN_SUIT_LOCKER_SOCKET)) {
    const out = json(
      python(
        "ship_cargo.py",
        "apply",
        "--operation-id",
        "rehearsal-stock-eva-suit",
        "--character-id",
        owner.characterId,
        "--ship-id",
        owner.shipId,
        "--socket",
        WREN_SUIT_LOCKER_SOCKET,
        "--container-name",
        "EVA suit locker",
        "--kit",
        "eva-suit",
        "--confirm-database",
        database,
      ),
    );
    stocked[WREN_SUIT_LOCKER_SOCKET] = (
      out.summary.items as { id: string }[]
    ).map((i) => i.id);
    assert.equal(
      stocked[WREN_SUIT_LOCKER_SOCKET]!.length,
      CREW_WARDROBE_KITS["eva-suit"]!.length,
    );
    evidence[`stocked:${WREN_SUIT_LOCKER_SOCKET}`] = {
      containerId: out.summary.containerId,
      items: stocked[WREN_SUIT_LOCKER_SOCKET]!.length,
      accessPointM: out.summary.accessPointM,
    };
  }
}

// 3. The owner returns: same ship, r4, containers reachable, ground drop visible, flies.
const x = await client(owner.token);
try {
  await x.reducers.enterLab({ name: "ignored" });
  await x.reducers.claimInputControl({});
  const actor = () => [...x.db.ownCharacters.iter()][0]!;
  await wait(() => actor()?.shipId === owner.shipId, "owner aboard");
  assert.equal(x.db.ownShips.count(), 1n);
  const access = [...x.db.ownGameShipAccess.iter()].find(
    (a) => a.shipId === owner.shipId,
  );
  assert.equal(access?.templateSha256, FED_WREN_PIN.blueprintSha256);
  assert.equal(access?.revision, 2n, "access at the next instance revision");
  await wait(
    () =>
      [...x.db.ownAuthoredFlightPhysics.iter()].some(
        (p) => p.shipId === owner.shipId && p.status === "ready",
      ),
    "upgraded flight ready",
  );
  const prefab = prefabById("fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  const stats = prefabStats(prefab, catalog);
  const physics = [...x.db.ownAuthoredFlightPhysics.iter()].find(
    (p) => p.shipId === owner.shipId,
  )!;
  // r4 structure + components, plus the crew body and 45 stocked wardrobe items.
  assert(physics.massKg > stats.massKg, "cargo and crew ride along");
  assert(physics.massKg - stats.massKg < 500, "no stray mass");
  evidence.targetMassKg = physics.massKg;
  evidence.prefabStatsMassKg = stats.massKg;

  // The r8 suit locker is checked from the inside airlock button (below), after the ground drop,
  // which needs line of sight from the other containers.
  const sockets = prefabCargoSockets(prefab, 0, catalog).filter(
    (s) => s.key !== WREN_SUIT_LOCKER_SOCKET,
  );
  const reached: Record<string, unknown> = {};
  for (const socket of sockets) {
    const from: [number, number] = [actor().localX, actor().localY];
    const to = socket.approachesM[0]!;
    for (const [px, py] of prefabWalkRoute(prefab, catalog, from, to))
      await walkNative(x, px, py);
    const expected = stocked[socket.key]!;
    const container = () =>
      [...x.db.ownReachableCargoContainers.iter()].find((c) =>
        c.placedObjectId.endsWith(":" + socket.key),
      );
    await wait(() => !!container(), `${socket.key} reachable`);
    const items = () =>
      [...x.db.ownReachableCargoItems.iter()].filter(
        (i) => i.containerId === container()!.id,
      );
    assert(expected, `${socket.key} was stocked`);
    await wait(
      () => items().length === expected.length,
      `${socket.key} shows ${expected.length} items`,
    );
    assert.deepEqual(
      items()
        .map((i) => i.id)
        .sort(),
      [...expected].sort(),
    );
    reached[socket.key] = {
      containerId: container()!.id,
      standingAt: [actor().localX, actor().localY],
      items: items().length,
    };
  }
  evidence.reachedAfterUpgrade = reached;
  if (owner.groundItemId) {
    await wait(
      () =>
        [...x.db.ownGroundItems.iter()].some(
          (i) => i.id === owner.groundItemId,
        ),
      "ground drop still on the deck",
    );
    evidence.groundItem = [...x.db.ownGroundItems.iter()].find(
      (i) => i.id === owner.groundItemId,
    );
  }

  // Ship logic (r6+, after the ground-drop check, which needs line of sight from the locker): the
  // hold is the airlock chamber. It starts pressurised (hold door open,
  // hatch shut); the inside button cycles it open and closed again.
  const logic = shipLogicModel(prefab, catalog);
  if (logic) {
    const device = (id: string) =>
      [...x.db.visibleShipLogic.iter()].find(
        (r) => r.shipId === owner.shipId && r.deviceId === id,
      );
    await wait(
      () => device("lock")?.state === "pressurised",
      "airlock pressurised",
    );
    assert.equal(device("door-inner")?.open, true);
    assert.equal(device("door-outer")?.open, false);
    const button = logic.panels.find((p) => p.deviceId === "btn-lock-in")!;
    for (const [px, py] of prefabWalkRoute(
      prefab,
      catalog,
      [actor().localX, actor().localY],
      button.front,
    ))
      await walkNative(x, px, py);
    // Unsuited, the inside button refuses to depressurise (vacuum needs the EVA suit).
    const refusal = await x.reducers
      .pressShipButton({ shipId: owner.shipId, deviceId: button.deviceId })
      .then(
        () => "",
        (e: unknown) => String(e),
      );
    assert.match(refusal, /EVA needs a pressure suit/);
    assert.equal(device("lock")?.state, "pressurised");
    // r8: the suit locker and the stocked suit are within reach where the inside button is pressed.
    const expected = stocked[WREN_SUIT_LOCKER_SOCKET];
    const suitLocker = () =>
      [...x.db.ownReachableCargoContainers.iter()].find((c) =>
        c.placedObjectId.endsWith(":" + WREN_SUIT_LOCKER_SOCKET),
      );
    const suitItems = () =>
      [...x.db.ownReachableCargoItems.iter()]
        .filter((i) => i.containerId === suitLocker()?.id)
        .map((i) => i.id)
        .sort();
    if (expected) {
      await wait(
        () => suitItems().length === expected.length,
        "suit locker and suit reachable from the inside button",
      );
      assert.deepEqual(suitItems(), [...expected].sort());
      reached[WREN_SUIT_LOCKER_SOCKET] = {
        containerId: suitLocker()!.id,
        standingAt: [actor().localX, actor().localY],
        items: expected.length,
      };
    }
    evidence.airlockAfterUpgrade = {
      pressurised: true,
      unsuitedRefused: true,
      suitLockerReachableAtButton: !!expected && !!suitLocker(),
    };
  }

  // Take the helm and fly.
  const model = prefabFlightModel(prefab, catalog);
  const pose = prefabPilotPose(model.station!);
  for (const [px, py] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    pose.approach,
  ))
    await walkNative(x, px, py);
  const flightOf = () =>
    [...x.db.ownAuthoredFlights.iter()].find((f) => f.shipId === owner.shipId)!;
  await x.reducers.enterAuthoredPilot({
    stationId: flightOf().stationId,
    expectedStationRevision: flightOf().stationRevision,
    operationId: crypto.randomUUID(),
  });
  await wait(() => flightOf()?.seatState === "seated", "pilot seated");
  const shipOf = () => [...x.db.ownShips.iter()][0]!;
  const heading0 = shipOf().heading;
  for (let n = 0; n < 20; n++) {
    await x.reducers.setIntent({
      sequence: nextSequence(x),
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await pause(60);
  }
  const speed = Math.hypot(shipOf().vx, shipOf().vy);
  assert(speed > 0.3, `upgraded Wren accelerated (${speed.toFixed(3)} m/s)`);
  for (let n = 0; n < 15; n++) {
    await x.reducers.setIntent({
      sequence: nextSequence(x),
      throttle: 0,
      turn: 1,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await pause(60);
  }
  assert(Math.abs(shipOf().heading - heading0) > 1e-3, "upgraded Wren turned");
  evidence.flight = { speed, heading: shipOf().heading, heading0 };
  await x.reducers.setIntent({
    sequence: nextSequence(x),
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
} finally {
  x.disconnect();
}
evidence.backups = readdirSync(backupDir);
writeFileSync(
  join(evidenceDirectory, "ship-upgrade-smoke.json"),
  JSON.stringify(
    evidence,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    1,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    passed: true,
    source: source.description,
    containers: after.containers.length,
    items: after.items.length,
    flight: evidence.flight,
  }),
);
process.exit(0);
