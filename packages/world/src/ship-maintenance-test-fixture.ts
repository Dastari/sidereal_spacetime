/**
 * Shared in-memory SpacetimeDB stand-in for the ship maintenance tests
 * (ship-wipe.test.ts, prefab-ship-assign.test.ts). Test files must still
 * `vi.mock("spacetimedb/server")` and `vi.mock("./auth")` before importing this.
 */
import { Identity } from "spacetimedb";
import { createWayfarerStarterAuthority } from "./wayfarer-starter-authority";
import { PRESERVED_MAP_TABLES, WIPED_SHIP_TABLES } from "./ship-wipe";

export type Row = Record<string, any>;
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

export function fixture() {
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
          count: () => BigInt(rows.length),
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

export const OWNER_A = "04".repeat(32);
export const OWNER_B = "05".repeat(32);

/** Two real starter Wayfarers, plus ship cargo, a deck crate with a hotbar item
 * and a ground binding, and a Studio-style test instance without a ship row. */
export function seeded() {
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

export const counts = (f: ReturnType<typeof fixture>) => ({
  ships: f.db.ship.rows.length,
  instances: f.db.constructionInstance.rows.length,
  characters: f.db.character.rows.length,
});
export const mapState = (f: ReturnType<typeof fixture>) =>
  JSON.stringify(
    PRESERVED_MAP_TABLES.map((t) => [t, f.db[t].rows]),
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
  );

