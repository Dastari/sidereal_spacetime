/**
 * Operator-only in-place prefab upgrade (deployment identity, like the ship-wipe reducers).
 *
 * Replaces the prefab revision of ONE game-owned prefab ship (e.g. a live Wren r2/r3 -> the
 * registered r4) without losing anything the players own:
 * - kept: ship/instance id, deck id, owner, name, world pose, zone state, every ship container
 *   and item (same UUIDs, same contents and grid positions), personal inventory;
 * - rebuilt: the instance document/blueprint/id map, doors, flight binding/fittings/compiled
 *   state, pilot station and game-ship access, through the same trusted install path as
 *   `operator_assign_prefab_ship`, at the NEXT instance revision (revision-keyed caches never
 *   see the old layout);
 * - rebound: storage-socket containers move to the equivalent socket (same `<room>/<design>`
 *   key) with a freshly qualified standing approach; ground drops stay where a body can still
 *   stand, otherwise they move to the spawn point; the character aboard stands at the spawn.
 * Unsafe cases are refused before anything changes: an unknown source pin, a moving or piloted
 * ship, other characters or visitors aboard, pending traversals/passengers/reviews, native
 * airlock or cargo-grid structure, a container without an equivalent socket, or any other
 * ship-held container the upgrade does not understand. Every deleted or updated row is archived
 * (`ship_wipe_archive`) under the operation ID and the plan/result is recorded in the operator
 * ledger. A dry run records the plan only.
 */
import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import type world from "./index";
import {
  readShipPrefab,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabById } from "@sidereal/content/prefabs";
