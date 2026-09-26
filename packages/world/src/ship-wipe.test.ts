import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
  canReadGame: (ctx: { live: boolean }) => ctx.live,
}));
import { createWayfarerStarterAuthority } from "./wayfarer-starter-authority";
import { SHIP_OPERATOR } from "./ship-operator";
import {
  PRESERVED_MAP_TABLES,
  WIPED_SHIP_TABLES,
  wipePlayerShips,
} from "./ship-wipe";
import {
  createShiplessCharacter,
  onboardNewCharacter,
  setStarterPrefab,
  starterPrefabId,
} from "./ship-policy";
import {
  assignPrefabShip,
  LEGACY_WAYFARER_PREFAB_ID,
  registerPrefabShipSpawner,
} from "./ship-assign";

type Row = Record<string, any>;
let fixtureSequence = 0;
const PRIMARY: Record<string, string> = {
  personalStarterReceipt: "owner",
  gameShipAccess: "shipId",
  shipWorldMotion: "shipId",
  bodyWorldMotion: "bodyId",
  worldAdmission: "characterId",
  constructionFlightBinding: "shipId",
  constructionFlightCompiled: "shipId",
  constructionFlightDirty: "shipId",
  constructionFlightStation: "stationId",
  constructionLocation: "characterId",
  input: "characterId",
  inventoryState: "characterId",
  inventoryContainerScope: "containerId",
  inventoryItemMembership: "itemId",
  instanceInventoryBinding: "placedObjectId",
  constructionInteractionBinding: "objectId",
  constructionPilotSeat: "characterId",
  shipZoneState: "shipId",
  pilotLayoutReceipt: "shipId",
  legacyBodyAlias: "legacyBodyId",
  constructionStairWalk: "characterId",
  constructionStairReservation: "stairId",
  constructionTraversal: "characterId",
  constructionTraversalReservation: "linkId",
  couchSeat: "characterId",
  constructionPassengerVisit: "characterId",
  constructionFlightReview: "characterId",
  constructionReviewOrigin: "characterId",
  constructionCargoAssembly: "containerId",
  constructionCargoPlacement: "containerId",
  weaponEnergy: "itemId",
  shipOperatorOperation: "operationId",
  characterUniformIssue: "characterId",
};
const FIELD: Record<string, string> = {
  by_owner: "owner",
  by_system: "systemId",
  by_ship: "shipId",
  by_root: "rootContainerId",
  by_deck: "deckId",
  by_instance: "instanceId",
  by_character: "characterId",
  by_principal: "principal",
  by_operation: "operationId",
};

