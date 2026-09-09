import type { Infer } from "spacetimedb/server";
import { wayfarerLiquidReceipt } from "./wayfarer-refit-tables";
import type { RefitContext } from "./wayfarer-refit-authority";
import { requireGame } from "./auth";
import {
  readCargo,
  legacyInventorySnapshot,
} from "./scoped-inventory-authority";
import { inspectScopedCargo } from "./scoped-inventory";
import { validateInventory } from "@sidereal/sim/inventory";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
  CHARACTER_CARRY_LIMIT_KG,
} from "@sidereal/content/inventory";
type Receipt = Infer<typeof wayfarerLiquidReceipt.rowType>;
export type LiquidContext = Omit<RefitContext, "db"> & {
  db: RefitContext["db"] & {
    wayfarerLiquidReceipt: {
      id: { find(id: string): Receipt | undefined | null };
      insert(row: Receipt): unknown;
    };
  };
};
export interface LiquidRequest {
  sourceId: string;
  destinationId: string;
  litres: number;
  expectedSourceRevision: bigint;
  expectedDestinationRevision: bigint;
  expectedInventoryRevision: bigint;
  operationId: string;
}
/** Manual canister↔mounted fuel transfer, never wiring/piping or solid-item use. */
export function transferWayfarerLiquid(
  ctx: LiquidContext,
  args: LiquidRequest,
) {
  requireGame(ctx);
  if (
    !/^[0-9a-f-]{36}$/i.test(args.operationId) ||
    !Number.isFinite(args.litres) ||
    args.litres <= 0 ||
    args.litres > 100 ||
    args.sourceId === args.destinationId
  )
    throw Error("Bounded distinct liquid transfer required");
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0],
    visit = actor && ctx.db.constructionLocation.characterId.find(actor.id);
  if (!actor?.connected || !visit)
    throw Error("Current supported owned visit required");
  const attachments = [
    ...ctx.db.wayfarerRefitAttachment.by_instance.filter(visit.instanceId),
  ].filter((a) => a.deckId === visit.deckId);
  const tank = attachments.find(
    (a) =>
      a.containerId === args.sourceId || a.containerId === args.destinationId,
  );
  if (!tank) throw Error("A preserved mounted fuel root is required");
  const reader = readCargo(ctx, ctx.timestamp.microsSinceUnixEpoch);
  if (
    !inspectScopedCargo(reader, tank.containerId).containers.some(
      (c) => c.id === tank.containerId,
    )
  )
    throw Error("Move within clear supported reach of the fuel tank");
  const otherId =
    tank.containerId === args.sourceId ? args.destinationId : args.sourceId;
  const other = ctx.db.inventoryContainer.id.find(otherId),
    otherScope = ctx.db.inventoryContainerScope.containerId.find(otherId);
  if (
    !other?.parentItemId ||
    other.characterId !== actor.id ||
    otherScope?.rootKind !== "character" ||
    otherScope.rootCharacterId !== actor.id
  )
    throw Error("The other reservoir must be a currently carried canister");
  const source = ctx.db.inventoryContainer.id.find(args.sourceId),
    destination = ctx.db.inventoryContainer.id.find(args.destinationId),
    sm = ctx.db.inventoryContainerScope.containerId.find(args.sourceId),
    dm = ctx.db.inventoryContainerScope.containerId.find(args.destinationId),
    state = ctx.db.inventoryState.characterId.find(actor.id);
  if (
    !source ||
    !destination ||
    !sm ||
    !dm ||
    !state ||
    source.kind !== "liquid" ||
    destination.kind !== "liquid" ||
    source.liquidType !== "fuel" ||
    (destination.amountLitres > 0 && destination.liquidType !== "fuel")
  )
    throw Error("Compatible fuel reservoirs required");
  const id = JSON.stringify([actor.id, args.operationId]),
    request = JSON.stringify(args, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
    old = ctx.db.wayfarerLiquidReceipt.id.find(id);
  // Reach and admission remain mandatory for replay, but balances/revisions may advance.
  if (old) {
    if (old.request !== request)
      throw Error("Liquid operation reused with different request");
    return old;
  }
  if (
    sm.revision !== args.expectedSourceRevision ||
    dm.revision !== args.expectedDestinationRevision ||
    state.revision !== args.expectedInventoryRevision
  )
    throw Error("Liquid inventory revision changed");
  if (
    source.amountLitres < args.litres ||
    destination.amountLitres + args.litres > destination.capacityLitres
  )
    throw Error("Insufficient fuel or destination capacity");
  const nextSource = {
      ...source,
      amountLitres: source.amountLitres - args.litres,
    },
    nextDestination = {
      ...destination,
      amountLitres: destination.amountLitres + args.litres,
      liquidType: "fuel",
    };
  for (const c of [nextSource, nextDestination])
    if (
      c.amountLitres * (LIQUID_DENSITY_KG_PER_LITRE.fuel ?? Infinity) >
      c.maxMassKg + 1e-8
    )
      throw Error("Fuel reservoir mass limit exceeded");
  const inventory = legacyInventorySnapshot(ctx, actor.id),
    pockets = inventory.containers.find(
      (c) => c.carried && !c.parentItemId && c.kind === "grid",
    );
  if (!pockets) throw Error("Complete carried inventory required");
  validateInventory(
    {
      ...inventory,
      containers: inventory.containers.map((c) =>
        c.id === nextSource.id
          ? nextSource
          : c.id === nextDestination.id
            ? nextDestination
            : c,
      ),
    },
    INVENTORY_DEFINITIONS,
    LIQUID_DENSITY_KG_PER_LITRE,
    pockets.id,
    CHARACTER_CARRY_LIMIT_KG,
  );
  ctx.db.inventoryContainer.id.update(nextSource);
  ctx.db.inventoryContainer.id.update(nextDestination);
  ctx.db.inventoryContainerScope.containerId.update({
    ...sm,
    revision: sm.revision + 1n,
  });
  ctx.db.inventoryContainerScope.containerId.update({
    ...dm,
    revision: dm.revision + 1n,
  });
  // Contents changed mass: invalidate all carried nested container/item CAS state.
  for (const m of ctx.db.inventoryContainerScope.by_character.filter(actor.id))
    if (
      m.rootKind === "character" &&
      m.containerId !== sm.containerId &&
      m.containerId !== dm.containerId
    )
      ctx.db.inventoryContainerScope.containerId.update({
        ...m,
        revision: m.revision + 1n,
      });
  for (const m of ctx.db.inventoryItemMembership.by_character.filter(actor.id))
    if (m.rootCharacterId === actor.id)
      ctx.db.inventoryItemMembership.itemId.update({
        ...m,
        revision: m.revision + 1n,
      });
  ctx.db.inventoryState.characterId.update({
    ...state,
    revision: state.revision + 1n,
  });
  const result = {
    id,
    actorId: actor.id,
    request,
    sourceId: source.id,
    destinationId: destination.id,
    litres: args.litres,
  };
  ctx.db.wayfarerLiquidReceipt.insert(result);
  return result;
}
