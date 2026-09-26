/**
 * Flat-shaded meshing of dresser prisms (angled hull panels, see packages/sim ship-dresser-prisms):
 * plan quad (metres, prefab frame) extruded from z0 to z1 texels, one geometry per material slot.
 * Faces are planar with hard normals, so a run of mitred panels reads as one continuous surface.
 */
import type { DressPrism } from "@sidereal/sim/ship-dresser";
import type { GeometryBuilder } from "./box-mesher";

const TEXEL = 1 / 16;

export function meshPrisms(prisms: readonly DressPrism[]): Map<number, GeometryBuilder> {
  const out = new Map<number, GeometryBuilder>();
  for (const p of prisms) {
    let g = out.get(p.slot);
    if (!g) out.set(p.slot, (g = { positions: [], normals: [], indices: [], boxes: 0 }));
    appendPrism(g, p);
  }
  return out;
}

function appendPrism(g: GeometryBuilder, p: DressPrism) {
  let q = p.quad;
  // Counter-clockwise from above (+Z up) so side normals face outward.
  const area = q.reduce((a, v, i) => a + v[0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * v[1], 0);
  if (Math.abs(area) < 1e-10) return;
  if (area < 0) q = [q[0], q[3], q[2], q[1]];
  const z0 = p.z0 * TEXEL;
  const z1 = p.z1 * TEXEL;
  const face = (pts: number[][], n: number[]) => {
    const base = g.positions.length / 3;
    for (const v of pts) g.positions.push(v[0], v[1], v[2]), g.normals.push(n[0], n[1], n[2]);
    g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  face(q.map((v) => [v[0], v[1], z1]), [0, 0, 1]);
  face([...q].reverse().map((v) => [v[0], v[1], z0]), [0, 0, -1]);
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    face([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], [dy / l, -dx / l, 0]);
  }
  g.boxes++;
}
