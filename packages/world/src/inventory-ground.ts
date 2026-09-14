import { SenderError } from "spacetimedb/server";
import { inventoryDefinition } from "../../content/src/inventory";
import type { access, transaction } from "./inventory";

/** Build, but do not insert, the same server-positioned private drop wrapper for
 * explicit drops and displaced backpacks. The caller validates the whole result. */
export function prepareGroundDrop(
  ctx: Parameters<typeof transaction>[0],
  a: NonNullable<ReturnType<typeof access>>,
  itemId: string,
) {
  if (
    ctx.db.station.shipId.find(a.actor.shipId)?.occupantId === a.actor.id ||
    ctx.db.couchSeat.characterId.find(a.actor.id)
  )
    throw new SenderError("Stand up before dropping equipment");
  const item = a.data.items.find((i) => i.id === itemId);
  if (!item || !a.canItem(itemId))
    throw new SenderError("Item is out of reach");
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
  return {
    container,
    binding: {
      id: a.actor.id + ":ground:" + id,
      characterId: a.actor.id,
      containerId: id,
      placementId: a.groundAccess.drop(item.id),
    },
  };
}
