import { deformedFaceNormals } from "./native_deformation_normals";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
type Vec = [number, number, number];
type Range = { firstTriangle: number; triangleCount: number; partId: string };
const unit = (v: Vec): Vec => {
  const n = Math.hypot(...v);
  if (n < 1e-12) throw new Error("Degenerate native triangle");
  return [v[0] / n, v[1] / n, v[2] / n];
};
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Native triangle-preserving assembly. Island source triangles are pre-tessellated in Blender before curved mapping;
 * no broad sparse cap is warped across a sphere.
 * Dominant islands, coastal shelves and groves retain identical transforms at every LOD. */
export function composeOceanReference(
  kit: NativePlanetKit,
  seed: number,
  lod: 0 | 1 | 2,
) {
  const batches = kit.materials.map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    indices: [] as number[],
    ranges: [] as Range[],
  }));
  const variant = (name: string) => {
    const value = kit.variants.find((v) => v.name === name);
    if (!value) throw new Error(`Missing ocean native variant ${name}`);
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
    const mesh = variant(name),
      starts = batches.map((b) => b.indices.length / 3);
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
      const normals = smooth
          ? p.map(unit)
          : deformedFaceNormals(source, transform),
        start = batch.positions.length / 3;
      for (let k = 0; k < 3; k++) {
        batch.positions.push(...p[k]);
        batch.normals.push(...normals[k]);
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
      const x = (v[0] * c - v[1] * s) * scale,
        y = (v[0] * s + v[1] * c) * scale,
        h = 1 + v[2] * scale - burial;
      const direction = unit([
        n[0] + east[0] * x + north[0] * y,
        n[1] + east[1] * x + north[1] * y,
        n[2] + east[2] * x + north[2] * y,
      ]);
      return [direction[0] * h, direction[1] * h, direction[2] * h];
    });
  }
  // Sparse separated island groups cover a small fraction of the sphere.
  // Primary positions form a seeded, unequal distribution rather than a central
  // connected strip. Dense authored triangles allow the beach/cliff mesh to follow body curvature.
  const anchors: Vec[] = [];
  const layouts = [
    { name: "steep-island", scale: 0.25, height: 0.325 },
    { name: "archipelago", scale: 0.25, height: 0.28 },
    { name: "long-island", scale: 0.27, height: 0.23 },
    { name: "archipelago", scale: 0.23, height: 0.28 },
    { name: "steep-island", scale: 0.24, height: 0.325 },
    { name: "lagoon-atoll", scale: 0.13, height: 0 },
    { name: "steep-island", scale: 0.27, height: 0.325 },
    { name: "long-island", scale: 0.22, height: 0.23 },
    { name: "archipelago", scale: 0.25, height: 0.28 },
    { name: "steep-island", scale: 0.25, height: 0.325 },
    { name: "archipelago", scale: 0.26, height: 0.28 },
    { name: "long-island", scale: 0.25, height: 0.23 },
  ];
  for (let i = 0; i < layouts.length; i++) {
    const spec = layouts[i],
      y = 1 - (2 * (i + 0.5)) / layouts.length,
      angle = phase + i * 2.39996323,
      r = Math.sqrt(1 - y * y),
      n: Vec = [Math.cos(angle) * r, y, Math.sin(angle) * r],
      rotation = random() * Math.PI * 2;
    anchors.push(n);
    place(spec.name, `island-${i}`, n, spec.scale, rotation);
    // Grove bases sit on the local plateau top. Groves share the island's
    // radial surface map so they do not drift or fall into the water. The multi-island archipelago needs separate top anchors below.
    if (spec.height) {
      const east = unit(
          cross(Math.abs(n[1]) > 0.94 ? [1, 0, 0] : [0, 1, 0], n),
        ),
        north = cross(n, east),
        c = Math.cos(rotation),
        ss = Math.sin(rotation);
      const groves =
        spec.name === "archipelago"
          ? [
              { x: -0.55, y: 0.21, scale: 0.058, height: 0.19 },
              { x: 0.27, y: -0.24, scale: 0.053, height: 0.28 },
            ]
          : [
              { x: -0.1, y: 0.08, scale: 0.085, height: spec.height },
              { x: 0.19, y: -0.08, scale: 0.072, height: spec.height },
            ];
      for (let g = 0; g < groves.length; g++) {
        const grove = groves[g];
        emit(g === 0 ? "tree-grove" : "small-grove", `grove-${i}-${g}`, (v) => {
          const lx = grove.x * spec.scale + v[0] * grove.scale,
            ly = grove.y * spec.scale + v[1] * grove.scale,
            x = lx * c - ly * ss,
            z = lx * ss + ly * c,
            h = 1 + grove.height * spec.scale + v[2] * grove.scale;
          const direction = unit([
            n[0] + east[0] * x + north[0] * z,
            n[1] + east[1] * x + north[1] * z,
            n[2] + east[2] * x + north[2] * z,
          ]);
          return [direction[0] * h, direction[1] * h, direction[2] * h];
        });
      }
    }
  }
  // Small detached islets retain the same positions at every LOD; no coastline
  // change is hidden by switching detail. The water remains mostly uninterrupted.
  for (let i = 0; i < 12; i++) {
    const a = anchors[i % anchors.length],
      n = unit([
        a[0] + (random() - 0.5) * 0.8,
        a[1] + (random() - 0.5) * 0.8,
        a[2] + (random() - 0.5) * 0.8,
      ]);
    place(
      "tiny-islet",
      `islet-${i}`,
      n,
      0.075 + random() * 0.045,
      random() * Math.PI * 2,
    );
  }
  return batches.map((b) => ({
    ...b,
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    indices: Uint32Array.from(b.indices),
  }));
}
