/**
 * Operator-only ship cargo stocking (deployment identity, like the ship-wipe reducers).
 *
 * Binds an authoritative, ship-owned cargo container to a storage socket of a trusted prefab
 * ship (e.g. Wren's hold crate) when none exists yet, then inserts NEW item instances (fresh
 * UUIDs) into it. It never moves, rewrites or deletes existing items, containers or characters,
 * so it is purely additive; replaying the same operation ID is a no-op. Access afterwards is the
 * normal scoped-cargo authority: the owner stands at the qualified approach point and transfers
 * items into carried inventory, then equips them with `equip_inventory_item`.
 */
import { SenderError, type InferSchema, type ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import {
  INVENTORY_DEFINITIONS,
  inventoryDefinition,
} from "@sidereal/content/inventory";
import { WAYFARER_PHYSICAL_CATALOG } from "@sidereal/content/physical-definitions";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import {
  PREFAB_DECK_ID,
  isPrefabConstruction,
} from "@sidereal/sim/prefab-construction";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { packArmorIssue } from "@sidereal/sim/armor-issue";
import { SCOPED_INVENTORY_LIMITS } from "@sidereal/sim/scoped-inventory";
import { archiveJson, priorOperation, requireShipOperator } from "./ship-operator";
import { GAME_OWNED_TEMPLATE_NAMESPACE } from "./game-ship-access-authority";
import { constructionCollision } from "./construction-doors";
import { qualifyCargoAccessPoint } from "./scoped-inventory";
import { markShipFlightDirty } from "./construction-flight-dirty";

type Context = ReducerCtx<InferSchema<typeof world>>;

/** Grid of an operator-bound socket container (same bounds as the lab supply crates). */
export const STOCKED_CARGO_GRID = { width: 14, height: 14, maxMassKg: 500 };
export const STOCKED_CARGO_DEFINITION_REVISION = "prefab-socket-cargo-v1";
const MAX_STOCK_ITEMS = 64;
/** Prefab walking datum: native floor top above the deck elevation (see prefab-ship-authority). */
const PREFAB_STANDING_OFFSET_M = 6 / 32;

export interface StockShipCargoArgs {
  operationId: string;
  dryRun: boolean;
  characterId: string;
  shipId: string;
  socketKey: string;
  containerName: string;
  definitionIdsJson: string;
}

function fail(message: string): never {
  throw new SenderError(message);
}

function parseDefinitionIds(json: string) {
  let ids: unknown;
  try {
    ids = JSON.parse(json);
  } catch {
    fail("definitionIdsJson must be a JSON array of item definition ids");
  }
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > MAX_STOCK_ITEMS ||
    !ids.every((id) => typeof id === "string")
  )
    fail(`definitionIdsJson must list 1-${MAX_STOCK_ITEMS} definition ids`);
  for (const id of ids as string[]) {
    if (!INVENTORY_DEFINITIONS.some((d) => d.id === id))
      fail("Unknown item definition: " + id);
    // Ship flight mass needs an explicit physical definition for every item on board.
    if (
      !WAYFARER_PHYSICAL_CATALOG.definitions.some(
        (d) => d.id === "inventory:" + id && d.kind === "inventory",
      )
    )
      fail("Item has no physical definition: " + id);
  }
  return ids as string[];
}

