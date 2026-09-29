/** S4-1: queue a ship's systems recompile (install, damage, refit). Import-cycle free, so
 * producers (combat damage, prefab install) can depend on it without the compile module. */
export type ShipSystemsDirtyReason =
  "install" | "damage" | "refit" | "backfill";

interface DirtyContext {
  db: {
    shipSystemsDirty: {
      shipId: { find(shipId: string): unknown };
      insert(row: {
        shipId: string;
        revision: bigint;
        reason: string;
      }): unknown;
    };
  };
  timestamp: { microsSinceUnixEpoch: bigint };
}

/** Keeps the oldest queue time, so the bounded step serves ships fairly. */
export function markShipSystemsDirty(
  ctx: DirtyContext,
  shipId: string,
  reason: ShipSystemsDirtyReason,
) {
  if (shipId && !ctx.db.shipSystemsDirty.shipId.find(shipId))
    ctx.db.shipSystemsDirty.insert({
      shipId,
      revision: ctx.timestamp.microsSinceUnixEpoch,
      reason,
    });
}
