import type { PlanetTreePlacement } from "./planet-decorations";
type Vec3 = [number, number, number];
export type PlanetCrystalGeometry = {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  crystalCount: number;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v);
  if (length < 1e-10) throw new Error("Crystal normal must be nonzero");
  return v.map((n) => n / length) as Vec3;
};
function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
/** One merged opaque vertex-color batch of true hexagonal, pointed prisms.
 * Outward CCW winding matches the other pure planet helpers; the renderer's
 * clockwise Babylon adapter flips each triangle once. No material/glow policy.
 */
export function buildPlanetCrystals(
  placements: readonly PlanetTreePlacement[],
  strength = 1,
): PlanetCrystalGeometry {
  if (
    placements.length > 400 ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 1
  )
    throw new RangeError(
      "Crystal budget is 400 placements; strength must be 0..1",
    );
  const result: PlanetCrystalGeometry = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    crystalCount: 0,
  };
  if (strength === 0) return result;
  for (const placement of placements) {
    if (
      ![...placement.position, ...placement.normal, placement.seed].every(
        Number.isFinite,
      )
    )
      throw new Error("Non-finite crystal placement");
    const up = unit(placement.normal),
      right = unit(cross(Math.abs(up[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0], up)),
      forward = cross(right, up),
      random = seeded(placement.seed);
    const count = 2 + Math.floor(random() * 2),
      rotation = random() * Math.PI * 2;
    for (let crystal = 0; crystal < count; crystal++) {
      const height =
        (crystal === 0 ? 0.11 + random() * 0.05 : 0.05 + random() * 0.055) *
        strength;
      const radius = height * (0.09 + random() * 0.035),
        yaw = rotation + crystal * 2.399963;
      const offset = crystal === 0 ? 0 : 0.018 * strength;
      const dx = Math.cos(yaw) * offset,
        dz = Math.sin(yaw) * offset;
      const toWorld = (p: Vec3): Vec3 =>
        placement.position.map(
          (n, k) =>
            n +
            right[k] * (p[0] + dx) +
            up[k] * p[1] +
            forward[k] * (p[2] + dz),
        ) as Vec3;
      const ring = (i: number, y: number, r: number): Vec3 => [
        Math.cos(yaw + (i * Math.PI) / 3) * r,
        y,
        Math.sin(yaw + (i * Math.PI) / 3) * r,
      ];
      function face(points: Vec3[], color: Vec3, outward: Vec3) {
        const a = points[1].map((n, k) => n - points[0][k]) as Vec3,
          b = points[2].map((n, k) => n - points[0][k]) as Vec3;
        let localNormal = unit(cross(a, b));
        const flip =
          localNormal.reduce((sum, n, k) => sum + n * outward[k], 0) < 0;
        if (flip) localNormal = localNormal.map((n) => -n) as Vec3;
        const normal = right.map(
          (n, k) =>
            n * localNormal[0] +
            up[k] * localNormal[1] +
            forward[k] * localNormal[2],
        );
        const first = result.positions.length / 3;
        for (const p of points) {
          result.positions.push(...toWorld(p));
          result.normals.push(...normal);
          result.colors.push(...color, 1);
        }
        for (let i = 1; i < points.length - 1; i++)
          result.indices.push(
            first,
            first + (flip ? i + 1 : i),
            first + (flip ? i : i + 1),
          );
      }
      for (let side = 0; side < 6; side++) {
        const a = ring(side, 0, radius * 0.7),
          b = ring(side + 1, 0, radius * 0.7),
          c = ring(side + 1, height * 0.72, radius),
          d = ring(side, height * 0.72, radius),
          angle = yaw + ((side + 0.5) * Math.PI) / 3;
        const outward: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
        const tint = (side % 3) / 2;
        face(
          [a, b, c, d],
          [0.27 + tint * 0.35, 0.055 + tint * 0.09, 0.49 + tint * 0.29],
          outward,
        );
        face(
          [d, c, [0, height, 0]],
          [0.8 + tint * 0.2, 0.34 + tint * 0.42, 0.87 + tint * 0.13],
          [...outward.slice(0, 1), 0.5, outward[2]] as Vec3,
        );
        face([[0, 0, 0], b, a], [0.16, 0.035, 0.28], [0, -1, 0]);
      }
      result.crystalCount++;
    }
  }
  if (result.crystalCount > 1200 || result.indices.length / 3 >= 30000)
    throw new RangeError("Crystal geometry budget exceeded");
  return result;
}
