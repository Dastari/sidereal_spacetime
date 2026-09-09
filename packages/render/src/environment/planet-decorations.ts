export type PlanetTreePlacement = {
  position: [number, number, number];
  normal: [number, number, number];
  seed: number;
};
export type PlanetForestGeometry = {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  treeCount: number;
};
type Vec3 = [number, number, number];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function normalized(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  if (length < 1e-10) throw new Error("Tree surface normal must be nonzero");
  return v.map((n) => n / length) as Vec3;
}
function random(seed: number) {
  let value = seed | 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** One merged vertex-color batch; no scene nodes/materials per tree. Positions
 * use a radius-one globe. The caller chooses biome/slope-safe surface anchors.
 * Each tree is 0.0105..0.021 radius units tall: roughly 1.7..3.4 cells at diameter96.
 */
export function buildPlanetTrees(
  placements: readonly PlanetTreePlacement[],
  options: { scale?: number; puffy?: boolean } = {},
): PlanetForestGeometry {
  const scale = options.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
    throw new RangeError("Planet tree scale must be in (0,4]");
  if (placements.length > 2400)
    throw new RangeError("Planet forest budget is 2400 trees");
  const result: PlanetForestGeometry = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    treeCount: placements.length,
  };
  for (const placement of placements) {
    if (
      ![...placement.position, ...placement.normal, placement.seed].every(
        Number.isFinite,
      )
    )
      throw new Error("Non-finite planet tree placement");
    const rng = random(placement.seed),
      up = normalized(placement.normal);
    const right0 = normalized(
      cross(Math.abs(up[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0], up),
    );
    const forward0 = cross(right0, up),
      angle = rng() * Math.PI * 2;
    const right = right0.map(
      (n, i) => n * Math.cos(angle) + forward0[i] * Math.sin(angle),
    ) as Vec3;
    const forward = cross(right, up);
    const axes = [right, up, forward];
    const height = (0.0105 + rng() * 0.0105) * scale;
    const tint = 0.85 + rng() * 0.25;
    function box(center: Vec3, size: Vec3, color: Vec3) {
      for (let axis = 0; axis < 3; axis++)
        for (const sign of [-1, 1]) {
          const u = (axis + 1) % 3,
            v = (axis + 2) % 3,
            offset = result.positions.length / 3;
          // Cyclic axis order gives an outward-facing winding in this basis.
          for (const [a, b] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]) {
            const local = [...center];
            local[axis] += (sign * size[axis]) / 2;
            local[u] += (a * size[u]) / 2;
            local[v] += (b * size[v]) / 2;
            for (let k = 0; k < 3; k++)
              result.positions.push(
                placement.position[k] +
                  local[0] * right[k] +
                  local[1] * up[k] +
                  local[2] * forward[k],
              );
            result.normals.push(...axes[axis].map((n) => n * sign));
            result.colors.push(...color, 1);
          }
          // right × up = forward, hence the basis is right handed.
          result.indices.push(
            ...(sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]).map(
              (i) => offset + i,
            ),
          );
        }
    }
    box(
      [0, height * 0.22, 0],
      [height * 0.13, height * 0.44, height * 0.13],
      [0.24, 0.13, 0.055],
    );
    // Three offset crowns create small stepped branches, not a green billboard.
    box(
      [0, height * 0.49, 0],
      [height * 0.57, height * 0.25, height * 0.52],
      [0.035 * tint, 0.24 * tint, 0.018 * tint],
    );
    box(
      [height * 0.06, height * 0.71, -height * 0.035],
      [height * 0.44, height * 0.22, height * 0.44],
      [0.065 * tint, 0.42 * tint, 0.024 * tint],
    );
    box(
      [0, height * 0.91, 0],
      [height * 0.27, height * 0.18, height * 0.27],
      [0.14 * tint, 0.58 * tint, 0.035 * tint],
    );
    if (options.puffy)
      for (let branch = 0; branch < 4; branch++) {
        const angle = (branch * Math.PI) / 2 + 0.3;
        box(
          [
            Math.cos(angle) * height * 0.19,
            height * (0.56 + (branch % 2) * 0.14),
            Math.sin(angle) * height * 0.19,
          ],
          [height * 0.42, height * 0.34, height * 0.42],
          [0.1 * tint, (0.53 + (branch % 2) * 0.15) * tint, 0.026 * tint],
        );
      }
  }
  return result;
}
