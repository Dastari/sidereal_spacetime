import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import {
  archiveJson,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
import { starterShipsEnabled } from "./ship-policy";
import {
  legacyInventorySnapshot,
  synchronizeLegacyInventory,
} from "./scoped-inventory-authority";
import { planLegacyInventoryMetadata } from "./scoped-inventory-migration";

type Context = ReducerCtx<InferSchema<typeof world>>;
type Db = Context["db"];
type Row = Record<string, unknown>;

/** Every row of these tables belongs to a ship or construction instance, or to a
 * character's presence aboard one. Wiping ALL player ships deletes them
 * completely. Global clocks, authoring documents, grants, receipts/audits,
 * authentication, appearance and every map/system/Genesis table are excluded. */
export const WIPED_SHIP_TABLES = [
  // Ship core
  "ship",
  "station",
  "shipWorldMotion",
  "constructionInstance",
  "constructionDeck",
  "gameShipAccess",
  "constructionFlightBinding",
  "constructionFlightStation",
  "constructionFlightFitting",
  "constructionFlightCompiled",
  "constructionFlightDirty",
  // Flight, damage, zones and legacy per-ship bodies
  "constructionFlightDamageEvent",
  "constructionPilotSeat",
  "actuatorOutput",
  "spaceBody",
  "legacyBodyAlias",
  "shipZoneState",
  "pilotLayoutReceipt",
  // Doors, airlocks, pressure, stairs, traversal
  "constructionDoor",
  "constructionAirlock",
  "constructionNativePressure",
  "constructionAtmosphere",
  "constructionStairLink",
  "constructionStairWalk",
  "constructionStairReservation",
  "constructionTraversalLink",
  "constructionTraversal",
  "constructionTraversalReservation",
  // Seats, interactions, passengers, review
  "constructionInteractionBinding",
  "interactionObject",
  "couchSeat",
  "constructionPassengerGrant",
  "constructionPassengerVisit",
  "constructionFlightReview",
  "constructionReviewOrigin",
  // Refit and fitted cargo structure
  "wayfarerRefitAttachment",
  "constructionCargoAssembly",
  "constructionCargoGrid",
  "constructionCargoPlacement",
  "instanceInventoryBinding",
  // Character presence aboard a ship (character rows themselves are preserved)
  "constructionLocation",
  "worldAdmission",
  "input",
] as const satisfies readonly (keyof Db)[];

/** Map/system/Genesis state. Never written by ship maintenance; counted in every
 * summary so dry-run/apply evidence shows them unchanged. */
export const PRESERVED_MAP_TABLES = [
  "worldSystem",
  "systemBody",
  "bodyWorldMotion",
  "celestialMigrationReceipt",
  "systemZone",
  "systemMapDefinition",
  "fieldAsteroid",
  "systemMapEdit",
] as const satisfies readonly (keyof Db)[];

const ROW_BUDGET = 200_000;

function iterRows(db: Db, table: keyof Db): Row[] {
  const rows: Row[] = [];
  for (const row of (db[table] as unknown as { iter(): Iterable<Row> }).iter()) {
    if (rows.length >= ROW_BUDGET) throw new SenderError("Ship wipe row budget exceeded");
    rows.push(row);
  }
  return rows;
}

export function countRows(db: Db, table: keyof Db) {
  let count = 0;
  for (const _ of (db[table] as unknown as { iter(): Iterable<unknown> }).iter()) count++;
  return count;
}

/** Personal inventory = everything whose containment root is the character's
 * carried pockets (including equipped items and nested bags/liquids). All other
 * inventory rows are ship-held (ship cargo, deck crates, lab storage, ground
 * drops) and are archived then deleted with the ships. */
export function classifyInventory(ctx: Context) {
  const personalContainers = new Set<string>(),
    personalItems = new Set<string>(),
    snapshots = new Map<string, ReturnType<typeof legacyInventorySnapshot>>();
  for (const actor of [...ctx.db.character.iter()]) {
    const snapshot = legacyInventorySnapshot(ctx, actor.id);
    snapshots.set(actor.id, snapshot);
    let plan;
    try {
      plan = planLegacyInventoryMetadata(actor.id, snapshot, snapshot);
    } catch (error) {
      throw new SenderError(
        `Inventory of character ${actor.id} cannot be classified: ${String(error)}`,
      );
    }
    for (const m of plan.containerMembership)
      if (m.rootKind === "character") personalContainers.add(m.containerId);
    for (const m of plan.itemMembership)
      if (m.rootKind === "character") personalItems.add(m.itemId);
  }
  const shipHeldContainers = [...ctx.db.inventoryContainer.iter()]
    .filter((c) => !personalContainers.has(c.id))
    .map((c) => c.id);
  const shipHeldItems = [...ctx.db.inventoryItem.iter()]
    .filter((i) => !personalItems.has(i.id))
    .map((i) => i.id);
  return {
    personalContainers,
    personalItems,
    shipHeldContainers: new Set(shipHeldContainers),
    shipHeldItems: new Set(shipHeldItems),
    snapshots,
  };
}

export type ShipWipeArgs = {
  operationId: string;
  dryRun: boolean;
  expectedShips: number;
  expectedInstances: number;
  expectedCharacters: number;
};

export function planShipWipe(ctx: Context) {
  const inventory = classifyInventory(ctx);
  const tables: Record<string, number> = {};
  for (const table of WIPED_SHIP_TABLES) tables[table] = countRows(ctx.db, table);
  const derived = {
    inventoryItem: inventory.shipHeldItems.size,
    inventoryContainer: inventory.shipHeldContainers.size,
    inventoryItemMembership: [...ctx.db.inventoryItemMembership.iter()]
      .filter((m) => inventory.shipHeldItems.has(m.itemId)).length,
    inventoryContainerScope: [...ctx.db.inventoryContainerScope.iter()]
      .filter((s) => inventory.shipHeldContainers.has(s.containerId)).length,
    inventoryHotbar: [...ctx.db.inventoryHotbar.iter()]
      .filter((h) => inventory.shipHeldItems.has(h.itemId)).length,
    storageBinding: [...ctx.db.storageBinding.iter()]
      .filter((b) => inventory.shipHeldContainers.has(b.containerId)).length,
    weaponEnergy: [...ctx.db.weaponEnergy.iter()]
      .filter((w) => inventory.shipHeldItems.has(w.itemId)).length,
  };
  const characters = [...ctx.db.character.iter()].map((a) => ({
    id: a.id,
    name: a.name,
    owner: a.owner.toHexString(),
    shipId: a.shipId,
    connected: a.connected,
    personalItems: [...ctx.db.inventoryItem.by_character.filter(a.id)]
      .filter((i) => inventory.personalItems.has(i.id)).length,
    archivedItems: [...ctx.db.inventoryItem.by_character.filter(a.id)]
      .filter((i) => inventory.shipHeldItems.has(i.id)).length,
  }));
  const ships = [...ctx.db.ship.iter()].map((s) => ({
    id: s.id,
    name: s.name,
    owner: s.owner.toHexString(),
    blueprintSha256:
      ctx.db.constructionInstance.id.find(s.id)?.blueprintSha256 ?? "",
  }));
  const instances = [...ctx.db.constructionInstance.iter()].map((i) => ({
    id: i.id,
    name: i.name,
    owner: i.owner.toHexString(),
    workspaceId: i.workspaceId,
    blueprintSha256: i.blueprintSha256,
    hasShipRow: !!ctx.db.ship.id.find(i.id),
  }));
  const preservedMapRows: Record<string, number> = {};
  for (const table of PRESERVED_MAP_TABLES)
    preservedMapRows[table] = countRows(ctx.db, table);
  return {
    inventory,
    summary: {
      counts: {
        ships: ships.length,
        instances: instances.length,
        characters: characters.length,
        personalItemsPreserved: inventory.personalItems.size,
        personalContainersPreserved: inventory.personalContainers.size,
      },
      ships,
      instances,
      characters,
      deleteRows: { ...tables, ...derived },
      preservedMapRows,
      starterShipsEnabled: starterShipsEnabled(ctx),
    },
  };
}

function archiveDelete(
  ctx: Context,
  operationId: string,
  sequence: { next: number },
  table: string,
  row: Row,
) {
  ctx.db.shipWipeArchive.insert({
    id: `${operationId}:${String(sequence.next++).padStart(7, "0")}`,
    operationId,
    tableName: table,
    action: "deleted",
    rowJson: archiveJson(row),
  });
  (ctx.db[table as keyof Db] as unknown as { delete(row: Row): boolean }).delete(
    row,
  );
}

export function archiveUpdate(
  ctx: Context,
  operationId: string,
  sequence: { next: number },
  table: string,
  before: Row,
) {
  ctx.db.shipWipeArchive.insert({
    id: `${operationId}:${String(sequence.next++).padStart(7, "0")}`,
    operationId,
    tableName: table,
    action: "updated",
    rowJson: archiveJson(before),
  });
}

/** Operator-only, all-or-nothing wipe of every player ship and construction
 * instance. Characters keep their UUID, owner, name, appearance, personal
 * inventory and receipts, and enter the explicit awaiting-ship state
 * (`shipId = ""`, local position 0,0) until an operator assigns a prefab ship. */
export function wipePlayerShips(ctx: Context, args: ShipWipeArgs) {
  requireShipOperator(ctx);
  const kind = args.dryRun ? "wipe-dry-run" : "wipe-apply";
  const request = JSON.stringify({
    dryRun: args.dryRun,
    expectedShips: args.expectedShips,
    expectedInstances: args.expectedInstances,
    expectedCharacters: args.expectedCharacters,
  });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, kind, request)) return;
  const { inventory, summary } = planShipWipe(ctx);
  const mismatch =
    summary.counts.ships !== args.expectedShips ||
    summary.counts.instances !== args.expectedInstances ||
    summary.counts.characters !== args.expectedCharacters;
  const record = (extra: Record<string, unknown>) =>
    ctx.db.shipOperatorOperation.insert({
      operationId: args.operationId,
      principal: ctx.sender,
      kind,
      request,
      summaryJson: archiveJson({ mode: kind, ...summary, ...extra }),
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  if (args.dryRun) {
    record({ expectedCountsMatch: !mismatch });
    console.log(`ship wipe dry-run ${args.operationId}: ${archiveJson(summary.counts)}`);
    return;
  }
  if (mismatch)
    throw new SenderError(
      `Ship wipe expected ${args.expectedShips} ships/${args.expectedInstances} instances/${args.expectedCharacters} characters but found ${summary.counts.ships}/${summary.counts.instances}/${summary.counts.characters}; run a new dry-run`,
    );
  if (summary.starterShipsEnabled)
    throw new SenderError(
      "Disable starter ships (operator_set_starter_ships false) before wiping",
    );
  const sequence = { next: 0 };
  const op = args.operationId;

  // 1. Ship-held inventory and its metadata (before-images archived).
  for (const row of [...ctx.db.inventoryHotbar.iter()].filter((h) => inventory.shipHeldItems.has(h.itemId)))
    archiveDelete(ctx, op, sequence, "inventoryHotbar", row);
  for (const row of [...ctx.db.weaponEnergy.iter()].filter((w) => inventory.shipHeldItems.has(w.itemId)))
    archiveDelete(ctx, op, sequence, "weaponEnergy", row);
  for (const row of [...ctx.db.storageBinding.iter()].filter((b) => inventory.shipHeldContainers.has(b.containerId)))
    archiveDelete(ctx, op, sequence, "storageBinding", row);
  for (const row of [...ctx.db.inventoryItemMembership.iter()].filter((m) => inventory.shipHeldItems.has(m.itemId)))
    archiveDelete(ctx, op, sequence, "inventoryItemMembership", row);
  for (const row of [...ctx.db.inventoryContainerScope.iter()].filter((s) => inventory.shipHeldContainers.has(s.containerId)))
    archiveDelete(ctx, op, sequence, "inventoryContainerScope", row);
  for (const row of [...ctx.db.inventoryItem.iter()].filter((i) => inventory.shipHeldItems.has(i.id)))
    archiveDelete(ctx, op, sequence, "inventoryItem", row);
  for (const row of [...ctx.db.inventoryContainer.iter()].filter((c) => inventory.shipHeldContainers.has(c.id)))
    archiveDelete(ctx, op, sequence, "inventoryContainer", row);

  // 2. Every ship/instance-scoped row.
  for (const table of WIPED_SHIP_TABLES)
    for (const row of iterRows(ctx.db, table)) archiveDelete(ctx, op, sequence, table, row);

  // 3. Personal containers no longer reference a ship that does not exist.
  for (const container of [...ctx.db.inventoryContainer.iter()].filter((c) => c.shipId !== "")) {
    archiveUpdate(ctx, op, sequence, "inventoryContainer", container);
    ctx.db.inventoryContainer.id.update({ ...container, shipId: "" });
  }

  // 4. Characters enter the awaiting-ship state; identity and ownership preserved.
  for (const actor of [...ctx.db.character.iter()]) {
    archiveUpdate(ctx, op, sequence, "character", actor);
    ctx.db.character.id.update({
      ...actor,
      shipId: "",
      localX: 0,
      localY: 0,
      sprinting: false,
    });
  }

  // 5. Canonical scoped-inventory metadata and inventory revisions follow the
  // normal legacy mutation boundary for every character whose inventory changed.
  for (const [characterId, before] of inventory.snapshots) {
    synchronizeLegacyInventory(ctx, characterId, before);
    const state = ctx.db.inventoryState.characterId.find(characterId);
    if (state) {
      archiveUpdate(ctx, op, sequence, "inventoryState", state);
      ctx.db.inventoryState.characterId.update({
        ...state,
        revision: state.revision + 1n,
      });
    }
  }

  const after: Record<string, number> = {};
  for (const table of PRESERVED_MAP_TABLES) after[table] = countRows(ctx.db, table);
  if (archiveJson(after) !== archiveJson(summary.preservedMapRows))
    throw new SenderError("Ship wipe would change map state; aborted");
  record({ archivedRows: sequence.next });
  console.log(`ship wipe applied ${op}: ${sequence.next} archived rows`);
}