/** Plans and (unless dryRun) commits the stock. Throws, rolling back, on any failed check. */
export function stockShipCargo(ctx: Context, args: StockShipCargoArgs) {
  requireShipOperator(ctx);
  const kind = args.dryRun ? "stock-ship-cargo-dry-run" : "stock-ship-cargo";
  const request = JSON.stringify({
    characterId: args.characterId,
    shipId: args.shipId,
    socketKey: args.socketKey,
    containerName: args.containerName,
    definitionIdsJson: args.definitionIdsJson,
  });
  if (priorOperation(ctx.db, ctx.sender, args.operationId, kind, request))
    return;
  const name = args.containerName.trim();
  if (!name || name.length > 40)
    fail("Container name must be 1-40 characters");
  const definitionIds = parseDefinitionIds(args.definitionIdsJson);

  // The ship must be the character's active game-owned prefab ship.
  const actor = ctx.db.character.id.find(args.characterId);
  if (!actor) fail("Character not found");
  const access = ctx.db.gameShipAccess.shipId.find(args.shipId);
  if (
    !access ||
    access.characterId !== actor.id ||
    access.lifecycle !== "active" ||
    access.owner.toHexString() !== actor.owner.toHexString()
  )
    fail("Ship is not the character's active game ship");
  const instance = ctx.db.constructionInstance.id.find(args.shipId);
  if (!instance || instance.workspaceId !== GAME_OWNED_TEMPLATE_NAMESPACE)
    fail("Game-owned construction instance required");
  const document = JSON.parse(instance.documentJson) as unknown;
  if (!isPrefabConstruction(document))
    fail("Storage sockets are only defined for trusted prefab ships");
  const prefab = readShipPrefab(document.prefab.document);
  const catalog = prefabComponentCatalogFor(document.prefab.catalog);
  const deck = [...ctx.db.constructionDeck.by_instance.filter(instance.id)].find(
    (d) => d.sourceDeckId === PREFAB_DECK_ID,
  );
  if (!deck) fail("Prefab deck not found");
  const socket = prefabCargoSockets(prefab, 0, catalog).find(
    (s) => s.key === args.socketKey,
  );
  if (!socket) fail("Unknown storage socket: " + args.socketKey);
  const placedObjectId = `${instance.id}:${deck.id}:${socket.key}`;

  // Reuse the bound container, or qualify a new one's approach against current collision.
  const binding =
    ctx.db.instanceInventoryBinding.placedObjectId.find(placedObjectId);
  let root = binding && ctx.db.inventoryContainer.id.find(binding.containerId);
  const rootScope =
    binding && ctx.db.inventoryContainerScope.containerId.find(binding.containerId);
  if (
    binding &&
    (!root ||
      !rootScope ||
      rootScope.rootKind !== "instance" ||
      rootScope.lifecycle !== "active" ||
      rootScope.instanceId !== instance.id)
  )
    fail("Bound storage container is incomplete");
  let accessPoint: [number, number, number];
  if (rootScope) accessPoint = [rootScope.accessX, rootScope.accessY, rootScope.accessZ];
  else {
    const z = deck.elevation + PREFAB_STANDING_OFFSET_M;
    const geometry = {
      instanceRevision: instance.revision,
      frame: constructionCollision(ctx, instance, deck.id),
      supportHeightAt: () => z,
    };
    const found = socket.approachesM.find(([x, y]) =>
      qualifyCargoAccessPoint(
        {
          kind: "instance",
          instanceId: instance.id,
          deckId: deck.id,
          placedObjectId,
          instanceRevision: instance.revision,
          accessPointM: [x, y, z],
        },
        geometry,
      ),
    );
    if (!found) fail("Storage socket has no qualified standing approach");
    accessPoint = [found[0], found[1], z];
  }
  const width = root?.width ?? STOCKED_CARGO_GRID.width,
    height = root?.height ?? STOCKED_CARGO_GRID.height,
    maxMassKg = root?.maxMassKg ?? STOCKED_CARGO_GRID.maxMassKg;

  // Existing contents: footprints of top-level items, totals for budgets and mass.
  const members = root
    ? [...ctx.db.inventoryItemMembership.by_root.filter(root.id)]
    : [];
  const existing = members
    .map((m) => ctx.db.inventoryItem.id.find(m.itemId))
    .filter((i): i is NonNullable<typeof i> => !!i);
  const nestedContainers = root
    ? [...ctx.db.inventoryContainerScope.by_root.filter(root.id)].length
    : 1;
  const newDefinitions = definitionIds.map((id) => inventoryDefinition(id));
  const newStorage = newDefinitions.filter((d) => d.storage).length;
  if (existing.length + definitionIds.length > SCOPED_INVENTORY_LIMITS.items)
    fail("Container item budget exceeded");
  if (nestedContainers + newStorage > SCOPED_INVENTORY_LIMITS.containers)
    fail("Container budget exceeded");
  const massKg =
    existing.reduce((sum, i) => sum + inventoryDefinition(i.definitionId).massKg, 0) +
    newDefinitions.reduce((sum, d) => sum + d.massKg, 0);
  if (massKg > maxMassKg + 1e-8) fail("Container mass limit exceeded");
  const occupied = existing
    .filter((i) => root && i.containerId === root.id)
    .map((i) => {
      const d = inventoryDefinition(i.definitionId);
      return {
        locker: 0,
        x: i.x,
        y: i.y,
        width: i.rotated ? d.height : d.width,
        height: i.rotated ? d.width : d.height,
      };
    });
  // Largest first for a dense deterministic packing; ties keep the request order.
  const ordered = newDefinitions
    .map((d, index) => ({ ...d, index }))
    .sort((a, b) => b.width * b.height - a.width * a.height || a.index - b.index);
  let placements: ReturnType<typeof packArmorIssue>["placements"];
  try {
    placements = packArmorIssue(ordered, width, height, 1, occupied).placements;
  } catch {
    fail("No room for these items in the storage container");
  }
  const planned = ordered.map((d, i) => ({
    definitionId: d.id,
    x: placements[i].x,
    y: placements[i].y,
  }));
  const summary = {
    characterId: actor.id,
    characterName: actor.name,
    shipId: instance.id,
    socketKey: socket.key,
    placedObjectId,
    containerId: root?.id ?? "",
    createdContainer: !root,
    accessPointM: accessPoint,
    massKg,
    items: planned as { definitionId: string; x: number; y: number; id?: string }[],
  };
  if (args.dryRun) {
    ctx.db.shipOperatorOperation.insert({
      operationId: args.operationId,
      principal: ctx.sender,
      kind,
      request,
      summaryJson: archiveJson(summary),
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
    return;
  }

  // Commit: container binding (if new), then items, nested storage and revisions.
  const scopeBase = {
    rootKind: "instance",
    rootCharacterId: "",
    instanceId: instance.id,
    deckId: deck.id,
    placedObjectId,
    instanceRevision: instance.revision,
    definitionRevision: STOCKED_CARGO_DEFINITION_REVISION,
    accessX: accessPoint[0],
    accessY: accessPoint[1],
    accessZ: accessPoint[2],
    lifecycle: "active",
  };
  if (!root) {
    const id = ctx.newUuidV4().toString();
    if (ctx.db.inventoryContainer.id.find(id)) fail("Container identity exists");
    root = {
      id,
      characterId: "",
      parentItemId: "",
      kind: "grid",
      name,
      width,
      height,
      maxMassKg,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      shipId: instance.id,
      localX: socket.centreM[0],
      localY: socket.centreM[1],
      carried: false,
    };
    ctx.db.inventoryContainer.insert(root);
    ctx.db.inventoryContainerScope.insert({
      ...scopeBase,
      containerId: id,
      rootContainerId: id,
      revision: 1n,
    });
    ctx.db.instanceInventoryBinding.insert({
      placedObjectId,
      containerId: id,
      instanceId: instance.id,
      deckId: deck.id,
      definitionRevision: STOCKED_CARGO_DEFINITION_REVISION,
    });
  } else
    ctx.db.inventoryContainerScope.containerId.update({
      ...rootScope!,
      revision: rootScope!.revision + 1n,
    });
  const container = root;
  for (const item of summary.items) {
    const id = ctx.newUuidV4().toString();
    if (ctx.db.inventoryItem.id.find(id) || ctx.db.inventoryContainer.id.find(id))
      fail("Item identity exists");
    item.id = id;
    ctx.db.inventoryItem.insert({
      id,
      characterId: "",
      definitionId: item.definitionId,
      containerId: container.id,
      equipmentSlot: "",
      x: item.x,
      y: item.y,
      rotated: false,
    });
    ctx.db.inventoryItemMembership.insert({
      itemId: id,
      revision: 1n,
      containerId: container.id,
      rootContainerId: container.id,
      rootCharacterId: "",
    });
    const storage = inventoryDefinition(item.definitionId).storage;
    if (storage) {
      const child = ctx.newUuidV4().toString();
      ctx.db.inventoryContainer.insert({
        ...container,
        id: child,
        parentItemId: id,
        name: inventoryDefinition(item.definitionId).name + " storage",
        width: storage.width,
        height: storage.height,
        maxMassKg: storage.maxMassKg,
      });
      ctx.db.inventoryContainerScope.insert({
        ...scopeBase,
        containerId: child,
        rootContainerId: container.id,
        revision: 1n,
      });
    }
  }
  markShipFlightDirty(ctx, instance.id);
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind,
    request,
    summaryJson: archiveJson({ ...summary, containerId: container.id }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
