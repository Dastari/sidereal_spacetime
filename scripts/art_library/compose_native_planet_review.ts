import fs from "node:fs";
import path from "node:path";
import {
  composeNativePlanet,
  nativeFeatureDistribution,
  type NativePlanetKit,
} from "../../packages/render/src/environment/native-planet-composition";
const root = path.resolve(
  process.argv[2] ?? ".runtime/art-library/planets/ice-r004",
);
const kit = JSON.parse(
  fs.readFileSync(path.join(root, "kit.json"), "utf8"),
) as NativePlanetKit;
for (const seed of process.argv[4] ? process.argv[4].split(",").map(Number) : [131, 9187]) {
  const out = composeNativePlanet(
    kit,
    seed,
    Number(process.argv[3] ?? 0.42),
    0.65,
  );
  fs.writeFileSync(
    path.join(root, `composed-${seed}.json`),
    JSON.stringify({ ...out, materials: kit.materials }),
  );
  const radii = out.batches.flatMap((batch) => {
    const values: number[] = [];
    for (let i = 0; i < batch.positions.length; i += 3)
      values.push(Math.hypot(...batch.positions.slice(i, i + 3)));
    return values;
  }).sort((a, b) => a - b);
  const materialAreas = out.batches.map((batch, index) => {
    let area = 0;
    for (let i = 0; i < batch.indices.length; i += 3) {
      const points = batch.indices.slice(i, i + 3).map((v) => batch.positions.slice(v * 3, v * 3 + 3));
      const a = points[1].map((v, j) => v - points[0][j]);
      const b = points[2].map((v, j) => v - points[0][j]);
      area += Math.hypot(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]) / 2;
    }
    return { role: kit.materials[index].name, triangles: batch.indices.length / 3, area };
  });
  const totalArea = materialAreas.reduce((sum, material) => sum + material.area, 0);
  fs.writeFileSync(path.join(root, `composed-${seed}-audit.json`), JSON.stringify({
    seed, triangles: out.triangles, triangleBudget: 150000,
    batches: out.batches.length,
    radialBounds: [radii[0], radii[radii.length - 1]],
    radialQuantiles: [.05, .25, .5, .75, .95].map((q) => ({ q, radius: radii[Math.floor((radii.length - 1) * q)] })),
    materialAreas: materialAreas.map((material) => ({ ...material, fraction: material.area / totalArea })),
    macroDistribution: out.tiles.length === 24 ? nativeFeatureDistribution(out.tiles) : {nativeClusterCount: out.tiles.length, iceClusterFraction: out.tiles.filter(v => v >= 3).length / out.tiles.length},
    limitation: "Geometry area includes occluded faces; vertex radial quantiles are tessellation-weighted. Neither metric establishes visible material coverage or image fidelity. Root must review actual rendered PNGs.",
  }, null, 2) + "\n");
  console.log(seed, out.triangles, "native placements", out.tiles.length);
}
