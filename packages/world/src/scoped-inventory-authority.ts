import { withCargoCarrierApproaches } from "./construction-cargo-access";
import { assertCargoStackMass } from "./construction-cargo-carriers";
import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
} from "./game-ship-access-authority";
import {
  SenderError,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import {
  planLegacyInventoryMetadata,
  type LegacyInventorySnapshot,
} from "./scoped-inventory-migration";
import {
  transferScopedCargo,
  inspectScopedCargo,
  type CargoInventoryReader,
  type CargoRepository,
} from "./scoped-inventory";
import type {
  ScopedContainer,
  ScopedItem,
  ScopedTransferRequest,
} from "@sidereal/sim/scoped-inventory";
import {
  INVENTORY_DEFINITIONS,
  CHARACTER_CARRY_LIMIT_KG,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "../../content/src/inventory";
import { constructionCollision } from "./construction-doors";
import { createConstructionStandingSupport } from "./construction-standing-support";
import { clearAim } from "./combat";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "sender" | "db">;
const standingSupport = createConstructionStandingSupport();
function fail(message: string): never {
  throw new SenderError(message);
}
export function legacyInventorySnapshot(ctx: ReadContext, characterId: string) {
  return {
    items: [...ctx.db.inventoryItem.by_character.filter(characterId)].filter(
      (i) => {
        const m = ctx.db.inventoryItemMembership.itemId.find(i.id);
        return (
          !m ||
          !m.rootContainerId ||
          ctx.db.inventoryContainerScope.containerId.find(m.rootContainerId)
            ?.rootKind !== "instance"
        );
      },
    ),
    containers: [
      ...ctx.db.inventoryContainer.by_character.filter(characterId),
    ].filter(
      (c) =>
        ctx.db.inventoryContainerScope.containerId.find(c.id)?.rootKind !==
        "instance",
    ),
  };
}
/** Called at every legacy mutation boundary, after its validated payload writes,
 * before return. Error propagation rolls back the complete enclosing reducer. */
export function synchronizeLegacyInventory(
  ctx: Context,
  characterId: string,
  before: LegacyInventorySnapshot,
) {
  const after = legacyInventorySnapshot(ctx, characterId),
    plan = planLegacyInventoryMetadata(characterId, before, after);
  const changedContainers = new Set(plan.changedContainerIds),
    changedItems = new Set(plan.changedItemIds);
  for (const id of plan.removedContainerIds)
    ctx.db.inventoryContainerScope.containerId.delete(id);
  for (const id of plan.removedItemIds)
    ctx.db.inventoryItemMembership.itemId.delete(id);
  for (const m of plan.containerMembership) {
    const old = ctx.db.inventoryContainerScope.containerId.find(m.containerId);
    if (old?.rootKind === "instance")
      fail("Legacy operation cannot mutate shared cargo");
    if (
      old &&
      !changedContainers.has(m.containerId) &&
      old.rootContainerId === m.rootContainerId &&
      old.rootKind === m.rootKind
    )
      continue;
    const row = {
      ...m,
      revision: old ? old.revision + 1n : 1n,
      instanceId: "",
      deckId: "",
      placedObjectId: "",
      instanceRevision: 0n,
      definitionRevision: "legacy-inventory-v1",
      accessX: 0,
      accessY: 0,
      accessZ: 0,
      lifecycle: "active",
    };
    if (old) ctx.db.inventoryContainerScope.containerId.update(row);
    else ctx.db.inventoryContainerScope.insert(row);
  }
  for (const m of plan.itemMembership) {
    const old = ctx.db.inventoryItemMembership.itemId.find(m.itemId);
    if (
      old &&
      !changedItems.has(m.itemId) &&
      old.rootContainerId === m.rootContainerId &&
      old.containerId === m.containerId
    )
      continue;
    const row = {
      itemId: m.itemId,
      containerId: m.containerId,
      rootContainerId: m.rootContainerId,
      rootCharacterId: characterId,
      revision: old ? old.revision + 1n : 1n,
    };
    if (old) ctx.db.inventoryItemMembership.itemId.update(row);
    else ctx.db.inventoryItemMembership.insert(row);
  }
}
function actorFor(ctx: ReadContext) {
  return [...ctx.db.character.by_owner.filter(ctx.sender)][0];
}
/** Storage reader for bounded mass calculations; no dynamic walking approach lookup. */
export function readCargoBase(
  ctx: ReadContext,
  nowMicros = 0n,
): CargoInventoryReader {
  const principal = ctx.sender.toHexString();
  const geometry = (instanceId: string, deckId: string) => {
    const a = actorFor(ctx),
      visit = a && ctx.db.constructionLocation.characterId.find(a.id),
      instance = ctx.db.constructionInstance.id.find(instanceId),
      deck = ctx.db.constructionDeck.id.find(deckId);
    if (!a || !visit || !instance || !deck) return;
    const frame = constructionCollision(ctx, instance, deckId);
    return {
      instanceRevision: instance.revision,
      frame,
      supportHeightAt: (x: number, y: number) =>
        standingSupport({
          actor: { ...a, localX: x, localY: y },
          location: visit,
          instance,
          deck,
        }),
    };
  };
  const container = (id: string): ScopedContainer | undefined => {
    const row = ctx.db.inventoryContainer.id.find(id),
      m = ctx.db.inventoryContainerScope.containerId.find(id);
    if (!row || !m || m.rootKind === "legacy-private") return;
    const scope = row.parentItemId
      ? undefined
      : m.rootKind === "character"
        ? { kind: "character" as const, characterId: m.rootCharacterId }
        : {
            kind: "instance" as const,
            instanceId: m.instanceId,
            deckId: m.deckId,
            placedObjectId: m.placedObjectId,
            instanceRevision: m.instanceRevision,
            accessPointM: [m.accessX, m.accessY, m.accessZ] as const,
          };
    return {
      ...row,
      revision: m.revision,
      lifecycle: m.lifecycle === "active" ? "active" : "removed",
      scope,
    };
  };
  return {
    principal,
    nowMicros,
    actor: () => {
      const a = actorFor(ctx);
      if (!a) return;
      const visit = ctx.db.constructionLocation.characterId.find(a.id),
        g = visit && geometry(visit.instanceId, visit.deckId);
      return {
        id: a.id,
        principal: a.owner.toHexString(),
        admitted: true,
        connected: a.connected,
        shipId: a.shipId,
        localX: a.localX,
        localY: a.localY,
        supportedHeightM: g?.supportHeightAt(a.localX, a.localY) ?? NaN,
        supportedStanding:
          !ctx.db.constructionTraversal.characterId.find(a.id) &&
          !ctx.db.constructionStairWalk.characterId.find(a.id) &&
          !ctx.db.couchSeat.characterId.find(a.id) &&
          ctx.db.station.shipId.find(a.shipId)?.occupantId !== a.id,
      };
    },
    visit: (id) =>
      ctx.db.constructionLocation.characterId.find(id) ?? undefined,
    instance: (id) => {
      const i = ctx.db.constructionInstance.id.find(id);
      return i
        ? {
            id: i.id,
            ownerPrincipal: i.owner.toHexString(),
            workspaceId: i.workspaceId,
            gameOwned: i.workspaceId === GAME_OWNED_TEMPLATE_NAMESPACE,
            revision: i.revision,
          }
        : undefined;
    },
    ownedGameVisit: (visit) =>
      ownedGameShipAccess(
        ctx,
        visit.instanceId,
        visit.deckId,
        nowMicros || undefined,
      ).useObjects,
    grants: () =>
      [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)]
        .filter((g) => g.capability === "instance.spawn")
        .map((g) => ({
          principal,
          resourceId: g.workspaceId,
          capability: "instance.spawn" as const,
          expiresMicros: g.expiresMicros,
          revoked: g.revoked,
        })),
    // Crew boarding is not implemented. Owner-review entry remains the only real admission path.
    acceptedCrewVisit: () => undefined,
    geometry,
    characterInventory: (id) => {
      const state = ctx.db.inventoryState.characterId.find(id),
        pockets = [...ctx.db.inventoryContainer.by_character.filter(id)].find(
          (c) => c.carried && !c.parentItemId && c.kind === "grid",
        );
      return state && pockets
        ? {
            characterId: id,
            revision: state.revision,
            pocketsId: pockets.id,
            carryLimitKg: CHARACTER_CARRY_LIMIT_KG,
          }
        : undefined;
    },
    rootForContainer: (id) => {
      const m = ctx.db.inventoryContainerScope.containerId.find(id);
      return m?.lifecycle === "active" && m.rootKind !== "legacy-private"
        ? m.rootContainerId
        : undefined;
    },
    containersForRoot: function* (root) {
      for (const m of ctx.db.inventoryContainerScope.by_root.filter(root)) {
        const c = container(m.containerId);
        if (!c) fail("Incomplete cargo container membership");
        yield c;
      }
    },
    itemsForRoot: function* (root) {
      for (const m of ctx.db.inventoryItemMembership.by_root.filter(root)) {
        const item = ctx.db.inventoryItem.id.find(m.itemId);
        if (!item || item.containerId !== m.containerId)
          fail("Incomplete cargo item membership");
        yield {
          ...item,
          revision: m.revision,
          equippedByCharacterId: item.equipmentSlot
            ? m.rootCharacterId
            : undefined,
        };
      }
    },
    receipt: (actorId, operationId) =>
      ctx.db.scopedInventoryReceipt.id.find(
        JSON.stringify([actorId, operationId]),
      ) ?? undefined,
    definitions: INVENTORY_DEFINITIONS,
    liquidDensity: LIQUID_DENSITY_KG_PER_LITRE,
  };
}
export function readCargo(
  ctx: ReadContext,
  nowMicros = 0n,
): CargoInventoryReader {
  return withCargoCarrierApproaches(ctx, readCargoBase(ctx, nowMicros));
}
export function moveScopedCargo(ctx: Context, request: ScopedTransferRequest) {
  const reader = readCargo(ctx, ctx.timestamp.microsSinceUnixEpoch);
  const repo: CargoRepository = {
    ...reader,
    writeItem: (item: ScopedItem) => {
      const old = ctx.db.inventoryItem.id.find(item.id),
        m = ctx.db.inventoryItemMembership.itemId.find(item.id);
      if (!old || !m) fail("Inventory item changed");
      ctx.db.inventoryItem.id.update({
        ...old,
        containerId: item.containerId,
        equipmentSlot: item.equipmentSlot,
        x: item.x,
        y: item.y,
        rotated: item.rotated,
      });
      ctx.db.inventoryItemMembership.itemId.update({
        ...m,
        revision: item.revision,
        containerId: item.containerId,
      });
    },
    writeContainer: (c) => {
      const old = ctx.db.inventoryContainerScope.containerId.find(c.id);
      if (!old) fail("Inventory container changed");
      ctx.db.inventoryContainerScope.containerId.update({
        ...old,
        revision: c.revision,
      });
    },
    writeCharacter: (c) => {
      const old = ctx.db.inventoryState.characterId.find(c.characterId);
      if (!old) fail("Inventory changed");
      ctx.db.inventoryState.characterId.update({
        ...old,
        revision: c.revision,
      });
    },
    writeRootMembership: (itemIds, containerIds, rootContainerId, scope) => {
      const root =
        ctx.db.inventoryContainerScope.containerId.find(rootContainerId);
      if (!root) fail("Destination root changed");
      // Empty legacy character index only suppresses old lookups. Explicit sidecar scope is authority.
      const characterId = scope.kind === "character" ? scope.characterId : "";
      for (const id of itemIds) {
        const item = ctx.db.inventoryItem.id.find(id)!,
          m = ctx.db.inventoryItemMembership.itemId.find(id)!;
        ctx.db.inventoryItem.id.update({ ...item, characterId });
        ctx.db.inventoryItemMembership.itemId.update({
          ...m,
          rootContainerId,
          rootCharacterId: characterId,
        });
      }
      for (const id of containerIds) {
        const c = ctx.db.inventoryContainer.id.find(id)!,
          m = ctx.db.inventoryContainerScope.containerId.find(id)!;
        ctx.db.inventoryContainer.id.update({ ...c, characterId });
        ctx.db.inventoryContainerScope.containerId.update({
          ...root,
          containerId: id,
          revision: m.revision,
          rootContainerId,
        });
      }
    },
    clearHotbar: (actorId, ids) => {
      for (const h of ctx.db.inventoryHotbar.by_character.filter(actorId))
        if (ids.includes(h.itemId))
          ctx.db.inventoryHotbar.id.update({ ...h, itemId: "" });
    },
    clearAim: (actorId) => clearAim(ctx, actorId),
    insertReceipt: (r) =>
      ctx.db.scopedInventoryReceipt.insert({
        ...r,
        id: JSON.stringify([r.actorId, r.operationId]),
      }),
  };
  const affectedRoots = [
    reader.rootForContainer(request.sourceContainerId),
    reader.rootForContainer(request.destinationContainerId),
  ].filter((id): id is string => !!id);
  const result = transferScopedCargo(repo, request);
  if (!result.ok) fail(result.error.code + ": " + result.error.message);
  // Throws propagate through the enclosing transaction, including its receipt.
  if (!result.replay) assertCargoStackMass(ctx, affectedRoots);
}
/** Bounded server-derived reachable roots, not client query authorization. */
function reachableCargo(ctx: ReadContext) {
  const actor = actorFor(ctx),
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  if (!visit) return { containers: [], items: [] };
  const roots = [
    ...ctx.db.inventoryContainerScope.by_instance_deck.filter([
      visit.instanceId,
      visit.deckId,
    ]),
  ].filter((m) => m.rootContainerId === m.containerId);
  if (roots.length > 16) return { containers: [], items: [] };
  const reader = readCargo(ctx),
    results = roots.map((r) => inspectScopedCargo(reader, r.containerId));
  return {
    containers: results.flatMap((r) => r.containers),
    items: results.flatMap((r) => r.items),
  };
}
export function reachableCargoContainers(ctx: ReadContext) {
  return reachableCargo(ctx).containers;
}
export function reachableCargoItems(ctx: ReadContext) {
  return reachableCargo(ctx).items;
}

/** CAS metadata for current carried inventory only; old private lab roots stay
 * under old revisions/access. Item IDs are existing UUIDs, not new inventory. */
export function carriedInventoryRevisions(ctx: ReadContext) {
  const actor = actorFor(ctx);
  if (!actor?.connected) return [];
  const containers = [
    ...ctx.db.inventoryContainerScope.by_character.filter(actor.id),
  ].filter((c) => c.rootKind === "character" && c.lifecycle === "active");
  if (containers.length > 152) return [];
  const rootIds = new Set(containers.map((c) => c.rootContainerId));
  const items = [
    ...ctx.db.inventoryItemMembership.by_character.filter(actor.id),
  ].filter((i) => rootIds.has(i.rootContainerId));
  if (items.length > 128) return [];
  return [
    ...containers.map((c) => ({
      id: c.containerId,
      kind: "container",
      revision: c.revision,
    })),
    ...items.map((i) => ({ id: i.itemId, kind: "item", revision: i.revision })),
  ];
}
