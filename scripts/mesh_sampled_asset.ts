import { readFileSync, writeFileSync } from "node:fs";
import {
  VoxelVolume,
  meshChunk,
  encodeVoxels,
} from "../packages/sim/src/voxels";
const slug = process.argv[2] ?? "engine-pod";
if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid asset name");
const source = JSON.parse(
  readFileSync(`.runtime/art/${slug}-samples.json`, "utf8"),
);
const volume = new VoxelVolume();
for (const [x, y, z, material] of source.cells) volume.set(x, y, z, material);
const vertices: number[][] = [],
  faces: number[][] = [],
  materials: number[] = [];
const chunks = [];
for (const [id, chunk] of volume.chunks) {
  chunks.push({ id, origin: chunk.origin, runs: encodeVoxels(chunk.cells) });
  for (const face of meshChunk(volume, chunk)) {
    const start = vertices.length;
    vertices.push(
      ...face.corners.map((p) => p.map((n) => n * source.cellMeters)),
    );
    faces.push([start, start + 1, start + 2, start + 3]);
    materials.push(face.material);
  }
}
writeFileSync(
  `.runtime/art/${slug}-mesh.json`,
  JSON.stringify({
    palette: source.palette,
    vertices,
    faces,
    materials,
    cellMeters: source.cellMeters,
  }),
);
const { cells, ...metadata } = source;
writeFileSync(
  `assets/runtime/voxels/${slug}.voxels.json`,
  JSON.stringify({ ...metadata, chunkSize: 32, chunks }),
);
writeFileSync(
  `assets/runtime/voxels/${slug}-metrics.json`,
  JSON.stringify(
    {
      occupied: cells.length,
      triangles: faces.length * 2,
      chunks: chunks.length,
      materials: source.palette.length - 1,
      emissiveVoxels: cells.filter(
        (p: number[]) => source.palette[p[3]].emissionStrength > 0,
      ).length,
    },
    null,
    2,
  ) + "\n",
);
console.log({ engineVoxels: cells.length, engineTriangles: faces.length * 2 });
