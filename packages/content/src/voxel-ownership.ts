import { VoxelVolume } from "../../sim/src/voxels";
/** Resolve authored overlapping solids once, before export/segmentation. Object
 * identities remain distinct. Shared boundaries touch; cells have one owner.
 * Props keep their silhouette, deck keeps its continuous support, removable
 * roofs yield to permanent walls. This is visual content, not collision state. */
export function resolveVoxelOwnership(layers: Map<string, VoxelVolume>) {
  const priority = (name: string) =>
    name.startsWith("equipment") || name.startsWith("room-") || name.startsWith("drives") ? 0 :
    name === "markings" ? 1 : name === "deck" ? 2 : name === "walls" ? 3 :
    name === "partitions" ? 4 : name.startsWith("cutaway") ? 5 : name === "armor" ? 6 : 7;
  const occupied = new VoxelVolume();
  let removed = 0;
  for (const [name, volume] of [...layers].sort(([a], [b]) => priority(a) - priority(b) || a.localeCompare(b))) {
    for (const [key, chunk] of volume.chunks) {
      let count = 0;
      for (let i = 0; i < chunk.cells.length; i++) {
        if (!chunk.cells[i]) continue;
        const x = chunk.origin[0] + i % 32;
        const y = chunk.origin[1] + Math.floor(i / 32) % 32;
        const z = chunk.origin[2] + Math.floor(i / 1024);
        if (occupied.get(x, y, z)) { chunk.cells[i] = 0; removed++; }
        else { occupied.set(x, y, z, 1); count++; }
      }
      if (!count) volume.chunks.delete(key);
    }
  }
  return removed;
}
