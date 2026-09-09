/** Server-owned laboratory fixture layout, independent of visual mesh transforms. */
export const PILOT_LAYOUT = { revision: 3, station: { x: 0, y: 10.25 }, console: { x: 0, y: 11.25 } } as const;
/** R006 standing crew envelope: radius .3 m, conservative canopy slice at
 * 2.25 m above the authored assembly origin. This is a planar clearance rule,
 * not vertical simulation. The visual floor is .1875 m above that origin. */
export const LAB_CREW_CLEARANCE = { radius: .3, canopyInset: .732, maxY: 11.968,
  bridgeHalfWidth: 1.968, diagonalSum: 14 - Math.SQRT2 * (.732 + .3) } as const;
export function constrainLabDeck(x: number, y: number): { x: number; y: number } {
  const py = Math.max(-8, Math.min(LAB_CREW_CLEARANCE.maxY, y));
  const halfWidth = py <= 8.325 ? 4 : Math.min(LAB_CREW_CLEARANCE.bridgeHalfWidth, LAB_CREW_CLEARANCE.diagonalSum - py);
  return { x: Math.max(-halfWidth, Math.min(halfWidth, x)), y: py };
}
/** One-time migration also evicts obsolete positions embedded in the new jambs. */
export function repairLabDeckPosition(x: number, y: number) {
  const point = constrainLabDeck(x, y);
  if (Math.abs(point.x) > .325 && point.y > 8.325 && point.y < 9.3)
    point.y = point.y < 8.8125 ? 8.325 : 9.3;
  return point;
}
