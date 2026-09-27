import {hullVisualVolume} from './hull_publication';
const retiredVisualLayers = new Set<string>(JSON.parse(readFileSync('assets/runtime/assembly/equipment-manifest.json','utf8')).entries.flatMap((e:{placements:{id:string}[]})=>e.placements.map(p=>p.id)));
import { refineBotanicalSurface, hydroponicSurfaceOrigin, manufacturedPropVolume } from "../packages/content/src/voxel-wayfarer-props";
import { resolveVoxelOwnership } from "../packages/content/src/voxel-ownership";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import {
  createVoxelWayfarer,
  VOXEL_METERS,
  VOXEL_PALETTE,
} from "../packages/content/src/voxel-wayfarer";
import {
  meshChunk,
  encodeVoxels,
  VoxelVolume,
} from "../packages/sim/src/voxels";
const interiorProps = JSON.parse(readFileSync("assets/runtime/voxels/interior-props.voxels.json", "utf8"));
const layers = createVoxelWayfarer(interiorProps);
// Blender-authored closed solids are integrated as matter, not separate skin meshes.
const fixture = JSON.parse(
  readFileSync("assets/runtime/voxels/ship-wall-fixture.voxels.json", "utf8"),
);
if (fixture.cellMeters !== VOXEL_METERS)
  throw new Error("Ship fixture sample pitch mismatch");
for (const side of [-1, 1])
  for (const roomY of [-6, -1.5, 3])
    for (const dy of [-1.125, 1.125]) {
      const volume = layers.get(
        side < 0 ? "cutaway-port" : "cutaway-starboard",
      )!;
      for (const [x, y, z, material] of fixture.cells as number[][]) {
        const paletteId = fixture.palette[material].voxelMaterialId;
        if (
          !Number.isInteger(paletteId) ||
          paletteId <= 0 ||
          paletteId >= VOXEL_PALETTE.length
        )
          throw new Error("Unknown sampled fixture material");
        // Reflect cell intervals, not just their lower coordinate, on starboard.
        const i = side < 0 ? x : -x - 1;
        volume.set(
          i + Math.round((side * 4.625) / VOXEL_METERS),
          y + Math.round((roomY + dy) / VOXEL_METERS),
          z + 34,
          paletteId,
        );
      }
    }
const removedDuplicateCells = resolveVoxelOwnership(layers);
const source: any = {
  schema: "sidereal.voxel-study.v1",
  cellMeters: VOXEL_METERS,
  chunkSize: 32,
  axes: "X east, Y north, Z up",
  palette: VOXEL_PALETTE,
  layers: [],
};
const meshes: any[] = [];
let occupied = 0,
  chunks = 0,
  quads = 0;
for (const [name, volume] of layers) {
  const output: any = { name, chunks: [] };
  const meshingVolume = hullVisualVolume(name, hydroponicSurfaceOrigin(name, VOXEL_METERS) ? manufacturedPropVolume(volume) : volume);
  const vertices: number[][] = [],
    faces: number[][] = [],
    materials: number[] = [];
  for (const [id, chunk] of volume.chunks) {
    chunks++;
    for (const cell of chunk.cells) if (cell) occupied++;
    output.chunks.push({
      id,
      origin: chunk.origin,
      runs: encodeVoxels(chunk.cells),
    });
    if (!retiredVisualLayers.has(name) && meshingVolume.chunks.has(id)) for (const face of meshChunk(meshingVolume, meshingVolume.chunks.get(id)!)) {
      const start = vertices.length;
      vertices.push(...face.corners.map(p=>p.map(n=>n*VOXEL_METERS)));
      faces.push([start, start + 1, start + 2, start + 3]);
      materials.push(face.material);
      quads++;
    }
  }
  source.layers.push(output);
  if (retiredVisualLayers.has(name)) continue;
  const visualMesh = { name, vertices, faces, materials };
  const botanicalOrigin = hydroponicSurfaceOrigin(name, VOXEL_METERS);
  if (botanicalOrigin) refineBotanicalSurface(visualMesh, interiorProps.hydroponics, botanicalOrigin);
  meshes.push(visualMesh);
}
mkdirSync("assets/runtime/voxels", { recursive: true });
mkdirSync(".runtime/art", { recursive: true });
writeFileSync(
  "assets/runtime/voxels/wayfarer.voxels.json",
  JSON.stringify(source),
);
writeFileSync(
  ".runtime/art/voxel-meshes.json",
  JSON.stringify({ palette: VOXEL_PALETTE, meshes }),
);
writeFileSync(
  "assets/runtime/voxels/metrics.json",
  JSON.stringify(
    {
      removedDuplicateCells,
      occupied,
      chunks,
      quads,
      triangles: quads * 2,
      batches: meshes.length,
      cellMeters: VOXEL_METERS,
      naiveCubeTriangles: occupied * 12,
    },
    null,
    2,
  ) + "\n",
);
console.log({ occupied, chunks, quads, batches: meshes.length });

// A reusable decorative asteroid, sampled into the same voxel representation.
const asteroid = new VoxelVolume();
for (let z = -15; z < 16; z++)
  for (let y = -15; y < 16; y++)
    for (let x = -15; x < 16; x++) {
      const radius =
        12 +
        1.8 * Math.sin(x * 0.45) +
        1.4 * Math.cos(y * 0.6) * Math.sin(z * 0.5);
      const crater = Math.hypot(x - 9, y + 6, z - 6) < 5;
      if (Math.hypot(x * 0.9, y, z * 0.85) < radius && !crater) {
        const patch =
          Math.sin(x * 0.6 + y * 0.25) + Math.cos(z * 0.8 - x * 0.2);
        asteroid.set(x, y, z, patch > 1 ? 14 : patch < -0.6 ? 13 : 20);
      }
    }
const vertices: number[][] = [],
  faces: number[][] = [],
  materials: number[] = [];
for (const chunk of asteroid.chunks.values())
  for (const face of meshChunk(asteroid, chunk)) {
    const start = vertices.length;
    vertices.push(...face.corners.map((p) => p.map((n) => n * 0.125)));
    faces.push([start, start + 1, start + 2, start + 3]);
    materials.push(face.material);
  }
writeFileSync(
  ".runtime/art/asteroid-mesh.json",
  JSON.stringify({ name: "asteroid", vertices, faces, materials }),
);
