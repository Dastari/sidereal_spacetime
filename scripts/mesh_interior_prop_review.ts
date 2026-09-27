import { readFileSync, writeFileSync } from "node:fs";
import {
  VoxelVolume,
  meshChunk,
} from "../packages/sim/src/voxels";
const slug = process.argv[2] ?? "interior-hydroponics";
if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("Invalid asset name");
const source = JSON.parse(
  readFileSync(`.runtime/art/${slug}-samples.json`, "utf8"),
);
const volume = new VoxelVolume();
for (const [x, y, z, material] of source.cells) volume.set(x, y, z, material);
const vertices: number[][] = [],
  faces: number[][] = [],
  materials: number[] = [];
const meshingVolume = slug === "interior-hydroponics" && source.visualSurface ? new VoxelVolume() : volume;
if (meshingVolume !== volume) for (const [id,c] of volume.chunks) {
  const cells=c.cells.slice();
  for(let i=0;i<cells.length;i++) if (cells[i] && [17,18,36,38].includes(source.palette[cells[i]].voxelMaterialId)) cells[i]=0;
  meshingVolume.chunks.set(id,{origin:c.origin,cells});
}
for (const [id, chunk] of volume.chunks) {
  for (const face of meshChunk(meshingVolume, meshingVolume.chunks.get(id)!)) {
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
console.log({ propOccupiedSamples: source.cells.length, manufacturedTriangles: faces.length * 2 });
