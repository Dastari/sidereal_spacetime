import type { SurfaceGeometry } from "./planet-terrain";
import { hash } from "./voxel-planets";
/** Select surface-facing water cells globally, so no cube face monopolizes glints. */
export function sampleOceanGlints(water: SurfaceGeometry, seed: number) {
  const candidates: { position: number[]; normal: number[]; score: number }[] =
    [];
  for (let face = 0; face < water.faces; face++) {
    const offset = face * 12,
      normal = water.normals.slice(offset, offset + 3);
    const position = [0, 1, 2].map(
      (axis) =>
        [0, 1, 2, 3].reduce(
          (sum, v) => sum + water.positions[offset + v * 3 + axis],
          0,
        ) / 4,
    );
    const length = Math.hypot(...position);
    if (
      !length ||
      normal.reduce((sum, v, i) => sum + (v * position[i]) / length, 0) < 0.98
    )
      continue;
    const score = hash(face, 19, 7, seed);
    if (score > 0.012) continue;
    candidates.push({
      position: position.map((v, i) => v + normal[i] * 0.0014),
      normal,
      score,
    });
  }
  return candidates.sort((a, b) => a.score - b.score).slice(0, 96);
}
