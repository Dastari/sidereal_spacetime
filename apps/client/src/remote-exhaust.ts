/** Firing thrusters of perceived ships from `visible_actuator_exhaust`, grouped per ship for the
 * remote exterior renderer (presentation only; the server decides who is perceived). */
export interface RemoteExhaustRow {
  shipId: string;
  sourceId: string;
  throttle: number;
}

export function remoteExhaustByShip(
  rows: Iterable<RemoteExhaustRow>,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!Number.isFinite(r.throttle) || r.throttle <= 0) continue;
    let ship = out.get(r.shipId);
    if (!ship) out.set(r.shipId, (ship = new Map()));
    ship.set(r.sourceId, Math.min(1, r.throttle));
  }
  return out;
}
