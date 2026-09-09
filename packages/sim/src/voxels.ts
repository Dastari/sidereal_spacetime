/** Integer, ship-local voxel data. Zero is empty; material IDs are 1..255.
 * GPU meshes are derived artifacts, never the authoritative damage representation. */
export const CHUNK_SIZE = 32;
export type Cell = readonly [number, number, number]; // east, north, height
export type VoxelChunk = { origin: Cell; cells: Uint8Array };
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const index = (x: number, y: number, z: number) =>
  x + CHUNK_SIZE * (y + CHUNK_SIZE * z);
export class VoxelVolume {
  readonly chunks = new Map<string, VoxelChunk>();
  get(x: number, y: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE),
      cy = Math.floor(y / CHUNK_SIZE),
      cz = Math.floor(z / CHUNK_SIZE);
    return (
      this.chunks.get(key(cx, cy, cz))?.cells[
        index(x - cx * CHUNK_SIZE, y - cy * CHUNK_SIZE, z - cz * CHUNK_SIZE)
      ] ?? 0
    );
  }
  set(x: number, y: number, z: number, material: number): void {
    if (
      ![x, y, z, material].every(Number.isSafeInteger) ||
      material < 0 ||
      material > 255
    )
      throw new Error("Invalid voxel");
    const cx = Math.floor(x / CHUNK_SIZE),
      cy = Math.floor(y / CHUNK_SIZE),
      cz = Math.floor(z / CHUNK_SIZE),
      id = key(cx, cy, cz);
    let chunk = this.chunks.get(id);
    if (!chunk) {
      if (!material) return;
      chunk = {
        origin: [cx * CHUNK_SIZE, cy * CHUNK_SIZE, cz * CHUNK_SIZE],
        cells: new Uint8Array(CHUNK_SIZE ** 3),
      };
      this.chunks.set(id, chunk);
    }
    chunk.cells[
      index(x - cx * CHUNK_SIZE, y - cy * CHUNK_SIZE, z - cz * CHUNK_SIZE)
    ] = material;
  }
}
export type VoxelQuad = {
  corners: [number[], number[], number[], number[]];
  normal: number[];
  material: number;
};
/** Cull buried faces (including adjacent chunks), merge coplanar equal-material rectangles. */
export function meshChunk(volume: VoxelVolume, chunk: VoxelChunk): VoxelQuad[] {
  const result: VoxelQuad[] = [];
  const n = CHUNK_SIZE;
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3;
      for (let slice = 0; slice < n; slice++) {
        const mask = new Uint8Array(n * n);
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n; i++) {
            const p = [...chunk.origin];
            p[axis] += slice;
            p[u] += i;
            p[v] += j;
            const local = p.map((value, a) => value - chunk.origin[a]);
            const material = chunk.cells[index(local[0], local[1], local[2])];
            if (!material) continue;
            p[axis] += sign;
            local[axis] += sign;
            const neighbor =
              local[axis] >= 0 && local[axis] < n
                ? chunk.cells[index(local[0], local[1], local[2])]
                : volume.get(p[0], p[1], p[2]);
            if (!neighbor) mask[i + j * n] = material;
          }
        for (let j = 0; j < n; j++)
          for (let i = 0; i < n;) {
            const material = mask[i + j * n];
            if (!material) {
              i++;
              continue;
            }
            let width = 1;
            while (i + width < n && mask[i + width + j * n] === material)
              width++;
            let height = 1;
            rows: while (j + height < n) {
              for (let a = 0; a < width; a++)
                if (mask[i + a + (j + height) * n] !== material) break rows;
              height++;
            }
            const p = [...chunk.origin];
            p[axis] += slice + (sign > 0 ? 1 : 0);
            p[u] += i;
            p[v] += j;
            const a = [...p],
              b = [...p],
              c = [...p],
              d = [...p];
            b[u] += width;
            c[u] += width;
            c[v] += height;
            d[v] += height;
            const normal = [0, 0, 0];
            normal[axis] = sign;
            result.push({
              corners: sign > 0 ? [a, b, c, d] : [a, d, c, b],
              normal,
              material,
            });
            for (let b = 0; b < height; b++)
              for (let a = 0; a < width; a++) mask[i + a + (j + b) * n] = 0;
            i += width;
          }
      }
    }
  return result;
}
/** Bounded local edit foundation. Caller owns permission, revision and persistence checks.
 * Returns neighboring chunk keys too, so removal exposes the correct boundary faces. */
export function removeVoxels(
  volume: VoxelVolume,
  cells: readonly Cell[],
): { removed: number; dirty: string[] } {
  if (cells.length > 4096) throw new Error("Voxel edit exceeds budget");
  if (cells.some((p) => p.length !== 3 || !p.every(Number.isSafeInteger)))
    throw new Error("Invalid voxel edit");
  const dirty = new Set<string>();
  let removed = 0;
  for (const [x, y, z] of cells) {
    if (!volume.get(x, y, z)) continue;
    volume.set(x, y, z, 0);
    removed++;
    for (const [a, b, c] of [
      [x, y, z],
      [x - 1, y, z],
      [x + 1, y, z],
      [x, y - 1, z],
      [x, y + 1, z],
      [x, y, z - 1],
      [x, y, z + 1],
    ])
      dirty.add(
        key(Math.floor(a / 32), Math.floor(b / 32), Math.floor(c / 32)),
      );
  }
  return { removed, dirty: [...dirty].sort() };
}
export function encodeVoxels(cells: Uint8Array): number[] {
  const runs: number[] = [];
  for (let i = 0; i < cells.length;) {
    const value = cells[i];
    let end = i + 1;
    while (end < cells.length && cells[end] === value) end++;
    runs.push(value, end - i);
    i = end;
  }
  return runs;
}
export function decodeVoxels(runs: readonly number[]): Uint8Array {
  if (runs.length % 2 || runs.length > CHUNK_SIZE ** 3 * 2)
    throw new Error("Invalid voxel runs");
  const cells = new Uint8Array(CHUNK_SIZE ** 3);
  let offset = 0;
  for (let i = 0; i < runs.length; i += 2) {
    const value = runs[i],
      count = runs[i + 1];
    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 255 ||
      !Number.isInteger(count) ||
      count < 1 ||
      offset + count > cells.length
    )
      throw new Error("Invalid voxel run");
    cells.fill(value, offset, offset + count);
    offset += count;
  }
  if (offset !== cells.length) throw new Error("Incomplete voxel chunk");
  return cells;
}
