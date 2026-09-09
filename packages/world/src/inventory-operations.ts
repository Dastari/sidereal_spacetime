import { SenderError, t } from "spacetimedb/server";
import { access, transaction, commitItems } from "./inventory";
import { firstInventoryPlacement } from "../../sim/src/inventory";
import {
  INVENTORY_DEFINITIONS,
  inventoryDefinition,
  LIQUID_DENSITY_KG_PER_LITRE,
  CHARACTER_CARRY_LIMIT_KG,
} from "../../content/src/inventory";
import { interactionLineOfSight } from "../../sim/src/interactions";
import { CABIN_PARTITIONS } from "../../content/src/interior";
type Context = Parameters<typeof transaction>[0];
type Mutation = Parameters<typeof transaction>[1];
type Access = NonNullable<ReturnType<typeof access>>;
const ground = (a: Access, id: string) =>
  a.bindings.some(
    (b) => b.containerId === id && b.placementId.startsWith("ground:"),
  );
function destinations(a: Access, target: string) {
  if (target) {
    if (!a.canContainer(target) || ground(a, target))
      throw new SenderError("Destination is unavailable");
    return [target];
  }
  const pack = a.data.items.find((i) => i.equipmentSlot === "back");
  return a.data.containers
    .filter(
      (c) =>
        c.kind === "grid" &&
        a.canContainer(c.id) &&
        (c.parentItemId === pack?.id || c.id === a.pockets?.id),
    )
    .sort(
      (x, y) =>
        Number(y.parentItemId === pack?.id) -
        Number(x.parentItemId === pack?.id),
    )
    .map((c) => c.id);
}
function transfer(
  a: Access,
  itemId: string,
  targets: string[],
  items = a.data.items,
) {
  for (const containerId of targets) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.containerId === containerId) continue;
    const location = firstInventoryPlacement(
      { ...a.data, items },
      INVENTORY_DEFINITIONS,
      LIQUID_DENSITY_KG_PER_LITRE,
      a.pockets!.id,
      CHARACTER_CARRY_LIMIT_KG,
      itemId,
      containerId,
    );
    if (location)
      return items.map((i) => (i.id === itemId ? { ...i, ...location } : i));
  }
}
export function transferItem(
  ctx: Context,
  args: Mutation & { itemId: string; containerId: string },
) {
  transaction(
    ctx,
    args,
    "quick-transfer",
    [args.itemId, args.containerId],
    (a) => {
      if (!a.canItem(args.itemId))
        throw new SenderError("Item is out of reach");
      const items = transfer(a, args.itemId, destinations(a, args.containerId));
      if (!items)
        throw new SenderError("No room or payload capacity in the destination");
      commitItems(ctx, a, items);
    },
  );
}
/** One revision and one atomic receipt. Items which cannot fit stay in storage. */
export function takeAll(
  ctx: Context,
  args: Mutation & { containerId: string },
) {
  transaction(ctx, args, "take-all", [args.containerId], (a) => {
    if (
      !a.canContainer(args.containerId) ||
      a.carriedContainer(args.containerId)
    )
      throw new SenderError("Open nearby storage to take its contents");
    const targets = destinations(a, "");
    let items = a.data.items,
      moved = 0;
    for (const item of a.data.items.filter(
      (i) => i.containerId === args.containerId,
    )) {
      const next = transfer(a, item.id, targets, items);
      if (next) {
        items = next;
        moved++;
      }
    }
    if (!moved)
      throw new SenderError("No items fit in your backpack or pockets");
    commitItems(ctx, a, items);
  });
}
/** Position comes entirely from the actor; a client cannot author drop transforms. */
export function dropItem(ctx: Context, args: Mutation & { itemId: string }) {
  transaction(ctx, args, "drop-item", [args.itemId], (a) => {
    if (!a.canItem(args.itemId)) throw new SenderError("Item is out of reach");
    if (
      ctx.db.station.shipId.find(a.actor.shipId)?.occupantId === a.actor.id ||
      ctx.db.couchSeat.characterId.find(a.actor.id)
    )
      throw new SenderError("Stand up before dropping equipment");
    const item = a.data.items.find((i) => i.id === args.itemId)!;
    if (ground(a, item.containerId))
      throw new SenderError("Item is already on the ground");
    const d = inventoryDefinition(item.definitionId),
      id = ctx.newUuidV4().toString();
    const container = {
      ...a.pockets!,
      id,
      parentItemId: "",
      carried: false,
      name: d.name,
      width: d.width,
      height: d.height,
      maxMassKg: 1_000_000,
      shipId: a.actor.shipId,
      localX: a.actor.localX,
      localY: a.actor.localY,
    };
    const next = {
      ...a,
      data: { ...a.data, containers: [...a.data.containers, container] },
    };
    const items = a.data.items.map((i) =>
      i.id === item.id
        ? {
            ...i,
            containerId: id,
            equipmentSlot: "",
            x: 0,
            y: 0,
            rotated: false,
          }
        : i,
    );
    // commitItems validates the whole nested inventory before writing any item.
    commitItems(ctx, next, items);
    ctx.db.inventoryContainer.insert(container);
    ctx.db.storageBinding.insert({
      id: a.actor.id + ":ground:" + id,
      characterId: a.actor.id,
      containerId: id,
      placementId: "ground:" + item.id,
    });
  });
}
export const groundItemProjection = t.object("VisibleGroundItem", {
  id: t.string(),
  definitionId: t.string(),
  localX: t.f64(),
  localY: t.f64(),
  reachable: t.bool(),
});
/** Private actor/lab ownership is retained; only discovered ground visuals are projected. */
export function groundItemsView(ctx: Parameters<typeof access>[0]) {
  const a = access(ctx);
  if (!a) return [];
  return a.bindings
    .filter((b) => b.placementId.startsWith("ground:"))
    .flatMap((b) => {
      const c = a.data.containers.find((c) => c.id === b.containerId);
      if (
        !c ||
        c.shipId !== a.actor.shipId ||
        Math.hypot(c.localX - a.actor.localX, c.localY - a.actor.localY) > 12 ||
        !interactionLineOfSight(
          a.actor.localX,
          a.actor.localY,
          c.localX,
          c.localY,
          CABIN_PARTITIONS,
        )
      )
        return [];
      return a.data.items
        .filter((i) => i.containerId === c.id)
        .map((i) => ({
          id: i.id,
          definitionId: i.definitionId,
          localX: c.localX,
          localY: c.localY,
          reachable: a.canContainer(c.id),
        }));
    });
}
