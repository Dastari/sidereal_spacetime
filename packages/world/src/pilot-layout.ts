import { SenderError, type ReducerCtx, type InferSchema } from "spacetimedb/server";
import type world from "./index";
import { PILOT_LAYOUT, repairLabDeckPosition } from "../../content/src/pilot-layout";
type Context = ReducerCtx<InferSchema<typeof world>>;
export function alignPilotLayout(ctx: Context, shipId: string) {
  const ship = ctx.db.ship.id.find(shipId);
  if (!ship || !ship.owner.isEqual(ctx.sender)) throw new SenderError("Ship unavailable");
  const receipt = ctx.db.pilotLayoutReceipt.shipId.find(shipId);
  if (receipt && receipt.revision >= PILOT_LAYOUT.revision) return;
  const station = ctx.db.station.shipId.find(shipId);
  if (!station) throw new SenderError("Station unavailable");
  // Only the known lab baseline may be upgraded; an unrelated edited fixture is not silently overwritten.
  if (station.localX !== 0 || ![6, 10, PILOT_LAYOUT.station.y].includes(station.localY))
    throw new SenderError("Pilot fixture requires explicit migration review");
  const occupant = station.occupantId ? ctx.db.character.id.find(station.occupantId) : undefined;
  if (station.occupantId && (!occupant || occupant.shipId !== shipId || !occupant.owner.isEqual(ctx.sender)))
    throw new SenderError("Invalid station occupant");
  ctx.db.station.id.update({ ...station, localX: PILOT_LAYOUT.station.x, localY: PILOT_LAYOUT.station.y });
  for (const actor of ctx.db.character.by_owner.filter(ctx.sender)) {
    if (actor.shipId !== shipId) continue;
    const point = actor.id === occupant?.id ? PILOT_LAYOUT.station : repairLabDeckPosition(actor.localX, actor.localY);
    ctx.db.character.id.update({ ...actor, localX: point.x, localY: point.y, sprinting: false });
    const input = ctx.db.input.characterId.find(actor.id);
    if (input) ctx.db.input.characterId.update({ ...input, throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false });
  }
  const nextReceipt = { shipId, revision: PILOT_LAYOUT.revision, stationId: station.id,
    previousX: station.localX, previousY: station.localY, appliedMicros: ctx.timestamp.microsSinceUnixEpoch };
  if (receipt) ctx.db.pilotLayoutReceipt.shipId.update(nextReceipt);
  else ctx.db.pilotLayoutReceipt.insert(nextReceipt);
}
