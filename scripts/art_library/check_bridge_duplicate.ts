import { readFileSync, writeFileSync } from "node:fs";
import { VoxelVolume, decodeVoxels } from "../../packages/sim/src/voxels";
import { hullVisualVolume } from "../hull_publication";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const old = read("assets/source/archive/pre-bridge-bed-fix/wayfarer.json"),
  current = read("assets/runtime/assembly/wayfarer.json"),
  hull = read("assets/runtime/assembly/hull-manifest.json");
const ids = new Set([
  "pilot-r004-rear-partition-23",
  "pilot-r004-rear-partition-24",
]);
const placed = new Map(current.parts.map((p: { id: string }) => [p.id, p]));
for (const p of old.parts)
  if (JSON.stringify(placed.get(p.id)) !== JSON.stringify(p))
    throw Error("Placement changed: " + p.id);
for (const id of ids)
  if (
    !hull.entries.some((e: { placements: { id: string }[] }) =>
      e.placements.some((p) => p.id === id),
    )
  )
    throw Error("Tall panel not restored");
if (
  !current.parts.some(
    (p: { id: string }) => p.id === "pilot-r004-airlock-frame-22",
  )
)
  throw Error("Doorway mount missing");
const doc = read("assets/runtime/voxels/wayfarer.voxels.json"),
  source = new VoxelVolume();
for (const c of doc.layers.find(
  (l: { name: string }) => l.name === "partitions",
).chunks)
  source.chunks.set(c.id, { origin: c.origin, cells: decodeVoxels(c.runs) });
const visual = hullVisualVolume("partitions", source);
let retained = 0,
  removed = 0;
for (const c of source.chunks.values())
  for (let i = 0; i < c.cells.length; i++) {
    if (!c.cells[i]) continue;
    const x = c.origin[0] + (i % 32),
      y = c.origin[1] + (Math.floor(i / 32) % 32),
      z = c.origin[2] + Math.floor(i / 1024);
    const duplicate = x >= -56 && x < 56 && y >= 134 && y < 148;
    if (visual.get(x, y, z) !== (y < 144 && !duplicate ? c.cells[i] : 0))
      throw Error("Incorrect duplicate wall filtering");
    if (duplicate) removed++;
    else if (y < 144) retained++;
  }
const report = {
  status: "passed",
  restoredTallPanels: [...ids],
  removedDuplicateCells: removed,
  preservedPlacementRecords: current.parts.length,
  retainedInteriorCells: retained,
  doorwayFrame: "retained",
  authority: "Unchanged; duplicate lower visual wall retired",
};
writeFileSync(
  "docs/releases/bridge-bed-fix/bridge-validation.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
