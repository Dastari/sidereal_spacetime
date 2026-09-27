import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { markFlightDirty } from "./construction-flight-compilation";
type Context = ReducerCtx<InferSchema<typeof world>>;
/** Physical mutation marker only; it never grants admission or a control lease. */
export function markShipFlightDirty(ctx: Context, shipId: string) {
  if (shipId && ctx.db.constructionFlightBinding.shipId.find(shipId))
    markFlightDirty(ctx.db, shipId, ctx.timestamp.microsSinceUnixEpoch);
}
export function markCharacterFlightDirty(ctx: Context, characterId: string) {
  const actor = ctx.db.character.id.find(characterId);
  if (actor) markShipFlightDirty(ctx, actor.shipId);
}
/** Preserve the existing validated write and mark both ships on a frame change.
 * Disconnect and sprint-only changes do not change physical mass or placement. */
export function commitFlightCharacter<T extends { id: string }>(
  ctx: Context,
  row: T,
  commit: (row: T) => unknown,
) {
  const before = ctx.db.character.id.find(row.id);
  const result = commit(row);
  const after = ctx.db.character.id.find(row.id);
  if (
    after &&
    (!before ||
      before.shipId !== after.shipId ||
      before.localX !== after.localX ||
      before.localY !== after.localY)
  ) {
    if (before) markShipFlightDirty(ctx, before.shipId);
    markShipFlightDirty(ctx, after.shipId);
  }
  return result;
}
