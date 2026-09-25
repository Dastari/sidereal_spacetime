/** Isolated ship-wipe rehearsal. Run through scripts/ship_wipe_rehearsal.py
 * (npm run smoke:ship-wipe), never against a live database. The database was
 * seeded by the full standard smoke under the live baseline module and then
 * upgraded in place to this module; this script adds cargo/ground items,
 * executes the operator runbook tooling and checks invariants through both
 * operator SQL and ordinary player views. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { walkNative } from "./native-starter-smoke";

const host = process.env.SIDEREAL_SMOKE_URL ?? "";
const database = process.env.SIDEREAL_SMOKE_DATABASE ?? "";
const evidenceDirectory = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? ".runtime";
if (!host || !database.endsWith("-smoke"))
  throw Error("Ship wipe smoke requires an isolated -smoke database");
if (new URL(host).port === "3100")
  throw Error("Refusing to rehearse a ship wipe on the live server port");

const wait = async (fn: () => boolean, message: string, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + message);
};
async function client() {
  let ready = false;
  const connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .onConnect((c) => {
      c.subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownGameShipAccess,
          tables.ownConstructionLocation,
          tables.ownConstructionInstances,
          tables.ownWorldAdmission,
          tables.ownInventoryState,
          tables.ownInventoryItems,
          tables.ownInventoryContainers,
          tables.ownInventoryHotbar,
          tables.ownGroundItems,
          tables.ownReachableCargoContainers,
          tables.ownReachableCargoItems,
          tables.ownCarriedInventoryRevisions,
          tables.visibleShipDescriptions,
          tables.visibleBodyDescriptions,
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
const x = await client(),
  y = await client();
try {
  await x.reducers.enterLab({ name: "Wipe Cargo Owner" });
  await y.reducers.enterLab({ name: "Wipe Bystander" });
  await x.reducers.claimStarterKit({});
  await wait(() => x.db.ownShips.count() === 1n && y.db.ownShips.count() === 1n, "new starter ships");
  await wait(() => x.db.ownInventoryItems.count() === 7n, "starter kit");
  const kit = () => [...x.db.ownInventoryItems.iter()];
  const find = (d: string) => kit().find((i) => i.definitionId === d)!;
  const state = () => [...x.db.ownInventoryState.iter()][0]!;
  const startKit = kit().map((i) => i.id).sort();

  // Representative ship-held cargo: store the pistol in a native ship container.
  await x.reducers.claimInputControl({});
  for (const [px, py] of [[0, -1.5], [0, 3], [-2.4, 3], [-3.5, 2.75]] as const)
    await walkNative(x, px, py);
  const cargo = () => [...x.db.ownReachableCargoContainers.iter()].filter((c) => c.placedObjectId);
  await wait(() => cargo().length === 4, "reachable cargo");
  const revision = (id: string) =>
    [...x.db.ownCarriedInventoryRevisions.iter()].find((r) => r.id === id)?.revision ??
    cargo().find((r) => r.id === id)?.revision;
  const pistol = find("compact-pistol");
  const root = cargo()[0]!;
  await x.reducers.transferScopedCargoItem({
    operationId: "ship-wipe-smoke-cargo-1",
    itemId: pistol.id,
    sourceContainerId: pistol.containerId,
    destinationContainerId: root.id,
    x: 0,
    y: 0,
    rotated: false,
    expectedItemRevision: revision(pistol.id)!,
    expectedSourceRevision: revision(pistol.containerId)!,
    expectedDestinationRevision: revision(root.id)!,
    expectedCharacterRevision: state().revision,
  });
  await wait(() => !kit().some((i) => i.id === pistol.id), "pistol in ship cargo");
  // Representative ground item on the deck.
  const scanner = find("scanner");
  await x.reducers.dropInventoryItem({
    itemId: scanner.id,
    expectedRevision: state().revision,
    operationId: "ship-wipe-smoke-drop-1",
  });
  await wait(() => [...x.db.ownGroundItems.iter()].some((i) => i.id === scanner.id), "ground scanner");
  // The dropped scanner is still listed as the owner's item while it lies on the
  // deck; it is ship-held (ground on a ship) and is archived with the ship.
  const personalBefore = kit().map((i) => i.id).filter((id) => id !== scanner.id).sort();
  assert.equal(personalBefore.length, 5);
  const actorX = [...x.db.ownCharacters.iter()][0]!;
  evidence.seed = {
    cargoItem: pistol.id,
    groundItem: scanner.id,
    personalKitBefore: personalBefore.length,
    starterKit: startKit.length,
  };

  // Non-operator identities can never reach ship maintenance.
  await assert.rejects(x.reducers.operatorSetStarterShips({ operationId: "attack-policy-01", enabled: false }));
  await assert.rejects(
    x.reducers.operatorWipePlayerShips({
      operationId: "attack-wipe-0001",
      dryRun: true,
      expectedShips: 0,
      expectedInstances: 0,
      expectedCharacters: 0,
    }),
  );
  evidence.nonOperatorRejected = true;

  // Runbook, exactly as documented.
  const backup = tool("export");
  evidence.backup = { counts: backup.counts, sha256: backup.sha256, bytes: backup.bytes };
  const mode = execFileSync("stat", ["-c", "%a", backup.backup], { encoding: "utf8" }).trim();
  assert.equal(mode, "600", "backup is private");
  tool("policy", "--operation-id", "rehearsal-policy-off-1", "--enabled", "false");
  const dry = tool("dry-run", "--operation-id", "rehearsal-dry-run-0001");
  evidence.dryRun = { counts: dry.summary.counts, deleteRows: dry.summary.deleteRows, preservedMapRows: dry.summary.preservedMapRows };
  assert.deepEqual(
    { ships: dry.summary.counts.ships, instances: dry.summary.counts.instances, characters: dry.summary.counts.characters },
    backup.counts,
  );
  assert(dry.summary.deleteRows.inventoryItem >= 2, "cargo and ground items are ship-held");
  // Stale expectations are refused before any mutation.
  assert.throws(() =>
    tool("apply", "--operation-id", "rehearsal-apply-stale1", "--expected-ships", "999", "--expected-instances", String(backup.counts.instances), "--expected-characters", String(backup.counts.characters), "--backup", backup.backup, "--confirm-database", database),
  );
  const applied = tool(
    "apply",
    "--operation-id", "rehearsal-apply-00001",
    "--expected-ships", String(backup.counts.ships),
    "--expected-instances", String(backup.counts.instances),
    "--expected-characters", String(backup.counts.characters),
    "--backup", backup.backup,
    "--confirm-database", database,
  );
  evidence.apply = { after: applied.after, archivedRows: applied.summary.archivedRows };
  assert.deepEqual(applied.after, { ships: 0, instances: 0, characters: backup.counts.characters });
  // Replaying the same operation is a no-op.
  tool("apply", "--operation-id", "rehearsal-apply-00001", "--expected-ships", String(backup.counts.ships), "--expected-instances", String(backup.counts.instances), "--expected-characters", String(backup.counts.characters), "--backup", backup.backup, "--confirm-database", database);
  const verified = tool("verify", "--backup", backup.backup, "--expect-wiped");
  evidence.verify = verified;
  assert.equal(verified.mapUnchanged, true);
  assert.equal(verified.charactersAwaitingShip, backup.counts.characters);

  // Player views: no ship, same character, same personal UUIDs, no crash on re-entry.
  await wait(() => x.db.ownShips.count() === 0n && x.db.ownGameShipAccess.count() === 0n, "ship gone from views");
  await x.reducers.enterLab({ name: "ignored" });
  await x.reducers.claimStarterKit({});
  const afterX = [...x.db.ownCharacters.iter()][0]!;
  assert.equal(afterX.id, actorX.id);
  assert.equal(afterX.name, actorX.name);
  assert.equal(afterX.shipId, "");
  assert.deepEqual(kit().map((i) => i.id).sort(), personalBefore);
  assert.equal(x.db.ownConstructionLocation.count(), 0n);
  assert.equal(x.db.ownWorldAdmission.count(), 0n);
  assert.equal([...x.db.ownGroundItems.iter()].length, 0);
  // Movement intent from an awaiting-ship character is inert (no frame to walk in).
  await x.reducers.setIntent({ sequence: 999n, throttle: 0, turn: 0, dx: 1, dy: 0, sprint: false });
  await new Promise((r) => setTimeout(r, 300));
  const still = [...x.db.ownCharacters.iter()][0]!;
  assert.deepEqual([still.shipId, still.localX, still.localY], ["", 0, 0]);
  evidence.playerViewsAfterWipe = { ships: 0, personalKitPreserved: personalBefore.length, character: afterX.id };

  // New accounts onboard without a ship while starters are disabled.
  const z = await client();
  await z.reducers.enterLab({ name: "Shipless Newcomer" });
  await wait(() => z.db.ownCharacters.count() === 1n && z.db.ownInventoryItems.count() === 7n, "shipless onboarding");
  await z.reducers.claimStarterKit({});
  assert.equal(z.db.ownShips.count(), 0n);
  assert.equal([...z.db.ownCharacters.iter()][0]!.shipId, "");
  evidence.shiplessOnboarding = { ships: 0, kit: 7 };
  z.disconnect();

  // The world keeps simulating with zero ships.
  const tick = () => BigInt(sqlRows("SELECT last_simulation_tick FROM world_system")[0]![0] as number);
  const t0 = tick();
  await new Promise((r) => setTimeout(r, 600));
  assert(tick() > t0, "shared world tick advances after the wipe");
  evidence.tickAdvances = true;

  // Assignment (legacy stand-in; the runbook uses the SHIPS-PREFABS prefab ID).
  assert.throws(() =>
    tool("assign", "--operation-id", "rehearsal-assign-refuse", "--character-id", actorX.id, "--prefab-id", "legacy-wayfarer-r002"),
  );
  const assigned = tool(
    "assign",
    "--operation-id", "rehearsal-assign-00001",
    "--character-id", actorX.id,
    "--prefab-id", "legacy-wayfarer-r002",
    "--allow-legacy",
  );
  tool("assign", "--operation-id", "rehearsal-assign-00001", "--character-id", actorX.id, "--prefab-id", "legacy-wayfarer-r002", "--allow-legacy");
  await wait(
    () => x.db.ownShips.count() === 1n && x.db.ownGameShipAccess.count() === 1n && x.db.ownConstructionLocation.count() === 1n,
    "assigned ship visible to its owner",
  );
  const boarded = [...x.db.ownCharacters.iter()][0]!;
  assert.equal(boarded.shipId, assigned.summary.shipId);
  assert.deepEqual(kit().map((i) => i.id).sort(), personalBefore, "assignment does not duplicate the kit");
  assert.equal(y.db.ownShips.count(), 0n, "other accounts remain shipless");
  evidence.assign = { shipId: assigned.summary.shipId, prefabId: assigned.summary.prefabId, deckId: assigned.summary.deckId };
  console.log(JSON.stringify(evidence, null, 1));
  writeFileSync(join(evidenceDirectory, "ship-wipe-smoke.json"), JSON.stringify(evidence, null, 1));
} finally {
  x.disconnect();
  y.disconnect();
}
