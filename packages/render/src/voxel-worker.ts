import {
  VoxelVolume,
  decodeVoxels,
  meshChunk,
  removeVoxels,
  type Cell,
} from "../../sim/src/voxels";
type Layer = {
  layer: string;
  chunks: { id: string; origin: Cell; runs: number[] }[];
};
/** Bounded part preview remeshing is off the render thread. Asset data are
 * immutable; edits belong to a placement. Revisions reject late worker results.
 * All chunks of the changed part are returned so skipping an old job is safe.
 */
self.onmessage = (
  event: MessageEvent<{
    id: string;
    revision: number;
    source: { cellMeters: number; layers: Layer[] };
    removed: Cell[];
    palette: string[];
  }>,
) => {
  const { id, revision, source, removed, palette } = event.data;
  try {
    const result = [];
    for (const layer of source.layers) {
      const volume = new VoxelVolume();
      for (const chunk of layer.chunks)
        volume.chunks.set(chunk.id, {
          origin: chunk.origin,
          cells: decodeVoxels(chunk.runs),
        });
      for (let i = 0; i < removed.length; i += 4096)
        removeVoxels(volume, removed.slice(i, i + 4096));
      for (const [key, chunk] of volume.chunks) {
        const buckets = new Map<
          string,
          {
            key: string;
            surface: string;
            positions: number[];
            normals: number[];
            colors: number[];
            indices: number[];
          }
        >();
        for (const face of meshChunk(volume, chunk)) {
          const surface =
            face.material === 7
              ? "emitter"
              : [17, 18, 23, 24].includes(face.material)
                ? "soft"
                : [3, 9, 10, 25, 26, 27, 30].includes(face.material)
                  ? "steel"
                  : "paint";
          let bucket = buckets.get(surface);
          if (!bucket) {
            bucket = {
              key: layer.layer + ":" + key + ":" + surface,
              surface,
              positions: [],
              normals: [],
              colors: [],
              indices: [],
            };
            buckets.set(surface, bucket);
          }
          const { positions, normals, colors, indices } = bucket,
            start = positions.length / 3,
            color = palette[face.material];
          const rgb = [1, 3, 5].map((i) => {
            const v = parseInt(color.slice(i, i + 2), 16) / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
          for (const [x, y, z] of face.corners) {
            positions.push(
              x * source.cellMeters,
              z * source.cellMeters,
              -y * source.cellMeters,
            );
            normals.push(face.normal[0], face.normal[2], -face.normal[1]);
            colors.push(...rgb, 1);
          }
          indices.push(
            start,
            start + 1,
            start + 2,
            start,
            start + 2,
            start + 3,
          );
        }
        result.push(...buckets.values());
      }
    }
    self.postMessage({ id, revision, result });
  } catch (error) {
    self.postMessage({ id, revision, error: String(error) });
  }
};
