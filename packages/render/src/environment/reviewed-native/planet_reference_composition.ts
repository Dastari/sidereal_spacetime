import {
  deformedFaceNormals,
  deformedNormalAt,
} from "./native_deformation_normals";
import type { NativePlanetKit } from "../native-planet-composition";
type Vec = [number, number, number];
const unit = (v: Vec): Vec => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n) as Vec;
};
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Seeded placement/deformation of native Blender meshes. No voxel regeneration. */
export function composeDesertReference(
  kit: NativePlanetKit,
  seed: number,
  lod: 0 | 1 | 2,
  unitOnly = false,
) {
  const batches = kit.materials.map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    indices: [] as number[],
    ranges: [] as {
      firstTriangle: number;
      triangleCount: number;
      partId: string;
    }[],
  }));
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const phase = random() * Math.PI * 2;
  function emit(
    variant: NativePlanetKit["variants"][number],
    id: string,
    transform: (v: Vec) => Vec,
    smooth = false,
  ) {
    const starts = batches.map((b) => b.indices.length / 3);
    const attributes = variant as typeof variant & {
      normals?: number[];
      uvs?: number[];
    };
    for (let i = 0; i < variant.indices.length; i += 3) {
      const role = variant.triangleMaterials[i / 3],
        batch = batches[role];
      const source = [0, 1, 2].map(
          (k) =>
            variant.positions.slice(
              variant.indices[i + k] * 3,
              variant.indices[i + k] * 3 + 3,
            ) as Vec,
        ),
        p = source.map(transform),
        normals = smooth ? p.map(unit) : deformedFaceNormals(source, transform);
      const normal = unit(
        cross(
          p[1].map((x, k) => x - p[0][k]) as Vec,
          p[2].map((x, k) => x - p[0][k]) as Vec,
        ),
      );
      const start = batch.positions.length / 3;
      for (let j = 0; j < 3; j++) {
        batch.positions.push(...p[j]);
        batch.normals.push(
          ...(attributes.normals
            ? deformedNormalAt(
                attributes.normals.slice(
                  variant.indices[i + j] * 3,
                  variant.indices[i + j] * 3 + 3,
                ) as Vec,
                source[j],
                transform,
              )
            : normals[j]),
        );
        batch.uvs.push(
          ...(attributes.uvs?.slice(
            variant.indices[i + j] * 2,
            variant.indices[i + j] * 2 + 2,
          ) ?? [0, 0]),
        );
      }
      batch.indices.push(start, start + 1, start + 2);
    }
    batches.forEach((b, i) => {
      const count = b.indices.length / 3 - starts[i];
      if (count)
        b.ranges.push({
          firstTriangle: starts[i],
          triangleCount: count,
          partId: id,
        });
    });
  }
  const ground = kit.variants.filter(
    (v) => v.name.includes("ground") || v.name.includes("sphere"),
  );
  const base = ground[lod] ?? ground[0];
  if (!base) throw new Error("Missing authored ground");
  const height = (_v: Vec) => 1;
  emit(
    base,
    "ground",
    (v) => {
      const n = unit(v);
      return n.map((x) => x * height(n)) as Vec;
    },
    true,
  );
  const formations = kit.variants.filter((v) => !ground.includes(v));
  const hero = formations.filter((v) => v.name.startsWith("mesa-group"));
  const regionNames = [
    "regional-cliff-head",
    "regional-cliff-continuation",
    "regional-cliff-end",
  ];
  for (let region = 0; region < (unitOnly ? 1 : 12); region++) {
    const y = 1 - (2 * (region + 0.5)) / 12,
      angle = region * 2.399963229728653 + phase,
      r = Math.sqrt(1 - y * y),
      anchor: Vec = unitOnly
        ? unit([0.452, 0.388, 0.794])
        : [Math.cos(angle) * r, y, Math.sin(angle) * r],
      east = unit(cross([0, 1, 0], anchor)),
      north = cross(anchor, east),
      scale = [0.43, 0.39, 0.45, 0.4, 0.42, 0.37][region % 6],
      rotation = random() * Math.PI * 2;
    const variant = kit.variants.find(
      (v) => v.name === regionNames[region % 3],
    )!;
    emit(variant, `region-${region}`, (v) => {
      const x = (v[0] * Math.cos(rotation) - v[1] * Math.sin(rotation)) * scale,
        z = (v[0] * Math.sin(rotation) + v[1] * Math.cos(rotation)) * scale,
        direction = unit(
          anchor.map((k, j) => k + east[j] * x + north[j] * z) as Vec,
        ),
        h = height(direction) + v[2] * scale - 0.012;
      return direction.map((k) => k * h) as Vec;
    });
  }
  const rock = formations.find(
    (v) =>
      v.name.includes("small") ||
      v.name.includes("scatter") ||
      v.name.includes("rock"),
  );
  // Index-based placement seeds keep the same retained features at every level.
  if (rock)
    for (let i = 0; i < [12, 6, 0][lod]; i++) {
      const y = 1 - 2 * random(),
        angle = random() * Math.PI * 2,
        r = Math.sqrt(1 - y * y),
        n: Vec = [Math.cos(angle) * r, y, Math.sin(angle) * r],
        east = unit(cross(Math.abs(y) > 0.9 ? [1, 0, 0] : [0, 1, 0], n)),
        north = cross(n, east),
        scale = 0.025 + random() * 0.035;
      emit(
        rock,
        `rock-${i}`,
        (v) =>
          n.map(
            (k, j) =>
              k * (height(n) + v[2] * scale - 0.012) +
              east[j] * v[0] * scale +
              north[j] * v[1] * scale,
          ) as Vec,
      );
    }
  return batches.map((b) => ({
    ...b,
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    uvs: Float32Array.from(b.uvs),
    indices: Uint32Array.from(b.indices),
  }));
}