import {
  PREFAB_DECK_ID,
  isPrefabConstruction,
  prefabWalkFrame,
} from "@sidereal/sim/prefab-construction";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { prefabConstructionSpawnPreference } from "@sidereal/sim/prefab-deck-objects";
import {
  canOccupyDeck,
  type DeckCollisionFrame,
} from "@sidereal/sim/construction-collision";
import { PREFAB_FLIGHT_DEFINITION } from "@sidereal/sim/prefab-flight";
import { TRUSTED_PREFAB_BLUEPRINT_PREFIX } from "@sidereal/sim/game-ship-access";
import {
  archiveJson,
  archiveRow,
  mapRowCounts,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
import { GAME_OWNED_TEMPLATE_NAMESPACE } from "./game-ship-access-authority";
import {
  installPrefabShip,
  trustedPrefabTemplate,
} from "./prefab-ship-authority";
import {
  PREFAB_UPGRADE_SOURCES,
  REGISTERED_PREFAB_PINS,
  type PinnedPrefabShip,
} from "./prefab-ship-pins";
import { constructionCollision } from "./construction-doors";
import { qualifyCargoAccessPoint } from "./scoped-inventory";
import { markShipFlightDirty } from "./construction-flight-dirty";
import { WIPED_SHIP_TABLES } from "./ship-wipe";

type Context = ReducerCtx<InferSchema<typeof world>>;
type Db = Context["db"];
type Row = Record<string, unknown>;

/** Prefab walking datum: native floor top above the deck elevation (see prefab-ship-authority). */
const PREFAB_STANDING_OFFSET_M = 6 / 32;
/** The ship must be at rest: the reinstall keeps the pose and starts from zero velocity. */
const REST_SPEED_MS = 0.05;
const REST_OMEGA_RADS = 0.01;
const ROW_BUDGET = 20_000;

/**
 * Ship-scoped rows the upgrade archives and deletes before the trusted reinstall writes fresh
 * ones. `[table, column]`: rows whose column equals the ship (= instance) id. Extend this list
 * when a new per-ship table must be reset by a refit (e.g. component damage state).
 */
export const UPGRADE_REBUILT_SHIP_TABLES = [
  ["ship", "id"],
  ["station", "shipId"],
  ["shipWorldMotion", "shipId"],
  ["constructionInstance", "id"],
  ["constructionDeck", "instanceId"],
  ["gameShipAccess", "shipId"],
  ["constructionFlightBinding", "shipId"],
  ["constructionFlightStation", "shipId"],
  ["constructionFlightFitting", "shipId"],
  ["constructionFlightCompiled", "shipId"],
  ["constructionFlightDirty", "shipId"],
  ["constructionFlightDamageEvent", "shipId"],
  ["shipComponentDamage", "shipId"],
  ["shipSystemsState", "shipId"],
  ["shipSystemsDirty", "shipId"],
  ["actuatorOutput", "shipId"],
  ["pilotLayoutReceipt", "shipId"],
  ["constructionDoor", "instanceId"],
  ["constructionInteractionBinding", "instanceId"],
  ["interactionObject", "shipId"],
] as const satisfies readonly (readonly [keyof Db, string])[];

/**
 * Ship-scoped rows that make an in-place upgrade unsafe: someone is seated, moving between
 * decks, visiting, reviewing, or the ship has structure a prefab reinstall cannot carry over.
 * `deck` columns hold a deck id of the ship.
 */
export const UPGRADE_REFUSED_SHIP_TABLES = [
  ["constructionPilotSeat", "shipId"],
  ["constructionStairLink", "instanceId"],
  ["constructionStairWalk", "instanceId"],
  ["constructionStairReservation", "instanceId"],
  ["constructionTraversalLink", "instanceId"],
  ["constructionTraversal", "instanceId"],
  ["constructionTraversalReservation", "instanceId"],
  ["constructionPassengerGrant", "shipId"],
  ["constructionPassengerVisit", "shipId"],
  ["constructionFlightReview", "instanceId"],
  ["constructionReviewOrigin", "instanceId"],
  ["wayfarerRefitAttachment", "instanceId"],
  ["constructionCargoAssembly", "instanceId"],
  ["constructionCargoGrid", "instanceId"],
  ["constructionCargoPlacement", "instanceId"],
  ["constructionAtmosphere", "id"],
  ["constructionAirlock", "deck"],
  ["constructionNativePressure", "deck"],
] as const satisfies readonly (readonly [keyof Db, string])[];

/** Per-ship rows the upgrade leaves untouched (the ship id and pose are kept). */
export const UPGRADE_KEPT_SHIP_TABLES = [
  "shipZoneState",
  "spaceBody",
  "legacyBodyAlias",
  "instanceInventoryBinding",
] as const satisfies readonly (keyof Db)[];

/**
 * Presence rows of the character aboard: updated in place (new visit, spawn position, zero input)
 * by the trusted reinstall, not deleted. Couch seats are refused through their interaction objects.
 */
export const UPGRADE_PRESENCE_TABLES = [
  "constructionLocation",
  "worldAdmission",
  "input",
  "couchSeat",
] as const satisfies readonly (keyof Db)[];

const UPGRADE_CLASSIFIED_TABLES = new Set<string>([
  ...UPGRADE_REBUILT_SHIP_TABLES.map(([t]) => t),
  ...UPGRADE_REFUSED_SHIP_TABLES.map(([t]) => t),
  ...UPGRADE_KEPT_SHIP_TABLES,
  ...UPGRADE_PRESENCE_TABLES,
]);

export interface UpgradePrefabShipArgs {
  operationId: string;
  dryRun: boolean;
  shipId: string;
  expectedSourceBlueprintSha256: string;
  expectedInstanceRevision: bigint;
  targetPrefabId: string;
  expectedTargetBlueprintSha256: string;
}

function fail(message: string): never {
  throw new SenderError("Prefab upgrade: " + message);
}

function rowsWhere(db: Db, table: keyof Db, test: (row: Row) => boolean) {
  const out: Row[] = [];
  let seen = 0;
  for (const row of (
    db[table] as unknown as { iter(): Iterable<Row> }
  ).iter()) {
    if (++seen > 1_000_000) fail(`${String(table)} scan budget exceeded`);
    if (test(row)) {
      out.push(row);
      if (out.length > ROW_BUDGET) fail(`${String(table)} row budget exceeded`);
    }
  }
  return out;
}

type Point = [number, number];
const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/** Plans the upgrade from current rows. Pure reads; throws only on malformed identity. */
export function planPrefabUpgrade(ctx: Context, args: UpgradePrefabShipArgs) {
  const refusals: string[] = [];
  const refuse = (reason: string) => refusals.push(reason);
  const S = args.shipId;
  const ship = ctx.db.ship.id.find(S);
  const instance = ctx.db.constructionInstance.id.find(S);
  const motion = ctx.db.shipWorldMotion.shipId.find(S);
  const access = ctx.db.gameShipAccess.shipId.find(S);
  if (!ship || !instance || !motion || !access)
    fail("Ship, construction instance, motion and game-ship access required");
  if (
    instance.workspaceId !== GAME_OWNED_TEMPLATE_NAMESPACE ||
    !instance.blueprintId.startsWith(TRUSTED_PREFAB_BLUEPRINT_PREFIX)
  )
    fail("Only game-owned trusted prefab ships can be upgraded");
  const document = JSON.parse(instance.documentJson) as unknown;
  if (!isPrefabConstruction(document)) fail("Prefab construction required");
  const sourcePrefab = readShipPrefab(document.prefab.document);
  const sourceCatalog = prefabComponentCatalogFor(document.prefab.catalog);

  // Source and target pins.
  const source: PinnedPrefabShip | undefined = PREFAB_UPGRADE_SOURCES.find(
    (p) =>
      p.blueprintSha256 === instance.blueprintSha256 &&
      p.prefabId === sourcePrefab.id,
  );
  const target = REGISTERED_PREFAB_PINS.find(
    (p) => p.prefabId === args.targetPrefabId,
  );
  if (!source)
    refuse(
      `instance blueprint ${instance.blueprintSha256} is not a known upgradable pin`,
    );
  if (instance.blueprintSha256 !== args.expectedSourceBlueprintSha256)
    refuse("source blueprint differs from the expected pin");
  if (instance.revision !== args.expectedInstanceRevision)
    refuse(
      `instance revision is ${instance.revision}, not ${args.expectedInstanceRevision}`,
    );
  if (!target) fail(`${args.targetPrefabId} is not a registered prefab`);
  if (target.prefabId !== sourcePrefab.id)
    refuse("target is a different prefab");
  if (target.blueprintSha256 !== args.expectedTargetBlueprintSha256)
    refuse("target blueprint differs from the registered pin");
  if (target.blueprintSha256 === instance.blueprintSha256)
    refuse("ship already has the target revision");
  const template = trustedPrefabTemplate(target.prefabId);
  if (
    template.snapshot.sha256 !== target.blueprintSha256 ||
    template.catalogRevision !== target.catalogRevision
  )
    fail("Module prefab differs from its registered pin");
  const targetPrefab: ShipPrefabDocumentV1 = template.prefab;
  const targetCatalog: PrefabComponentCatalog = prefabComponentCatalogFor(
    target.catalogRevision,
  );

  // Deck, pose, crew.
  const decks = [...ctx.db.constructionDeck.by_instance.filter(S)];
  const deck = decks.find((d) => d.sourceDeckId === PREFAB_DECK_ID);
  if (!deck || decks.length !== 1) fail("Exactly one prefab deck required");
  if (
    Math.hypot(motion.vx, motion.vy) > REST_SPEED_MS ||
    Math.abs(motion.omega) > REST_OMEGA_RADS
  )
    refuse("ship is moving; bring it to rest first");
  const station = ctx.db.station.shipId.find(S);
  if (station?.occupantId) refuse("the pilot station is occupied");
  const actor = ctx.db.character.id.find(access.characterId);
  if (!actor) fail("Access character not found");
  if (actor.owner.toHexString() !== ship.owner.toHexString())
    refuse("ship owner and access character owner differ");
  if (access.lifecycle !== "active") refuse("game-ship access is not active");
  if (actor.shipId !== S) refuse("the owner's character is not aboard");
  const aboard = [...ctx.db.character.by_ship.filter(S)].map((c) => c.id);
  if (aboard.some((id) => id !== actor.id))
    refuse("other characters are aboard");
  const visitors = rowsWhere(
    ctx.db,
    "constructionLocation",
    (r) => r.instanceId === S && r.characterId !== actor.id,
  );
  if (visitors.length) refuse("other characters are visiting the ship");
  const objects = new Set(
    rowsWhere(ctx.db, "interactionObject", (r) => r.shipId === S).map(
      (r) => r.id as string,
    ),
  );
  if (
    rowsWhere(ctx.db, "couchSeat", (r) => objects.has(r.objectId as string))
      .length
  )
    refuse("a seat is occupied");
  const deckIds = new Set(decks.map((d) => d.id));
  for (const [table, column] of UPGRADE_REFUSED_SHIP_TABLES) {
    const n = rowsWhere(ctx.db, table, (r) =>
      column === "deck" ? deckIds.has(r.deckId as string) : r[column] === S,
    ).length;
    if (n) refuse(`${table} has ${n} row(s) for this ship`);
  }
  // A per-ship table added to the wipe list later (e.g. component damage) but not yet classified
  // here is never silently kept or dropped: rows for this ship refuse the upgrade.
  for (const table of WIPED_SHIP_TABLES) {
    if (UPGRADE_CLASSIFIED_TABLES.has(table)) continue;
    const n = rowsWhere(
      ctx.db,
      table,
      (r) => r.shipId === S || r.instanceId === S,
    ).length;
    if (n) refuse(`unclassified per-ship table ${table} has ${n} row(s)`);
  }

  // Target geometry (pure prefab walk frame; the apply step re-qualifies on the installed one).
  const pureFrame = prefabWalkFrame(targetPrefab, targetCatalog);
  const frame: DeckCollisionFrame = {
    ...pureFrame,
    shipId: S,
    deckId: deck.id,
  };
  const z = deck.elevation + PREFAB_STANDING_OFFSET_M;
  const standable = (p: Point) =>
    canOccupyDeck(frame, { shipId: S, deckId: deck.id, position: p }, 0.3);
  const spawn = prefabConstructionSpawnPreference({
    prefab: { document: targetPrefab, catalog: target.catalogRevision },
  })[0];
  if (!spawn || !standable(spawn)) fail("Target prefab spawn is not standable");
  const targetSockets = new Map(
    prefabCargoSockets(targetPrefab, 0, targetCatalog).map((s) => [s.key, s]),
  );
  const sourceSockets = new Map(
    prefabCargoSockets(sourcePrefab, 0, sourceCatalog).map((s) => [s.key, s]),
  );

  // Ship-held inventory.
  const prefix = `${S}:${deck.id}:`;
  const bindings = [...ctx.db.instanceInventoryBinding.by_instance.filter(S)];
  const boundRoots = new Map<string, (typeof bindings)[number]>();
  const sockets: {
    containerId: string;
    socketKey: string;
    placedObjectId: string;
    fromCentreM: Point;
    toCentreM: Point;
    fromAccessM: [number, number, number];
    toAccessM: [number, number, number] | null;
    nestedContainerIds: string[];
    itemIds: string[];
  }[] = [];
  for (const b of bindings) {
    boundRoots.set(b.containerId, b);
    const key = b.placedObjectId.startsWith(prefix)
      ? b.placedObjectId.slice(prefix.length)
      : "";
    const container = ctx.db.inventoryContainer.id.find(b.containerId);
    const scope = ctx.db.inventoryContainerScope.containerId.find(
      b.containerId,
    );
    if (!container || !scope || b.deckId !== deck.id || !key) {
      refuse(`storage binding ${b.placedObjectId} is incomplete`);
      continue;
    }
    const to = targetSockets.get(key);
    if (!to || !sourceSockets.has(key)) {
      refuse(`storage socket ${key} has no equivalent in the target revision`);
      continue;
    }
    const nested = rowsWhere(
      ctx.db,
      "inventoryContainerScope",
      (r) => r.rootContainerId === b.containerId,
    );
    const found = to.approachesM.find((p) => standable(p));
    if (!found) refuse(`storage socket ${key} has no standing approach`);
    const nestedIds = nested
      .map((r) => r.containerId as string)
      .filter((id) => id !== b.containerId)
      .sort();
    const itemIds = [
      ...ctx.db.inventoryItemMembership.by_root.filter(b.containerId),
    ]
      .map((m) => m.itemId)
      .sort();
    sockets.push({
      containerId: b.containerId,
      socketKey: key,
      placedObjectId: b.placedObjectId,
      fromCentreM: [container.localX, container.localY],
      toCentreM: to.centreM,
      fromAccessM: [scope.accessX, scope.accessY, scope.accessZ],
      toAccessM: found ? [found[0], found[1], z] : null,
      nestedContainerIds: nestedIds,
      itemIds,
    });
  }
  const nestedOfBound = new Set(sockets.flatMap((s) => s.nestedContainerIds));
  const groundDrops: {
    containerId: string;
    itemIds: string[];
    fromM: Point;
    toM: Point;
    moved: boolean;
  }[] = [];
  const shipContainers = [...ctx.db.inventoryContainer.iter()].filter(
    (c) => c.shipId === S,
  );
  for (const c of shipContainers) {
    if (boundRoots.has(c.id) || nestedOfBound.has(c.id)) continue;
    const scope = ctx.db.inventoryContainerScope.containerId.find(c.id);
    if (scope?.rootKind === "instance") {
      refuse(`container ${c.id} is bound to an unknown ship object`);
      continue;
    }
    const ground = [...ctx.db.storageBinding.iter()].find(
      (b) => b.containerId === c.id && b.placementId.startsWith("ground:"),
    );
    if (ground) {
      const from: Point = [c.localX, c.localY];
      const keep = standable(from);
      groundDrops.push({
        containerId: c.id,
        itemIds: [...ctx.db.inventoryItem.iter()]
          .filter((i) => i.containerId === c.id)
          .map((i) => i.id)
          .sort(),
        fromM: from,
        toM: keep ? from : [round(spawn[0]), round(spawn[1])],
        moved: !keep,
      });
      continue;
    }
    // Personal inventory (carried pockets, equipped bags) follows the character, not the deck.
    if (c.characterId === actor.id && (c.carried || c.parentItemId)) continue;
    if (scope?.rootKind === "character" && scope.rootCharacterId === actor.id)
      continue;
    refuse(`ship-held container ${c.id} has no known upgrade mapping`);
  }

  const rebuilt: Record<string, number> = {};
  for (const [table, column] of UPGRADE_REBUILT_SHIP_TABLES)
    rebuilt[table] = rowsWhere(ctx.db, table, (r) => r[column] === S).length;
  return {
    refusals,
    ship,
    instance,
    motion,
    actor,
    deck,
    sourcePrefab,
    targetPrefab,
    target,
    template,
    summary: {
      shipId: S,
      shipName: ship.name,
      owner: ship.owner.toHexString(),
      characterId: actor.id,
      characterName: actor.name,
      characterConnected: actor.connected,
      deckId: deck.id,
      pose: {
        systemId: motion.systemId,
        x: motion.x,
        y: motion.y,
        heading: motion.heading,
      },
      source: {
        prefabId: sourcePrefab.id,
        prefabRevision: sourcePrefab.revision,
        catalogRevision: document.prefab.catalog,
        blueprintSha256: instance.blueprintSha256,
        instanceRevision: instance.revision,
      },
      target: {
        prefabId: target.prefabId,
        prefabRevision: targetPrefab.revision,
        catalogRevision: target.catalogRevision,
        blueprintSha256: target.blueprintSha256,
        flightDefinitionSha256: target.flightDefinitionSha256,
        instanceRevision: instance.revision + 1n,
      },
      spawnM: spawn,
      sockets,
      groundDrops,
      rebuiltRows: rebuilt,
      refusals,
    },
  };
}

/** Plans and (unless dryRun) commits the upgrade. Throws, rolling back, on any failed check. */
export function upgradePrefabShip(ctx: Context, args: UpgradePrefabShipArgs) {
  requireShipOperator(ctx);
  const kind = args.dryRun ? "upgrade-prefab-dry-run" : "upgrade-prefab";
  const request = JSON.stringify({
    shipId: args.shipId,
    expectedSourceBlueprintSha256: args.expectedSourceBlueprintSha256,
    expectedInstanceRevision: args.expectedInstanceRevision.toString(),
    targetPrefabId: args.targetPrefabId,
    expectedTargetBlueprintSha256: args.expectedTargetBlueprintSha256,
  });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, kind, request))
    return;
  const plan = planPrefabUpgrade(ctx, args);
  const record = (summary: unknown) =>
    ctx.db.shipOperatorOperation.insert({
      operationId: args.operationId,
      principal: ctx.sender,
      kind,
      request,
      summaryJson: archiveJson(summary),
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  if (args.dryRun) {
    record({ mode: kind, ...plan.summary });
    return;
  }
  if (plan.refusals.length) fail(plan.refusals.join("; "));
  const S = args.shipId;
  const { actor, deck, ship, motion, instance } = plan;
  const op = args.operationId;
  const sequence = { next: 0 };
  const mapBefore = archiveJson(mapRowCounts(ctx.db));
  const inventoryBefore = shipInventory(ctx, S);

  // 1. Archive and delete the rebuilt ship rows (containers, items and bindings stay).
  for (const [table, column] of UPGRADE_REBUILT_SHIP_TABLES)
    for (const row of rowsWhere(ctx.db, table, (r) => r[column] === S)) {
      archiveRow(ctx.db, op, sequence, table, "deleted", row);
      (ctx.db[table] as unknown as { delete(row: Row): boolean }).delete(row);
    }
  for (const table of [
    "character",
    "constructionLocation",
    "worldAdmission",
    "input",
  ] as const) {
    const row =
      table === "character"
        ? ctx.db.character.id.find(actor.id)
        : (
            ctx.db[table] as unknown as {
              characterId: { find(id: string): Row | undefined };
            }
          ).characterId.find(actor.id);
    if (row) archiveRow(ctx.db, op, sequence, table, "updated", row);
  }

  // 2. Trusted reinstall with the same ship and deck ids at the next instance revision.
  const revision = instance.revision + 1n;
  const installed = installPrefabShip(
    ctx,
    actor,
    {
      prefabId: plan.target.prefabId,
      pose: {
        kind: "at",
        systemId: motion.systemId,
        x: motion.x,
        y: motion.y,
        heading: motion.heading,
      },
      name: ship.name,
    },
    {
      template: plan.template,
      reuseIds: [S, deck.id],
      instanceRevision: revision,
    },
  );
  if (installed.shipId !== S || installed.deckId !== deck.id)
    fail("Reinstall did not keep the ship and deck ids");
  const next = ctx.db.constructionInstance.id.find(S);
  const binding = ctx.db.constructionFlightBinding.shipId.find(S);
  if (
    !next ||
    next.revision !== revision ||
    next.blueprintSha256 !== plan.target.blueprintSha256 ||
    binding?.definitionId !== PREFAB_FLIGHT_DEFINITION ||
    binding.definitionSha256 !== plan.target.flightDefinitionSha256 ||
    binding.lifecycle !== "active"
  )
    fail("Reinstalled ship drifted from the target pin");
  const newShip = ctx.db.ship.id.find(S)!;
  if (newShip.revision <= ship.revision)
    ctx.db.ship.id.update({ ...newShip, revision: ship.revision + 1n });

  // 3. Rebind storage containers to the equivalent sockets on the installed collision frame.
  const installedFrame = constructionCollision(ctx, next, deck.id);
  for (const s of plan.summary.sockets) {
    const bound = ctx.db.instanceInventoryBinding.placedObjectId.find(
      s.placedObjectId,
    );
    if (
      !bound ||
      bound.containerId !== s.containerId ||
      bound.instanceId !== S ||
      bound.deckId !== deck.id
    )
      fail(`storage binding ${s.placedObjectId} changed`);
    const socket = prefabCargoSockets(
      plan.targetPrefab,
      0,
      prefabComponentCatalogFor(plan.target.catalogRevision),
    ).find((x) => x.key === s.socketKey)!;
    const z = deck.elevation + PREFAB_STANDING_OFFSET_M;
    const scopeAt = (p: Point) => ({
      kind: "instance" as const,
      instanceId: S,
      deckId: deck.id,
      placedObjectId: s.placedObjectId,
      instanceRevision: revision,
      accessPointM: [p[0], p[1], z] as [number, number, number],
    });
    const geometry = {
      instanceRevision: revision,
      frame: installedFrame,
      supportHeightAt: () => z,
    };
    const found = socket.approachesM.find((p) =>
      qualifyCargoAccessPoint(scopeAt(p), geometry),
    );
    if (!found) fail(`storage socket ${s.socketKey} has no qualified approach`);
    const container = ctx.db.inventoryContainer.id.find(s.containerId)!;
    archiveRow(
      ctx.db,
      op,
      sequence,
      "inventoryContainer",
      "updated",
      container,
    );
    ctx.db.inventoryContainer.id.update({
      ...container,
      localX: socket.centreM[0],
      localY: socket.centreM[1],
    });
    for (const id of [s.containerId, ...s.nestedContainerIds]) {
      const scope = ctx.db.inventoryContainerScope.containerId.find(id);
      if (!scope || scope.rootContainerId !== s.containerId)
        fail(`container scope ${id} changed`);
      archiveRow(
        ctx.db,
        op,
        sequence,
        "inventoryContainerScope",
        "updated",
        scope,
      );
      ctx.db.inventoryContainerScope.containerId.update({
        ...scope,
        instanceId: S,
        deckId: deck.id,
        placedObjectId: s.placedObjectId,
        instanceRevision: revision,
        accessX: found[0],
        accessY: found[1],
        accessZ: z,
        lifecycle: "active",
        revision: scope.revision + 1n,
      });
    }
  }
  for (const g of plan.summary.groundDrops) {
    if (!g.moved) continue;
    const container = ctx.db.inventoryContainer.id.find(g.containerId)!;
    archiveRow(
      ctx.db,
      op,
      sequence,
      "inventoryContainer",
      "updated",
      container,
    );
    ctx.db.inventoryContainer.id.update({
      ...container,
      localX: g.toM[0],
      localY: g.toM[1],
    });
  }
  markShipFlightDirty(ctx, S);

  // 4. Verify: same containers and items (ids, containers, grid positions), crew standing,
  // access active at the new revision, map state untouched.
  const after = shipInventory(ctx, S);
  if (archiveJson(after) !== archiveJson(inventoryBefore))
    fail("Ship inventory changed during the upgrade");
  const boarded = ctx.db.character.id.find(actor.id);
  const access = ctx.db.gameShipAccess.shipId.find(S);
  if (
    !boarded ||
    boarded.shipId !== S ||
    !canOccupyDeck(
      installedFrame,
      {
        shipId: S,
        deckId: deck.id,
        position: [boarded.localX, boarded.localY],
      },
      0.3,
    ) ||
    !access ||
    access.characterId !== actor.id ||
    access.lifecycle !== "active" ||
    access.instanceRevision !== revision ||
    access.templateSha256 !== plan.target.blueprintSha256
  )
    fail("Upgraded ship did not board the owner with active access");
  if (archiveJson(mapRowCounts(ctx.db)) !== mapBefore)
    fail("Upgrade would change map state; aborted");
  record({
    mode: kind,
    ...plan.summary,
    refusals: [],
    characterM: [boarded.localX, boarded.localY],
    archivedRows: sequence.next,
    inventory: after,
  });
}

/** Ship containers and their items: identities, nesting and grid positions (not local poses). */
function shipInventory(ctx: Context, shipId: string) {
  const containers = [...ctx.db.inventoryContainer.iter()]
    .filter((c) => c.shipId === shipId)
    .map((c) => ({
      id: c.id,
      characterId: c.characterId,
      parentItemId: c.parentItemId,
      name: c.name,
      width: c.width,
      height: c.height,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const ids = new Set(containers.map((c) => c.id));
  const items = [...ctx.db.inventoryItem.iter()]
    .filter((i) => ids.has(i.containerId))
    .map((i) => ({
      id: i.id,
      definitionId: i.definitionId,
      containerId: i.containerId,
      x: i.x,
      y: i.y,
      rotated: i.rotated,
      equipmentSlot: i.equipmentSlot,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  return { containers, items };
}

/** Registered target of an upgrade, for tooling. */
export function prefabUpgradeTargets() {
  return REGISTERED_PREFAB_PINS.filter((p) =>
    PREFAB_UPGRADE_SOURCES.some((s) => s.prefabId === p.prefabId),
  ).map((p) => ({
    ...p,
    prefabRevision: prefabById(p.prefabId)?.revision ?? 0,
    sources: PREFAB_UPGRADE_SOURCES.filter((s) => s.prefabId === p.prefabId),
  }));
}
