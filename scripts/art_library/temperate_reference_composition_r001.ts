import { deformedNormalAt } from "./native_deformation_normals";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
type Vec = [number, number, number];
type Range = { firstTriangle: number; triangleCount: number; partId: string };
const unit = (v: Vec): Vec => {
  const n = Math.hypot(...v);
  if (n < 1e-12) throw new Error("Degenerate native triangle");
  return [v[0] / n, v[1] / n, v[2] / n];
};
const horizontalFootprint = 1;
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Broad native temperate continents with retained Ocean7 water and forest PBR.
 * Original continental coast triangles and groves retain their transforms and
 * attributes at every LOD; only authored water-sphere resolution changes. */
export function composeTemperateReference(
  kit: NativePlanetKit,
  seed: number,
  lod: 0 | 1 | 2,
  diagnostic = false,
) {
  const batches = kit.materials.map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    uvs: [] as number[],
    indices: [] as number[],
    ranges: [] as Range[],
  }));
  const variant = (name: string) => {
    const value = kit.variants.find((v) => v.name === name);
    if (!value) throw new Error(`Missing temperate native variant ${name}`);
    return value;
  };
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const phase = random() * Math.PI * 2;
  function emit(
    name: string,
    id: string,
    transform: (v: Vec) => Vec,
    smooth = false,
  ) {
    const mesh = variant(name) as NativePlanetKit["variants"][number] & {
        normals: number[];
        uvs: number[];
      },
      starts = batches.map((b) => b.indices.length / 3);
    if (
      mesh.normals?.length !== mesh.positions.length ||
      mesh.uvs?.length !== (mesh.positions.length / 3) * 2
    )
      throw new Error("Missing authored temperate normals or UVs");
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const batch = batches[mesh.triangleMaterials[i / 3]];
      if (!batch) throw new Error("Invalid native material role");
      const source = [0, 1, 2].map(
          (k) =>
            mesh.positions.slice(
              mesh.indices[i + k] * 3,
              mesh.indices[i + k] * 3 + 3,
            ) as Vec,
        ),
        p = source.map(transform);
      const normals = source.map((point, k) =>
          deformedNormalAt(
            mesh.normals.slice(
              mesh.indices[i + k] * 3,
              mesh.indices[i + k] * 3 + 3,
            ) as Vec,
            point,
            transform,
          ),
        ),
        start = batch.positions.length / 3;
      for (let k = 0; k < 3; k++) {
        batch.positions.push(...p[k]);
        batch.normals.push(...normals[k]);
        batch.uvs.push(
          ...mesh.uvs.slice(
            mesh.indices[i + k] * 2,
            mesh.indices[i + k] * 2 + 2,
          ),
        );
      }
      // Blender source is CCW. No handedness reversal here; uploader uses CCW.
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
  emit(
    ["ground-sphere", "ground-sphere-medium", "ground-sphere-low"][lod],
    "ground",
    (v) => v,
    true,
  );
  function place(
    name: string,
    id: string,
    anchor: Vec,
    scale: number,
    angle: number,
    burial = 0,
  ) {
    const n = unit(anchor),
      east = unit(cross(Math.abs(n[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0], n)),
      north = cross(n, east),
      c = Math.cos(angle),
      s = Math.sin(angle);
    emit(name, id, (v) => {
      const x = (v[0] * c - v[1] * s) * scale * horizontalFootprint,
        y = (v[0] * s + v[1] * c) * scale * horizontalFootprint,
        h = 1 + v[2] * scale - burial;
      const direction = unit([
        n[0] + east[0] * x + north[0] * y,
        n[1] + east[1] * x + north[1] * y,
        n[2] + east[2] * x + north[2] * y,
      ]);
      return [direction[0] * h, direction[1] * h, direction[2] * h];
    });
  }
  // Six broad landmasses yield two or three visible continents, with connected
  // forest masses, rather than Ocean's twelve scattered small island groups.
  const layouts = [
    { name: "continent-a", scale: 0.55, height: 0.38 },
    { name: "continent-b", scale: 0.49, height: 0.47 },
    { name: "continent-c", scale: 0.58, height: 0.31 },
    { name: "continent-a", scale: 0.51, height: 0.38 },
    { name: "continent-c", scale: 0.54, height: 0.31 },
    { name: "continent-b", scale: 0.47, height: 0.47 },
  ];
  const grovePlan = [
    [-1.02, -0.18],
    [-0.75, 0.18],
    [-0.55, -0.37],
    [-0.33, 0.16],
    [-0.1, -0.34],
    [0.12, 0.21],
    [0.38, -0.28],
    [0.62, 0.15],
    [0.88, -0.17],
    [-0.56, 0.46],
    [0.17, 0.48],
    [0.57, 0.46],
  ];
  for (let i = 0; i < (diagnostic ? 1 : layouts.length); i++) {
    const spec = layouts[i],
      y = 1 - (2 * (i + 0.5)) / layouts.length,
      theta = phase + i * 2.39996323,
      r = Math.sqrt(1 - y * y),
      n: Vec = diagnostic
        ? unit([0.452, 0.388, 0.794])
        : [Math.cos(theta) * r, y, Math.sin(theta) * r],
      rotation = diagnostic ? 0 : random() * Math.PI * 2;
    place(spec.name, `continent-${i}`, n, spec.scale, rotation);
    const east = unit(cross(Math.abs(n[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0], n)),
      north = cross(n, east),
      c = Math.cos(rotation),
      ss = Math.sin(rotation);
    for (let g = 0; g < grovePlan.length; g++) {
      const [gx, gy] = grovePlan[g],
        groveScale = 0.15 + [0.015, 0.025, 0, 0.02][g % 4];
      emit(
        g % 4 === 3 ? "small-grove" : "tree-grove",
        `forest-${i}-${g}`,
        (v) => {
          const lx = gx * spec.scale + v[0] * groveScale,
            ly = gy * spec.scale + v[1] * groveScale,
            x = lx * c - ly * ss,
            z = lx * ss + ly * c,
            h = 1 + spec.height * spec.scale + v[2] * groveScale;
          const d = unit([
            n[0] + east[0] * x + north[0] * z,
            n[1] + east[1] * x + north[1] * z,
            n[2] + east[2] * x + north[2] * z,
          ]);
          return [d[0] * h, d[1] * h, d[2] * h];
        },
      );
    }
  }
  return batches.map((b) => ({
    ...b,
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    uvs: Float32Array.from(b.uvs),
    indices: Uint32Array.from(b.indices),
  }));
}
