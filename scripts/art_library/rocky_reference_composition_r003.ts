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
const minus = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Native triangle-preserving assembly. Affine tangent transforms keep sparse
 * authored cap polygons planar: no spherical warping across a large n-gon.
 * Dominant pits and shelf clusters retain identical transforms at every LOD. */
export function composeRockyReference(
  kit: NativePlanetKit,
  seed: number,
  lod: 0 | 1 | 2,
  diagnostic = false,
) {
  const batches = kit.materials.map(() => ({
    positions: [] as number[],
    normals: [] as number[],
    indices: [] as number[],
    ranges: [] as Range[],
  }));
  const variant = (name: string) => {
    const value = kit.variants.find((v) => v.name === name);
    if (!value) throw new Error(`Missing rocky native variant ${name}`);
    return value;
  };
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const phase = random() * Math.PI * 2;
  const jobs: { name: string; id: string; transform: (v: Vec) => Vec }[] = [];
  const depressions: { n: Vec; scale: number; depth: number }[] = [];
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
      const p = [0, 1, 2].map((k) =>
        transform(
          mesh.positions.slice(
            mesh.indices[i + k] * 3,
            mesh.indices[i + k] * 3 + 3,
          ) as Vec,
        ),
      );
      const normal = unit(cross(minus(p[1], p[0]), minus(p[2], p[0]))),
        start = batch.positions.length / 3;
      for (const v of p) {
        batch.positions.push(...v);
        batch.normals.push(...(smooth ? unit(v) : normal));
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
    if (
      name === "crater-small" &&
      depressions.some(
        (d) =>
          Math.hypot(n[0] - d.n[0], n[1] - d.n[1], n[2] - d.n[2]) <
          d.scale * 0.75 + scale * 0.55,
      )
    )
      return;
    if (name.startsWith("crater")) {
      burial = scale * 0.27;
      depressions.push({
        n,
        scale: scale * (name === "crater-small" ? 0.52 : 1),
        depth: burial + 0.008,
      });
    }
    // Keep every shelf/outcrop/seam footprint outside every dark bowl opening.
    if (
      !name.startsWith("crater") &&
      depressions.some(
        (d) =>
          Math.hypot(n[0] - d.n[0], n[1] - d.n[1], n[2] - d.n[2]) <
          d.scale * 0.66 + scale * 1.05,
      )
    )
      return;
    jobs.push({
      name,
      id,
      transform: (v) => {
        const x = (v[0] * c - v[1] * s) * scale,
          y = (v[0] * s + v[1] * c) * scale,
          h = 1 + v[2] * scale - burial;
        return [
          n[0] * h + east[0] * x + north[0] * y,
          n[1] * h + east[1] * x + north[1] * y,
          n[2] * h + east[2] * x + north[2] * y,
        ];
      },
    });
  }
  if (diagnostic)
    place(
      "crater-large",
      "crater-diagnostic",
      unit([0.452, 0.388, 0.794]),
      0.32,
      0,
    );
  const anchors: Vec[] = [];
  if (!diagnostic) {
    // Seven unequal major pits give about three visible per hemisphere. Jitter is
    // seed-deterministic and independent of LOD; the largest has quiet surroundings.
    for (let i = 0; i < 7; i++) {
      const y = 1 - (2 * (i + 0.5)) / 7 + (random() - 0.5) * 0.09,
        angle = phase + i * 2.39996323 + (random() - 0.5) * 0.28,
        r = Math.sqrt(1 - y * y),
        n: Vec = [Math.cos(angle) * r, y, Math.sin(angle) * r];
      anchors.push(n);
      place(
        i % 3 === 1 ? "crater-broken" : "crater-large",
        `crater-hero-${i}`,
        n,
        [0.23, 0.17, 0.2, 0.135, 0.185, 0.145, 0.21][i],
        random() * Math.PI * 2,
      );
    }
    for (let i = 0; i < 32; i++) {
      const a = anchors[i % 7],
        offset: Vec = [
          (random() - 0.5) * 0.8,
          (random() - 0.5) * 0.8,
          (random() - 0.5) * 0.8,
        ],
        n = unit([a[0] + offset[0], a[1] + offset[1], a[2] + offset[2]]);
      place(
        "crater-small",
        `crater-companion-${i}`,
        n,
        0.065 + random() * 0.075,
        random() * Math.PI * 2,
      );
    }
    // Three discontinuous crust regions, not a uniform sphere of identical tiles.
    for (let region = 0; region < 6; region++) {
      const a = anchors[(region * 2 + 1) % 7];
      for (let i = 0; i < 12; i++) {
        const n = unit([
          a[0] + (random() - 0.5) * 0.9,
          a[1] + (random() - 0.5) * 0.55,
          a[2] + (random() - 0.5) * 0.9,
        ]);
        place(
          "fractured-shelf",
          `shelf-${region}-${i}`,
          n,
          0.16 + random() * 0.09,
          random() * Math.PI * 2,
          0.003,
        );
      }
      for (let i = 0; i < 2; i++) {
        const n = unit([
          a[0] + (random() - 0.5) * 0.65,
          a[1] + (random() - 0.5) * 0.6,
          a[2] + (random() - 0.5) * 0.65,
        ]);
        place(
          "mineral-seam",
          `mineral-${region}-${i}`,
          n,
          0.16 + random() * 0.08,
          random() * Math.PI * 2,
          0.009,
        );
      }
    }
    // Compute all secondary placements even when omitted, so detail prefix remains
    // bit-identical at the retained levels and never shifts the major formations.
    for (let i = 0; i < 30; i++) {
      const a = anchors[i % 7],
        n = unit([
          a[0] + (random() - 0.5) * 0.7,
          a[1] + (random() - 0.5) * 0.7,
          a[2] + (random() - 0.5) * 0.7,
        ]),
        scale = 0.023 + random() * 0.026,
        angle = random() * Math.PI * 2;
      if (i < [30, 14, 0][lod])
        place("angular-outcrops", `outcrop-${i}`, n, scale, angle, 0.006);
    }
  }
  // Keep the densest existing authored substrate at every level so coarse
  // native triangles cannot bridge and refill retained crater openings. This is
  // 5,120 triangles, comfortably below the total budget, and no decimation.
  const substrate = (v: Vec): Vec => {
    const n = unit(v);
    let depth = 0;
    for (const d of depressions) {
      const distance = Math.hypot(n[0] - d.n[0], n[1] - d.n[1], n[2] - d.n[2]);
      const t = Math.max(0, Math.min(1, (distance / d.scale - 0.52) / 0.55));
      depth = Math.max(depth, d.depth * (1 - t * t * (3 - 2 * t)));
    }
    return [n[0] * (1 - depth), n[1] * (1 - depth), n[2] * (1 - depth)];
  };
  emit("ground-sphere", "ground", substrate, false);
  for (const job of jobs) emit(job.name, job.id, job.transform);
  return batches.map((b) => ({
    ...b,
    positions: Float32Array.from(b.positions),
    normals: Float32Array.from(b.normals),
    indices: Uint32Array.from(b.indices),
  }));
}
