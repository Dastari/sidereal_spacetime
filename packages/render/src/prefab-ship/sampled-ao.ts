/** Bounded local cavity shading from sampled occupancy. No pass, texture or simulation input. */
import {
  visualCellKey,
  type VisualVolume,
} from "@sidereal/sim/ship-visual-compiler";

export function sampledCornerLight(
  cells: VisualVolume,
  cell: readonly [number, number, number],
  axis: number,
  side: number,
  cornerU: 0 | 1,
  cornerV: 0 | 1,
): number {
  const u = (axis + 1) % 3,
    v = (axis + 2) % 3;
  const outside = [...cell];
  outside[axis] += side;
  const occupied = (du: number, dv: number) => {
    const p = [...outside];
    p[u] += du;
    p[v] += dv;
    return cells.has(visualCellKey(p[0], p[1], p[2]));
  };
  const du = cornerU ? 1 : -1,
    dv = cornerV ? 1 : -1;
  const a = occupied(du, 0),
    b = occupied(0, dv),
    corner = occupied(du, dv);
  // The darkest closed corner retains 70% of the ordinary lit pigment.
  const blockers = a && b ? 3 : Number(a) + Number(b) + Number(corner);
  return 1 - blockers * 0.1;
}
