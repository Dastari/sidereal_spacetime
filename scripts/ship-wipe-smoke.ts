/** Isolated ship-wipe rehearsal, post-upgrade half. Run through
 * scripts/ship_wipe_rehearsal.py (npm run smoke:ship-wipe), never against a
 * live database. The database was seeded under the live baseline module
 * (scripts/ship-wipe-seed.ts: starter Wayfarers, ship cargo, a ground drop,
 * optionally the full standard smoke) and upgraded in place to this module.
 * This script executes the operator runbook tooling exactly as documented and
 * checks invariants through operator SQL and ordinary player views. It never
 * assigns the legacy Wayfarer: the only way back aboard is a registered
 * non-legacy prefab. SHIPS-PREFABS registered fed.s.wren; the final stage assigns
 * it to the owner, who then walks (door-aware route) to the derived pilot
 * station, takes the seat and flies with the compiled-from-components flight. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabById } from "../packages/content/src/prefabs/index";
import { prefabStats } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import { FED_WREN_PIN } from "../packages/world/src/prefab-ship-pins";

const host = process.env.SIDEREAL_SMOKE_URL ?? "";
const database = process.env.SIDEREAL_SMOKE_DATABASE ?? "";
const evidenceDirectory = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? ".runtime";
if (!host || !database.endsWith("-smoke"))
  throw Error("Ship wipe smoke requires an isolated -smoke database");
if (new URL(host).port === "3100")
  throw Error("Refusing to rehearse a ship wipe on the live server port");
const seed = JSON.parse(readFileSync(join(evidenceDirectory, "ship-wipe-seed.json"), "utf8")) as {
  database: string;
  accounts: {
    name: string;
    token: string;
    characterId: string;
    shipId: string;
    personalKit: string[];
    cargoItemId?: string;
    groundItemId?: string;
  }[];
};
if (seed.database !== database) throw Error("Seed evidence belongs to another database");

const wait = async (fn: () => boolean, message: string, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + message);
};
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
          tables.ownStations,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightPhysics,
          tables.ownAuthoredFlightActuators,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  return connection;
}
const tool = (...args: string[]) =>
  JSON.parse(
    execFileSync(
      "python3",
      ["scripts/ship_wipe.py", args[0]!, "--server", host, "--database", database, ...args.slice(1)],
      { encoding: "utf8" },
    ),
  );
const sqlRows = (query: string) => {
  const out = execFileSync(
    ".tools/spacetime/spacetime",
    ["--root-dir=.tools/spacetime", "sql", "--server", host, "--yes", "--no-config", "--format", "json", database, query],
    { encoding: "utf8" },
  );
  const payload = JSON.parse(out.slice(out.indexOf("[")));
  return payload.flatMap((r: { rows: unknown[] }) => r.rows) as unknown[][];
};

const evidence: Record<string, unknown> = { date: new Date().toISOString(), database };
const owner = seed.accounts[0]!;
const x = await client(owner.token);
try {
  await wait(() => x.db.ownShips.count() === 1n, "owner still has the legacy ship before the wipe");
  const actorX = [...x.db.ownCharacters.iter()][0]!;
  assert.equal(actorX.id, owner.characterId);

  // Default policy after the upgrade: new accounts never get a legacy Wayfarer.
  const early = await client();
  await early.reducers.enterLab({ name: "Early Newcomer" });
  await wait(() => early.db.ownCharacters.count() === 1n && early.db.ownInventoryItems.count() === 7n, "shipless onboarding");
  assert.equal(early.db.ownShips.count(), 0n);
  assert.equal([...early.db.ownCharacters.iter()][0]!.shipId, "");
  evidence.defaultOnboardingBeforeWipe = { ships: 0, kit: 7 };
  early.disconnect();

  // Non-operator identities can never reach ship maintenance.
  await assert.rejects(
    x.reducers.operatorSetStarterPrefab({ operationId: "attack-policy-01", prefabId: "", expectedCatalogRevision: "", allowLegacy: false }),
  );
  await assert.rejects(
    x.reducers.operatorWipePlayerShips({ operationId: "attack-wipe-0001", dryRun: true, expectedShips: 0, expectedInstances: 0, expectedCharacters: 0 }),
  );
  evidence.nonOperatorRejected = true;

  // Runbook, exactly as documented.
  const backup = tool("export");
  evidence.backup = { counts: backup.counts, sha256: backup.sha256, bytes: backup.bytes };
  const mode = execFileSync("stat", ["-c", "%a", backup.backup], { encoding: "utf8" }).trim();
  assert.equal(mode, "600", "backup is private");
  const policy = tool("policy", "--operation-id", "rehearsal-policy-none-1", "--starter-prefab-id", "");
  assert.equal(policy.summary.starterPrefabId, "");
  const dry = tool("dry-run", "--operation-id", "rehearsal-dry-run-0001");
  evidence.dryRun = {
    counts: dry.summary.counts,
    ships: dry.summary.ships,
    characters: dry.summary.characters,
    deleteRows: dry.summary.deleteRows,
    archivedInventory: dry.summary.archivedInventory,
    preservedMapRows: dry.summary.preservedMapRows,
  };
  assert.deepEqual(
    { ships: dry.summary.counts.ships, instances: dry.summary.counts.instances, characters: dry.summary.counts.characters },
    backup.counts,
  );
  const reasons = Object.fromEntries(
    dry.summary.archivedInventory.map((r: { itemId: string; reason: string }) => [r.itemId, r.reason]),
  );
  assert.equal(reasons[owner.cargoItemId!], "ship-cargo-container");
  assert.equal(reasons[owner.groundItemId!], "ground-drop-on-ship-deck");
  for (const account of seed.accounts)
    for (const id of account.personalKit) assert(!(id in reasons), "personal item is never archived");
  assert.throws(() =>
    tool("apply", "--operation-id", "rehearsal-apply-stale1", "--expected-ships", "999", "--expected-instances", String(backup.counts.instances), "--expected-characters", String(backup.counts.characters), "--backup", backup.backup, "--confirm-database", database),
  );
  const applyArgs = [
    "apply",
    "--operation-id", "rehearsal-apply-00001",
    "--expected-ships", String(backup.counts.ships),
    "--expected-instances", String(backup.counts.instances),
    "--expected-characters", String(backup.counts.characters),
    "--backup", backup.backup,
    "--confirm-database", database,
  ];
  const applied = tool(...applyArgs);
  evidence.apply = { after: applied.after, archivedRows: applied.summary.archivedRows };
  assert.deepEqual(applied.after, { ships: 0, instances: 0, characters: backup.counts.characters });
  tool(...applyArgs); // Replay is a no-op.
  const verified = tool("verify", "--backup", backup.backup, "--expect-wiped");
  evidence.verify = verified;
  assert.equal(verified.mapUnchanged, true);
  assert.equal(verified.charactersAwaitingShip, backup.counts.characters);
  // Archived, not hard-deleted: the cargo and ground items are in the archive.
  const archivedIds = sqlRows("SELECT table_name, action, row_json FROM ship_wipe_archive")
    .filter((r) => r[0] === "inventoryItem" && r[1] === "deleted")
    .map((r) => JSON.parse(r[2] as string).id);
  assert(archivedIds.includes(owner.cargoItemId) && archivedIds.includes(owner.groundItemId));
  evidence.archivedItemIds = archivedIds;

  // Player views: no ship, same character, same personal UUIDs, no failure on re-entry.
  await wait(() => x.db.ownShips.count() === 0n && x.db.ownGameShipAccess.count() === 0n, "ship gone from views");
  await x.reducers.enterLab({ name: "ignored" });
  await x.reducers.claimStarterKit({});
  const afterX = [...x.db.ownCharacters.iter()][0]!;
  assert.equal(afterX.id, actorX.id);
  assert.equal(afterX.name, actorX.name);
  assert.equal(afterX.shipId, "");
  const kit = () => [...x.db.ownInventoryItems.iter()].map((i) => i.id).sort();
  assert.deepEqual(kit(), owner.personalKit);
  assert.equal(x.db.ownConstructionLocation.count(), 0n);
  assert.equal(x.db.ownWorldAdmission.count(), 0n);
  assert.equal([...x.db.ownGroundItems.iter()].length, 0);
  await x.reducers.setIntent({ sequence: 999n, throttle: 0, turn: 0, dx: 1, dy: 0, sprint: false });
  await new Promise((r) => setTimeout(r, 300));
  const still = [...x.db.ownCharacters.iter()][0]!;
  assert.deepEqual([still.shipId, still.localX, still.localY], ["", 0, 0]);
  evidence.playerViewsAfterWipe = { ships: 0, personalKitPreserved: owner.personalKit.length, character: afterX.id };

  // New accounts after the wipe also wait for a ship.
  const z = await client();
  await z.reducers.enterLab({ name: "Shipless Newcomer" });
  await wait(() => z.db.ownCharacters.count() === 1n && z.db.ownInventoryItems.count() === 7n, "shipless onboarding");
  await z.reducers.claimStarterKit({});
  assert.equal(z.db.ownShips.count(), 0n);
  z.disconnect();

  // The scheduled world step keeps running without errors with zero ships.
  // (stepSharedWorld deliberately writes no clock row for idle samples, so
  // last_simulation_tick only advances when something moves.)
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(sqlRows("SELECT scheduled_id FROM movement_timer").length, 1, "world timer retained");
  const logs = execFileSync(
    ".tools/spacetime/spacetime",
    ["--root-dir=.tools/spacetime", "logs", "--server", host, "--no-config", database, "-n", "2000"],
    { encoding: "utf8" },
  );
  const stepErrors = logs.split("\n").filter((l) => /ERROR: step_world|panic/i.test(l));
  assert.deepEqual(stepErrors, [], "no scheduled step_world failures");
  evidence.scheduledStepHealthy = { timerRows: 1, stepWorldErrors: 0 };

  // The only way back aboard is a registered non-legacy prefab (fed.s.wren).
  // Unregistered prefabs, stale catalog revisions and the legacy Wayfarer are refused.
  const assignArgs = (operationId: string, prefabId: string, revision: string) => [
    "assign", "--operation-id", operationId, "--character-id", actorX.id,
    "--prefab-id", prefabId, "--catalog-revision", revision,
  ];
  assert.throws(() => tool(...assignArgs("rehearsal-assign-unknown", "rj.s.jackal", FED_WREN_PIN.catalogRevision)));
  assert.throws(() => tool(...assignArgs("rehearsal-assign-stale", "fed.s.wren", "ship-components.v1")));
  assert.throws(() => tool(...assignArgs("rehearsal-assign-legacy", "legacy-wayfarer-r002", "legacy-wayfarer")));
  assert.throws(() =>
    tool("policy", "--operation-id", "rehearsal-policy-legacy", "--starter-prefab-id", "legacy-wayfarer-r002", "--catalog-revision", "legacy-wayfarer"),
  );
  assert.equal([...x.db.ownCharacters.iter()][0]!.shipId, "", "still awaiting a ship");

  // Assign the owner's chosen Wren at a server berth.
  const assigned = tool(...assignArgs("rehearsal-assign-wren-01", "fed.s.wren", FED_WREN_PIN.catalogRevision));
  assert.equal(assigned.summary.prefabId, "fed.s.wren");
  assert.equal(assigned.summary.blueprintSha256, FED_WREN_PIN.blueprintSha256);
  assert.equal(assigned.summary.shipName, "Wren");
  await wait(() => x.db.ownShips.count() === 1n && [...x.db.ownCharacters.iter()][0]!.shipId !== "", "Wren boarded");
  const actor = () => [...x.db.ownCharacters.iter()][0]!;
  const shipId = actor().shipId;
  const ship = () => [...x.db.ownShips.iter()].find((r) => r.id === shipId)!;
  const flightOf = () => [...x.db.ownAuthoredFlights.iter()].find((f) => f.shipId === shipId)!;
  const physicsOf = () => [...x.db.ownAuthoredFlightPhysics.iter()].find((p) => p.shipId === shipId);
  assert.equal(actor().id, actorX.id, "same character UUID");
  assert.equal(ship().name, "Wren");
  assert.deepEqual(kit(), owner.personalKit, "personal kit preserved through assignment");
  const access = [...x.db.ownGameShipAccess.iter()].find((r) => r.shipId === shipId);
  assert(access && access.templateSha256 === FED_WREN_PIN.blueprintSha256, "Wren game access");
  assert.equal([...x.db.ownConstructionLocation.iter()][0]?.instanceId, shipId);
  await wait(() => physicsOf()?.status === "ready", "Wren compiled flight ready", 15000);
  const prefab = prefabById("fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  const model = prefabFlightModel(prefab, catalog);
  const stats = prefabStats(prefab, catalog);
  const physics = physicsOf()!;
  assert(Math.abs(physics.massKg - stats.massKg) < 200, `compiled mass ${physics.massKg} ~ prefab stats ${stats.massKg}`);
  const actuators = [...x.db.ownAuthoredFlightActuators.iter()].filter((r) => r.shipId === shipId);
  assert.equal(actuators.length, model.fittings.filter((f) => f.role === "actuator").length);
  assert(flightOf()?.active && flightOf().flightAdmitted, "Wren flight active and admitted");

  // Walk through the door passages to the derived pilot approach, then sit.
  await x.reducers.claimInputControl({});
  const pose = prefabPilotPose(model.station!);
  const route = prefabWalkRoute(prefab, catalog, [actor().localX, actor().localY], pose.approach);
  for (const [px, py] of route) await walkNative(x, px, py);
  const seat = flightOf();
  await x.reducers.enterAuthoredPilot({
    stationId: seat.stationId,
    expectedStationRevision: seat.stationRevision,
    operationId: crypto.randomUUID(),
  });
  await wait(() => flightOf()?.seatState === "seated", "Wren pilot entry");
  assert(Math.hypot(actor().localX - pose.position[0], actor().localY - pose.position[1]) < 1e-3, "seated at the derived station");

  // Fly: a forward burn builds speed, then a turn changes heading.
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const s0 = { ...ship() };
  for (let n = 0; n < 20; n++) {
    await x.reducers.setIntent({ sequence: nextSequence(x), throttle: 1, turn: 0, dx: 0, dy: 0, sprint: false });
    await pause(60);
  }
  const speed = Math.hypot(ship().vx, ship().vy);
  assert(speed > 0.3, `Wren accelerated (speed ${speed.toFixed(3)} m/s)`);
  for (let n = 0; n < 15; n++) {
    await x.reducers.setIntent({ sequence: nextSequence(x), throttle: 0, turn: 1, dx: 0, dy: 0, sprint: false });
    await pause(60);
  }
  const turned = Math.abs(ship().heading - s0.heading);
  assert(turned > 1e-3, "Wren turned");
  await x.reducers.setIntent({ sequence: nextSequence(x), throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false });
  evidence.assignment = {
    refused: ["unregistered rj.s.jackal", "stale catalog revision", "legacy wayfarer"],
    prefabId: "fed.s.wren",
    catalogRevision: FED_WREN_PIN.catalogRevision,
    blueprintSha256: FED_WREN_PIN.blueprintSha256,
    shipId,
    shipName: ship().name,
    walkWaypoints: route.length,
    seated: true,
    massKg: physics.massKg,
    actuators: actuators.length,
    speed,
    headingChange: turned,
  };
  console.log(JSON.stringify(evidence, null, 1));
  writeFileSync(join(evidenceDirectory, "ship-wipe-smoke.json"), JSON.stringify(evidence, null, 1));
} finally {
  x.disconnect();
}
process.exit(0);