function fixture() {
  const tables = new Map<string, Row[]>();
  const key = (v: unknown) => String(v);
  const db = new Proxy({} as Record<string, any>, {
    get(target, name: string) {
      if (target[name]) return target[name];
      const rows: Row[] = [];
      tables.set(name, rows);
      const pk = PRIMARY[name] ?? "id";
      target[name] = new Proxy(
        {
          rows,
          iter: () => rows.values(),
          delete: (row: Row) => {
            const at = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
            if (at < 0) return false;
            rows.splice(at, 1);
            return true;
          },
          insert: (row: Row) => {
            if (rows.some((r) => key(r[pk]) === key(row[pk])))
              throw Error("Duplicate row:" + name);
            rows.push({ ...row });
            return row;
          },
        },
        {
          get(t, index: string) {
            if (index in t) return (t as any)[index];
            const column = FIELD[index] ?? index;
            return {
              find: (value: unknown) =>
                rows.find((r) => key(r[column]) === key(value)),
              filter: (value: unknown) =>
                rows.filter((r) => key(r[column]) === key(value)),
              update: (row: Row) => {
                const at = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
                if (at < 0) throw Error("Missing row");
                rows[at] = { ...row };
              },
              delete: (value: unknown) => {
                const at = rows.findIndex((r) => key(r[column]) === key(value));
                if (at >= 0) rows.splice(at, 1);
              },
            };
          },
        },
      );
      return target[name];
    },
  });
  let sequence = 1 + ++fixtureSequence * 100000;
  const raw = {
    db,
    sender: Identity.fromString("04".repeat(32)),
    live: true,
    timestamp: { microsSinceUnixEpoch: 123000000n },
    newUuidV4: () => ({
      toString: () =>
        `55555555-5555-4555-8555-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  const ctx = raw as any;
  const as = (hex: string) => {
    raw.sender = Identity.fromString(hex);
    return raw.sender;
  };
  const snapshot = () =>
    JSON.stringify(
      [...tables]
        .filter(([, rows]) => rows.length)
        .sort(([a], [b]) => a.localeCompare(b)),
      (_, v) =>
        typeof v === "bigint"
          ? v.toString()
          : v && typeof v.toHexString === "function"
            ? v.toHexString()
            : v,
    );
  // Touch every table once so snapshots compare equal sets of names.
  for (const name of [...WIPED_SHIP_TABLES, ...PRESERVED_MAP_TABLES]) void db[name];
  return { ctx, raw, db, tables, as, snapshot };
}

const OWNER_A = "04".repeat(32);
const OWNER_B = "05".repeat(32);

/** Two real starter Wayfarers, plus ship cargo, a deck crate with a hotbar item
 * and a ground binding, and a Studio-style test instance without a ship row. */
function seeded() {
  const f = fixture();
  f.as(OWNER_A);
  const a = createWayfarerStarterAuthority(f.ctx, "Alpha");
  f.as(OWNER_B);
  const b = createWayfarerStarterAuthority(f.ctx, "Beta");
  const personalA = f.db.inventoryItem.rows
    .filter((r: Row) => r.characterId === a.actor.id)
    .map((r: Row) => r.id)
    .sort();
  const cargoGrid = f.db.inventoryContainer.rows.find(
    (c: Row) => c.shipId === a.actor.shipId && c.characterId === "",
  );
  f.db.inventoryItem.insert({
    id: "cargo-item",
    characterId: a.actor.id,
    definitionId: "power-cell",
    containerId: cargoGrid.id,
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  });
  f.db.inventoryItemMembership.insert({
    itemId: "cargo-item",
    revision: 1n,
    containerId: cargoGrid.id,
    rootContainerId: cargoGrid.id,
    rootCharacterId: "",
  });
  f.db.inventoryContainer.insert({
    id: "deck-crate",
    characterId: a.actor.id,
    parentItemId: "",
    kind: "grid",
    name: "Dropped crate",
    width: 4,
    height: 4,
    maxMassKg: 50,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    shipId: a.actor.shipId,
    localX: 1,
    localY: 1,
    carried: false,
  });
  f.db.inventoryItem.insert({
    id: "crate-item",
    characterId: a.actor.id,
    definitionId: "medkit",
    containerId: "deck-crate",
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  });
  f.db.storageBinding.insert({
    id: "ground-binding",
    characterId: a.actor.id,
    containerId: "deck-crate",
    placementId: "ground:1",
  });
  f.db.inventoryHotbar.insert({
    id: `${a.actor.id}:9`,
    characterId: a.actor.id,
    slot: 9,
    itemId: "crate-item",
  });
  f.db.weaponEnergy.insert({ itemId: "crate-item", energy: 1 });
  f.db.constructionInstance.insert({
    id: "studio-test-instance",
    owner: Identity.fromString("06".repeat(32)),
    workspaceId: "studio",
    blueprintId: "bp",
    blueprintSha256: "abc",
    name: "Test ship",
    revision: 1n,
  });
  f.db.systemMapDefinition.insert({ id: "map", json: "{}" });
  f.db.fieldAsteroid.insert({ id: "rock" });
  return { f, a, b, personalA };
}

const counts = (f: ReturnType<typeof fixture>) => ({
  ships: f.db.ship.rows.length,
  instances: f.db.constructionInstance.rows.length,
  characters: f.db.character.rows.length,
});
const mapState = (f: ReturnType<typeof fixture>) =>
  JSON.stringify(
    PRESERVED_MAP_TABLES.map((t) => [t, f.db[t].rows]),
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
  );

/** Minimal non-legacy prefab stand-in: boards the existing character with the
 * rows the interface contract requires (no Wayfarer involved). */
const TEST_PREFAB = "test.s.probe";
const REV = "ship-components.v1:test";
let probeSequence = 0;
registerPrefabShipSpawner({
  prefabId: TEST_PREFAB,
  catalogRevision: REV,
  blueprintSha256: "f".repeat(64),
  legacy: false,
  description: "unit-test prefab",
  spawn(ctx: any, actor: any, request: any) {
    const shipId = `probe-ship-${++probeSequence}`,
      deckId = `probe-deck-${probeSequence}`;
    const pose =
      request.pose.kind === "at"
        ? request.pose
        : { systemId: "canonical", x: 100 * probeSequence, y: 0, heading: 0 };
    ctx.db.ship.insert({ id: shipId, owner: actor.owner, name: request.name + " Probe", revision: 1n });
    ctx.db.shipWorldMotion.insert({ shipId, systemId: pose.systemId, x: pose.x, y: pose.y, heading: pose.heading });
    ctx.db.character.id.update({ ...actor, shipId, localX: 1, localY: 2 });
    ctx.db.constructionLocation.insert({ characterId: actor.id, instanceId: shipId, deckId });
    ctx.db.input.insert({ characterId: actor.id, dx: 0, dy: 0 });
    ctx.db.worldAdmission.insert({ characterId: actor.id, owner: actor.owner, shipId, systemId: pose.systemId });
    ctx.db.gameShipAccess.insert({ shipId, instanceId: shipId, owner: actor.owner, characterId: actor.id, deckId, lifecycle: "active" });
    return { shipId, deckId };
  },
});

test("starter prefab defaults to none; only the operator changes it; legacy needs explicit opt-in", () => {
  const f = fixture();
  expect(starterPrefabId(f.ctx)).toBe("");
  const set = (operationId: string, prefabId: string, rev: string, allowLegacy = false) =>
    setStarterPrefab(f.ctx, { operationId, prefabId, expectedCatalogRevision: rev, allowLegacy });
  expect(() => set("policy-0000001", TEST_PREFAB, REV)).toThrow("Deployment operator");
  f.as(SHIP_OPERATOR);
  expect(() => set("policy-0000001", "missing-prefab", REV)).toThrow("Unknown prefab");
  expect(() => set("policy-0000001", TEST_PREFAB, "stale")).toThrow("catalog revision");
  expect(() => set("policy-0000001", LEGACY_WAYFARER_PREFAB_ID, "legacy-wayfarer")).toThrow("legacy ship");
  set("policy-0000001", TEST_PREFAB, REV);
  expect(starterPrefabId(f.ctx)).toBe(TEST_PREFAB);
  const before = f.snapshot();
  set("policy-0000001", TEST_PREFAB, REV);
  expect(f.snapshot()).toBe(before);
  expect(() => set("policy-0000001", "", "")).toThrow("different ship maintenance request");
  set("policy-0000002", "", "");
  expect(starterPrefabId(f.ctx)).toBe("");
});

test("new players never get a legacy Wayfarer by default: shipless with the personal kit", () => {
  const f = fixture();
  f.as(OWNER_A);
  const id = onboardNewCharacter(f.ctx, "  Nova  ");
  const actor = f.db.character.id.find(id);
  expect(actor).toMatchObject({ name: "Nova", shipId: "", localX: 0, localY: 0 });
  expect(f.db.ship.rows).toEqual([]);
  expect(f.db.constructionInstance.rows).toEqual([]);
  expect(f.db.inventoryItem.rows.filter((r: Row) => r.characterId === id)).toHaveLength(7);
  expect(f.db.inventoryContainer.rows.every((c: Row) => c.shipId === "")).toBe(true);
  expect(() => createShiplessCharacter(f.ctx, "Again")).toThrow("already has a character");
});

test("a configured non-legacy starter prefab boards new players through the spawner", () => {
  const f = fixture();
  f.as(SHIP_OPERATOR);
  setStarterPrefab(f.ctx, { operationId: "policy-0000001", prefabId: TEST_PREFAB, expectedCatalogRevision: REV, allowLegacy: false });
  f.as(OWNER_B);
  const id = onboardNewCharacter(f.ctx, "Rook");
  const actor = f.db.character.id.find(id);
  expect(actor.shipId).toMatch(/^probe-ship-/);
  expect(f.db.gameShipAccess.shipId.find(actor.shipId)).toMatchObject({ characterId: id, lifecycle: "active" });
  expect(
    f.db.inventoryContainer.rows
      .filter((c: Row) => c.characterId === id)
      .every((c: Row) => c.shipId === actor.shipId),
  ).toBe(true);
  expect(f.db.constructionInstance.rows).toEqual([]);
});

test("dry-run reports counts and a per-item manifest and changes nothing but its ledger row", () => {
  const { f } = seeded();
  const args = { operationId: "wipe-dry-0001", dryRun: true, expectedShips: 0, expectedInstances: 0, expectedCharacters: 0 };
  expect(() => wipePlayerShips(f.ctx, args)).toThrow("Deployment operator");
  f.as(SHIP_OPERATOR);
  const before = f.snapshot();
  wipePlayerShips(f.ctx, args);
  const ledger = f.db.shipOperatorOperation.rows;
  expect(ledger).toHaveLength(1);
  const summary = JSON.parse(ledger[0].summaryJson);
  expect(summary.counts).toEqual({
    ships: 2,
    instances: 3,
    characters: 2,
    personalItemsPreserved: 14,
    personalContainersPreserved: 6,
  });
  expect(summary.expectedCountsMatch).toBe(false);
  expect(summary.deleteRows.inventoryItem).toBe(2);
  expect(summary.deleteRows.inventoryContainer).toBe(9);
  expect(summary.deleteRows.ship).toBe(2);
  expect(summary.archivedInventory.map((r: Row) => [r.itemId, r.reason]).sort()).toEqual([
    ["cargo-item", "ship-cargo-container"],
    ["crate-item", "ground-drop-on-ship-deck"],
  ]);
  expect(summary.starterPrefabId).toBe("");
  expect(summary.characters.map((c: Row) => c.archivedItems).sort()).toEqual([0, 2]);
  f.db.shipOperatorOperation.rows.length = 0;
  expect(f.snapshot()).toBe(before);
});

test("apply refuses a legacy starter or stale counts, then wipes all ships and preserves characters, personal kit and map", () => {
  const { f, a, personalA } = seeded();
  f.as(SHIP_OPERATOR);
  const expected = { expectedShips: 2, expectedInstances: 3, expectedCharacters: 2 };
  const actorsBefore = f.db.character.rows.map((r: Row) => ({ ...r }));
  const map = mapState(f);
  setStarterPrefab(f.ctx, { operationId: "policy-legacy-01", prefabId: LEGACY_WAYFARER_PREFAB_ID, expectedCatalogRevision: "legacy-wayfarer", allowLegacy: true });
  expect(() =>
    wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, ...expected }),
  ).toThrow("legacy starter is configured");
  setStarterPrefab(f.ctx, { operationId: "policy-none-001", prefabId: "", expectedCatalogRevision: "", allowLegacy: false });
  expect(() =>
    wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, ...expected, expectedShips: 3 }),
  ).toThrow("run a new dry-run");
  wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, ...expected });

  for (const table of WIPED_SHIP_TABLES) expect([table, f.db[table].rows]).toEqual([table, []]);
  expect(counts(f)).toEqual({ ships: 0, instances: 0, characters: 2 });
  expect(mapState(f)).toBe(map);
  for (const before of actorsBefore) {
    const now = f.db.character.id.find(before.id);
    expect(now).toMatchObject({ id: before.id, name: before.name, shipId: "", localX: 0, localY: 0 });
    expect(now.owner.toHexString()).toBe(before.owner.toHexString());
  }
  expect(
    f.db.inventoryItem.rows.filter((r: Row) => r.characterId === a.actor.id).map((r: Row) => r.id).sort(),
  ).toEqual(personalA);
  expect(f.db.inventoryItem.rows).toHaveLength(14);
  expect(f.db.inventoryContainer.rows).toHaveLength(6);
  expect(f.db.inventoryContainer.rows.every((c: Row) => c.shipId === "")).toBe(true);
  expect(f.db.inventoryHotbar.rows.some((h: Row) => h.itemId === "crate-item")).toBe(false);
  expect(f.db.storageBinding.rows).toEqual([]);
  expect(f.db.weaponEnergy.rows).toEqual([]);
  expect(f.db.inventoryItemMembership.rows).toHaveLength(14);
  expect(f.db.inventoryContainerScope.rows).toHaveLength(6);
  expect(f.db.personalStarterReceipt.rows).toHaveLength(2);
  const archived = f.db.shipWipeArchive.rows;
  const archivedItems = archived
    .filter((r: Row) => r.tableName === "inventoryItem" && r.action === "deleted")
    .map((r: Row) => JSON.parse(r.rowJson).id)
    .sort();
  expect(archivedItems).toEqual(["cargo-item", "crate-item"]);
  expect(archived.filter((r: Row) => r.tableName === "ship")).toHaveLength(2);
  expect(archived.filter((r: Row) => r.tableName === "character" && r.action === "updated")).toHaveLength(2);
  expect(JSON.parse(archived.find((r: Row) => r.tableName === "ship").rowJson).owner).toHaveProperty("$identity");

  const after = f.snapshot();
  wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, ...expected });
  expect(f.snapshot()).toBe(after);
  wipePlayerShips(f.ctx, { operationId: "wipe-apply-0002", dryRun: false, expectedShips: 0, expectedInstances: 0, expectedCharacters: 2 });
  expect(counts(f)).toEqual({ ships: 0, instances: 0, characters: 2 });
});

test("operator assigns a registered prefab (id, catalog revision, spawn pose) to an awaiting character only", () => {
  const { f, a, b, personalA } = seeded();
  f.as(SHIP_OPERATOR);
  wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, expectedShips: 2, expectedInstances: 3, expectedCharacters: 2 });
  const pose = { kind: "at", systemId: "canonical", x: 1234.5, y: -50, heading: 0.5 };
  const args = {
    operationId: "assign-0001",
    characterId: a.actor.id,
    prefabId: TEST_PREFAB,
    expectedCatalogRevision: REV,
    spawnPoseJson: JSON.stringify(pose),
    expectedCharacterShipId: "",
    allowLegacy: false,
  };
  f.as(OWNER_A);
  expect(() => assignPrefabShip(f.ctx, args)).toThrow("Deployment operator");
  f.as(SHIP_OPERATOR);
  expect(() => assignPrefabShip(f.ctx, { ...args, prefabId: "missing-prefab" })).toThrow("Unknown prefab ship");
  expect(() => assignPrefabShip(f.ctx, { ...args, expectedCatalogRevision: "old" })).toThrow("catalog revision");
  expect(() =>
    assignPrefabShip(f.ctx, { ...args, prefabId: LEGACY_WAYFARER_PREFAB_ID, expectedCatalogRevision: "legacy-wayfarer" }),
  ).toThrow("legacy ship being removed");
  expect(() => assignPrefabShip(f.ctx, { ...args, spawnPoseJson: '{"kind":"at","x":1}' })).toThrow("Spawn pose");
  assignPrefabShip(f.ctx, args);
  const actor = f.db.character.id.find(a.actor.id);
  expect(actor.shipId).toMatch(/^probe-ship-/);
  expect(actor.name).toBe("Alpha");
  expect(actor.owner.toHexString()).toBe(OWNER_A);
  expect(f.db.shipWorldMotion.shipId.find(actor.shipId)).toMatchObject({ x: 1234.5, y: -50, heading: 0.5 });
  expect(f.db.ship.id.find(actor.shipId).owner.toHexString()).toBe(OWNER_A);
  expect(f.db.gameShipAccess.shipId.find(actor.shipId)).toMatchObject({ characterId: a.actor.id, lifecycle: "active" });
  expect(
    f.db.inventoryItem.rows.filter((r: Row) => r.characterId === a.actor.id).map((r: Row) => r.id).sort(),
  ).toEqual(personalA);
  expect(
    f.db.inventoryContainer.rows
      .filter((c: Row) => c.characterId === a.actor.id)
      .every((c: Row) => c.shipId === actor.shipId),
  ).toBe(true);
  expect(f.db.character.id.find(b.actor.id).shipId).toBe("");
  const ledger = JSON.parse(f.db.shipOperatorOperation.operationId.find("assign-0001").summaryJson);
  expect(ledger).toMatchObject({ prefabId: TEST_PREFAB, catalogRevision: REV, legacy: false, pose: { x: 1234.5 } });
  const after = f.snapshot();
  assignPrefabShip(f.ctx, args);
  expect(f.snapshot()).toBe(after);
  expect(() => assignPrefabShip(f.ctx, { ...args, operationId: "assign-0002" })).toThrow("Character ship changed");
  expect(() =>
    assignPrefabShip(f.ctx, { ...args, operationId: "assign-0003", expectedCharacterShipId: actor.shipId }),
  ).toThrow("already has a ship");
});

test("the legacy stand-in is reachable only with an explicit operator opt-in", () => {
  const { f, a } = seeded();
  f.as(SHIP_OPERATOR);
  wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, expectedShips: 2, expectedInstances: 3, expectedCharacters: 2 });
  assignPrefabShip(f.ctx, {
    operationId: "assign-legacy-1",
    characterId: a.actor.id,
    prefabId: LEGACY_WAYFARER_PREFAB_ID,
    expectedCatalogRevision: "legacy-wayfarer",
    spawnPoseJson: "",
    expectedCharacterShipId: "",
    allowLegacy: true,
  });
  const actor = f.db.character.id.find(a.actor.id);
  expect(f.db.constructionInstance.id.find(actor.shipId)).toBeTruthy();
  expect(f.db.inventoryItem.rows.filter((r: Row) => r.characterId === a.actor.id)).toHaveLength(7);
});

test("a spawner that ignores the requested pose is rolled back by the reducer checks", () => {
  const { f, b } = seeded();
  f.as(SHIP_OPERATOR);
  wipePlayerShips(f.ctx, { operationId: "wipe-apply-0001", dryRun: false, expectedShips: 2, expectedInstances: 3, expectedCharacters: 2 });
  registerPrefabShipSpawner({
    prefabId: "test.s.liar",
    catalogRevision: REV,
    blueprintSha256: "e".repeat(64),
    legacy: false,
    description: "ignores pose",
    spawn(ctx: any, actor: any) {
      ctx.db.ship.insert({ id: "liar", owner: actor.owner, name: "Liar", revision: 1n });
      ctx.db.shipWorldMotion.insert({ shipId: "liar", systemId: "canonical", x: 0, y: 0, heading: 0 });
      ctx.db.character.id.update({ ...actor, shipId: "liar" });
      ctx.db.constructionLocation.insert({ characterId: actor.id, instanceId: "liar", deckId: "d" });
      ctx.db.worldAdmission.insert({ characterId: actor.id, shipId: "liar" });
      ctx.db.gameShipAccess.insert({ shipId: "liar", owner: actor.owner, characterId: actor.id, lifecycle: "active" });
      return { shipId: "liar", deckId: "d" };
    },
  });
  expect(() =>
    assignPrefabShip(f.ctx, {
      operationId: "assign-liar-01",
      characterId: b.actor.id,
      prefabId: "test.s.liar",
      expectedCatalogRevision: REV,
      spawnPoseJson: JSON.stringify({ kind: "at", systemId: "canonical", x: 9, y: 9, heading: 0 }),
      expectedCharacterShipId: "",
      allowLegacy: false,
    }),
  ).toThrow("requested pose");
});
