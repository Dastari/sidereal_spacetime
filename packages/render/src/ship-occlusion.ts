import { CABIN_PARTITIONS } from "../../content/src/interior";

/** Planar fixture visibility. Door openings remain openings; solid partitions block spill. */
export function cabinLineOfSight(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  return !CABIN_PARTITIONS.some((box) => {
    let lo = 0,
      hi = 1;
    for (const [origin, delta, min, max] of [
      [ax, bx - ax, box.x - box.width / 2, box.x + box.width / 2],
      [ay, by - ay, box.y - box.depth / 2, box.y + box.depth / 2],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < min || origin > max) return false;
      } else {
        const a = (min - origin) / delta,
          b = (max - origin) / delta;
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
        if (lo > hi) return false;
      }
    }
    return hi > 1e-6 && lo < 1 - 1e-6;
  });
}
