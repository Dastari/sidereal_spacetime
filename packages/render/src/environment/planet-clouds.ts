type Vec3 = [number, number, number];
export type PlanetCloudOptions = {
  seed: number;
  coverage: number;
  radius?: number;
  detail: 24 | 48 | 96;
  tint?: Vec3;
  /** Elapsed visual seconds. Freeze this value for reduced motion. */
  phase?: number;
};
export type PlanetCloudGeometry = {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  faces: number;
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n) as Vec3;
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
/** A single merged cloud/smoke batch in normalized planet units, with opaque
 * per-vertex tint. Caller owns material, alpha, independent shell rotation/LOD.
 * Mathematical outward CCW indices match planet-decorations; a consumer using
 * the existing Babylon clockwise convention must flip each triangle ONCE.
 */
export function buildPlanetClouds({
  seed,
  coverage,
  radius = 1.13,
  detail,
  tint = [0.93, 0.97, 1],
  phase = 0,
}: PlanetCloudOptions): PlanetCloudGeometry {
  if (
    ![seed, coverage, radius, phase, ...tint].every(Number.isFinite) ||
    coverage < 0 ||
    coverage > 1 ||
    radius <= 0 ||
    ![24, 48, 96].includes(detail) ||
    tint.length !== 3 ||
    tint.some((c) => c < 0 || c > 1)
  )
    throw new RangeError("Invalid planet cloud definition");
  const result: PlanetCloudGeometry = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    faces: 0,
  };
  if (coverage === 0) return result;
  const random = seeded(seed),
    systems = 6 + Math.round(coverage * 12);
  const time = phase * 0.006,
    globalYaw = random() * Math.PI * 2;
  const billows = detail === 96 ? 6 : detail === 48 ? 5 : 4;
  for (let system = 0; system < systems; system++) {
    const y = 1 - (2 * (system + 0.4)) / systems,
      azimuth = system * 2.399963229728653 + globalYaw;
    const ring = Math.sqrt(1 - y * y),
      normal: Vec3 = [Math.cos(azimuth) * ring, y, Math.sin(azimuth) * ring];
    const right0 = unit(
      cross(Math.abs(y) > 0.9 ? [0, 0, 1] : [0, 1, 0], normal),
    );
    const forward0 = cross(right0, normal),
      yaw = random() * Math.PI * 2;
    const right = right0.map(
      (v, i) => v * Math.cos(yaw) + forward0[i] * Math.sin(yaw),
    ) as Vec3;
    const forward = cross(right, normal),
      offset = random() * Math.PI * 2;
    const evolution = time + offset;
    for (let billow = 0; billow < billows; billow++) {
      const rng = seeded(
        seed ^
          Math.imul(system + 1, 73856093) ^
          Math.imul(billow + 1, 19349663),
      );
      const wave = evolution * (0.7 + billow * 0.07) + billow * 1.7;
      const growth = 0.68 + 0.3 * Math.sin(wave * 0.8);
      const cx =
        (billow - (billows - 1) / 2) *
        (0.065 + 0.012 * Math.sin(evolution * 0.7));
      const cz = (rng() - 0.5) * 0.1 + 0.024 * Math.sin(wave);
      const altitude =
        radius - 0.006 + (rng() - 0.5) * 0.014 + 0.006 * Math.sin(wave * 0.65);
      const carrier = unit(
        normal.map(
          (v, i) => v * radius + right[i] * cx + forward[i] * cz,
        ) as Vec3,
      );
      const yaw2 = (rng() - 0.5) * 1.2;
      const tangent = right.map(
        (v, i) => v * Math.cos(yaw2) + forward[i] * Math.sin(yaw2),
      ) as Vec3;
      const ax = unit(cross(cross(tangent, carrier), carrier));
      const axes = [ax, carrier, cross(ax, carrier)];
      const cell = (0.038 + rng() * 0.006) * (0.65 + 0.35 * growth);
      // A nineteen-cell voxelized ellipsoid: six overlapping billows, never
      // a shared coplanar carpet. Independent yaw and height break aligned tops.
      for (let ix = -1; ix <= 1; ix++)
        for (let iy = -1; iy <= 1; iy++)
          for (let iz = -1; iz <= 1; iz++) {
            if (Math.abs(ix) + Math.abs(iy) + Math.abs(iz) > 2) continue;
            const drift = 0.002 * Math.sin(wave + ix * 1.1 + iz * 0.7);
            const center = carrier.map(
              (v, k) =>
                v * altitude +
                axes[0][k] * ix * cell * 0.82 +
                axes[1][k] * (iy * cell * 0.82 + drift) +
                axes[2][k] * iz * cell * 0.82,
            );
            const edge =
              1 - 0.11 * (Math.abs(ix) + Math.abs(iy) + Math.abs(iz));
            const sizes = [
              cell * (1.04 + 0.07 * Math.sin(wave + iz)) * edge,
              cell * (1.02 + 0.08 * Math.cos(wave + ix)) * edge,
              cell * edge,
            ];
            const shade = 0.97 + rng() * 0.03;
            const half = sizes.map((v) => v / 2),
              bevel = Math.min(...half) * 0.4;
            const inset = half.map((v) => v - bevel);
            function face(points: number[][], outward: number[]) {
              const ab = points[1].map((v, i) => v - points[0][i]),
                ac = points[2].map((v, i) => v - points[0][i]);
              let normal = unit(cross(ab as Vec3, ac as Vec3));
              if (normal.reduce((n, v, i) => n + v * outward[i], 0) < 0) {
                points.reverse();
                normal = normal.map((v) => -v) as Vec3;
              }
              const start = result.positions.length / 3;
              const under =
                normal[1] < -0.3 ? 0.64 : normal[1] > 0.3 ? 1 : 0.85;
              for (const point of points) {
                for (let k = 0; k < 3; k++)
                  result.positions.push(
                    center[k] +
                      axes[0][k] * point[0] +
                      axes[1][k] * point[1] +
                      axes[2][k] * point[2],
                  );
                for (let k = 0; k < 3; k++)
                  result.normals.push(
                    axes[0][k] * normal[0] +
                      axes[1][k] * normal[1] +
                      axes[2][k] * normal[2],
                  );
                result.colors.push(...tint.map((c) => c * shade * under), 1);
              }
              for (let i = 1; i < points.length - 1; i++)
                result.indices.push(start, start + i, start + i + 1);
              result.faces++;
            }
            // Six inset faces, twelve bevel strips, eight triangular corners.
            for (let axis = 0; axis < 3; axis++)
              for (const sign of [-1, 1]) {
                const u = (axis + 1) % 3,
                  v = (axis + 2) % 3;
                face(
                  [
                    [-1, -1],
                    [1, -1],
                    [1, 1],
                    [-1, 1],
                  ].map(([a, b]) => {
                    const p = [0, 0, 0];
                    p[axis] = sign * half[axis];
                    p[u] = a * inset[u];
                    p[v] = b * inset[v];
                    return p;
                  }),
                  [0, 1, 2].map((i) => (i === axis ? sign : 0)),
                );
              }
            for (let axis = 0; axis < 3; axis++)
              for (const s of [-1, 1])
                for (const t of [-1, 1]) {
                  const u = (axis + 1) % 3,
                    v = (axis + 2) % 3;
                  face(
                    [
                      [-1, 0],
                      [1, 0],
                      [1, 1],
                      [-1, 1],
                    ].map(([end, side]) => {
                      const p = [0, 0, 0];
                      p[axis] = end * inset[axis];
                      p[u] = s * (side ? inset[u] : half[u]);
                      p[v] = t * (side ? half[v] : inset[v]);
                      return p;
                    }),
                    [0, 1, 2].map((i) => (i === u ? s : i === v ? t : 0)),
                  );
                }
            for (const x of [-1, 1])
              for (const y of [-1, 1])
                for (const z of [-1, 1]) {
                  const signs = [x, y, z];
                  face(
                    [0, 1, 2].map((axis) =>
                      signs.map(
                        (sign, i) => sign * (i === axis ? half[i] : inset[i]),
                      ),
                    ),
                    signs,
                  );
                }
          }
    }
  }
  if (result.indices.length / 3 > 108000)
    throw new RangeError("Planet cloud triangle budget exceeded");
  return result;
}
