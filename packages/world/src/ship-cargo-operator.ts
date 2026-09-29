/**
 * Operator-only ship cargo stocking (deployment identity, like the ship-wipe reducers).
 *
 * Binds an authoritative, ship-owned cargo container to a storage socket of a trusted prefab
 * ship (e.g. Wren's hold crate) when none exists yet, then inserts NEW item instances (fresh
 * UUIDs) into it. It never moves, rewrites or deletes existing items, containers or characters,
 * so it is purely additive; replaying the same operation ID is a no-op. Access afterwards is the
 * normal scoped-cargo authority: the owner stands at the qualified approach point and transfers
 * items into carried inventory, then equips them with `equip_inventory_item`.
 *
 * `issueSocketStock` runs the same plan and commit inside the prefab spawner's issuing
 * transaction (a pin's `issueStock`, e.g. the EVA suit in a new Wren r8's suit locker).
 */
import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import type world from "./index";
import {
  itemDefinitions,
  commitPin,
  type PinnedItemDefinitions,
} from "./item-definitions";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import {
  PREFAB_DECK_ID,
  isPrefabConstruction,
} from "@sidereal/sim/prefab-construction";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import {
  prefabCargoSockets,
  type PrefabCargoSocket,
} from "@sidereal/sim/prefab-cargo-sockets";
import { packArmorIssue } from "@sidereal/sim/armor-issue";
import { SCOPED_INVENTORY_LIMITS } from "@sidereal/sim/scoped-inventory";
import {
  archiveJson,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";
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

function parseDefinitionIds(json: string, defs: PinnedItemDefinitions) {
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
  // Existence and instantiability come from the registry (current revision) or the seed.
  for (const id of ids as string[])
    try {
      defs.preview(id);
    } catch (e) {
      fail(
        "Unknown or retired item definition: " +
          id +
          (e instanceof Error ? ` (${e.message})` : ""),
      );
    }
  return ids as string[];
}

type ConstructionInstanceRow = NonNullable<
  ReturnType<Context["db"]["constructionInstance"]["id"]["find"]>
>;
type ConstructionDeckRow = NonNullable<
  ReturnType<Context["db"]["constructionDeck"]["id"]["find"]>
>;

/** The prefab deck and storage socket `socketKey` of a game-owned prefab ship instance. */
function prefabStorageSocket(
  ctx: Context,
  instance: ConstructionInstanceRow,
  socketKey: string,
) {
  const document = JSON.parse(instance.documentJson) as unknown;
  if (!isPrefabConstruction(document))
    fail("Storage sockets are only defined for trusted prefab ships");
  const prefab = readShipPrefab(document.prefab.document);
  const catalog = prefabComponentCatalogFor(document.prefab.catalog);
  const deck = [
    ...ctx.db.constructionDeck.by_instance.filter(instance.id),
  ].find((d) => d.sourceDeckId === PREFAB_DECK_ID);
  if (!deck) fail("Prefab deck not found");
  const socket = prefabCargoSockets(prefab, 0, catalog).find(
    (s) => s.key === socketKey,
  );
  if (!socket) fail("Unknown storage socket: " + socketKey);
  return { deck, socket };
}

/**
 * Plans NEW items into the container bound to a storage socket (a new container, with a standing
 * approach qualified against current collision, when none is bound yet). Pure reads; throws,
 * rolling back, on any failed check.
 */
function planSocketStock(
  ctx: Context,
  instance: ConstructionInstanceRow,
  deck: ConstructionDeckRow,
  socket: PrefabCargoSocket,
  definitionIds: readonly string[],
  defs: PinnedItemDefinitions,
) {
  const placedObjectId = `${instance.id}:${deck.id}:${socket.key}`;

  // Reuse the bound container, or qualify a new one's approach against current collision.
  const binding =
    ctx.db.instanceInventoryBinding.placedObjectId.find(placedObjectId);
  const root =
    binding && ctx.db.inventoryContainer.id.find(binding.containerId);
  const rootScope =
    binding &&
    ctx.db.inventoryContainerScope.containerId.find(binding.containerId);
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
  if (rootScope)
    accessPoint = [rootScope.accessX, rootScope.accessY, rootScope.accessZ];
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
  const newDefinitions = definitionIds.map((id) => defs.preview(id));
  const newStorage = newDefinitions.filter((d) => d.storage).length;
  if (existing.length + definitionIds.length > SCOPED_INVENTORY_LIMITS.items)
    fail("Container item budget exceeded");
  if (nestedContainers + newStorage > SCOPED_INVENTORY_LIMITS.containers)
    fail("Container budget exceeded");
  const massKg =
    existing.reduce((sum, i) => sum + defs.item(i).massKg, 0) +
    newDefinitions.reduce((sum, d) => sum + d.massKg, 0);
  if (massKg > maxMassKg + 1e-8) fail("Container mass limit exceeded");
  const occupied = existing
    .filter((i) => root && i.containerId === root.id)
    .map((i) => {
      const d = defs.item(i);
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
    .sort(
      (a, b) => b.width * b.height - a.width * a.height || a.index - b.index,
    );
  let placements: ReturnType<typeof packArmorIssue>["placements"];
  try {
    placements = packArmorIssue(ordered, width, height, 1, occupied).placements;
  } catch {
    fail("No room for these items in the storage container");
  }
  const items: { definitionId: string; x: number; y: number; id?: string }[] =
    ordered.map((d, i) => ({
      definitionId: d.id,
      x: placements[i].x,
      y: placements[i].y,
    }));
  return {
    placedObjectId,
    root,
    rootScope,
    accessPoint,
    width,
    height,
    maxMassKg,
    massKg,
    items,
  };
}

/** Commits a `planSocketStock` plan: container binding (if new), items, nested storage. */
function commitSocketStock(
  ctx: Context,
  instance: ConstructionInstanceRow,
  deck: ConstructionDeckRow,
  socket: PrefabCargoSocket,
  plan: ReturnType<typeof planSocketStock>,
  name: string,
  defs: PinnedItemDefinitions,
) {
  const { placedObjectId, accessPoint, rootScope } = plan;
  let root = plan.root;
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
    if (ctx.db.inventoryContainer.id.find(id))
      fail("Container identity exists");
    root = {
      id,
      characterId: "",
      parentItemId: "",
      kind: "grid",
      name,
      width: plan.width,
      height: plan.height,
      maxMassKg: plan.maxMassKg,
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
  for (const item of plan.items) {
    const id = ctx.newUuidV4().toString();
    if (
      ctx.db.inventoryItem.id.find(id) ||
      ctx.db.inventoryContainer.id.find(id)
    )
      fail("Item identity exists");
    item.id = id;
    const definition = defs.stage(id, item.definitionId);
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
    commitPin(ctx, defs, id);
    ctx.db.inventoryItemMembership.insert({
      itemId: id,
      revision: 1n,
      containerId: container.id,
      rootContainerId: container.id,
      rootCharacterId: "",
    });
    const storage = definition.storage;
    if (storage) {
      const child = ctx.newUuidV4().toString();
      ctx.db.inventoryContainer.insert({
        ...container,
        id: child,
        parentItemId: id,
        name: definition.name + " storage",
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
  return container.id;
}

/**
 * Issue-time stock, inside the prefab spawner's issuing transaction (a pin's `issueStock`): binds
 * a storage socket of the freshly installed ship and fills it with NEW items. Same checks and
 * packing as the operator stock, no operator ledger row. Returns the container id.
 */
export function issueSocketStock(
  ctx: Context,
  shipId: string,
  socketKey: string,
  containerName: string,
  definitionIdsJson: string,
) {
  const name = containerName.trim();
  if (!name || name.length > 40) fail("Container name must be 1-40 characters");
  const defs = itemDefinitions(ctx);
  const definitionIds = parseDefinitionIds(definitionIdsJson, defs);
  const instance = ctx.db.constructionInstance.id.find(shipId);
  if (!instance || instance.workspaceId !== GAME_OWNED_TEMPLATE_NAMESPACE)
    fail("Game-owned construction instance required");
  const { deck, socket } = prefabStorageSocket(ctx, instance, socketKey);
  const plan = planSocketStock(
    ctx,
    instance,
    deck,
    socket,
    definitionIds,
    defs,
  );
  return commitSocketStock(ctx, instance, deck, socket, plan, name, defs);
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
  if (!name || name.length > 40) fail("Container name must be 1-40 characters");
  const defs = itemDefinitions(ctx);
  const definitionIds = parseDefinitionIds(args.definitionIdsJson, defs);

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
  const { deck, socket } = prefabStorageSocket(ctx, instance, args.socketKey);
  const plan = planSocketStock(
    ctx,
    instance,
    deck,
    socket,
    definitionIds,
    defs,
  );
  const summary = {
    characterId: actor.id,
    characterName: actor.name,
    shipId: instance.id,
    socketKey: socket.key,
    placedObjectId: plan.placedObjectId,
    containerId: plan.root?.id ?? "",
    createdContainer: !plan.root,
    accessPointM: plan.accessPoint,
    massKg: plan.massKg,
    items: plan.items,
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
  const containerId = commitSocketStock(
    ctx,
    instance,
    deck,
    socket,
    plan,
    name,
    defs,
  );
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind,
    request,
    summaryJson: archiveJson({ ...summary, containerId }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
