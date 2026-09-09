import { expect, test } from "vitest";
import {
  VoxelVolume,
  meshChunk,
  removeVoxels,
  encodeVoxels,
  decodeVoxels,
} from "./voxels";
test("32 cubed solid chunk becomes six quads with outward winding", () => {
  const v = new VoxelVolume();
  for (let z = 0; z < 32; z++)
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) v.set(x, y, z, 1);
  const faces = meshChunk(v, [...v.chunks.values()][0]);
  expect(faces).toHaveLength(6);
  for (const f of faces) {
    const [a, b, , d] = f.corners;
    const u = b.map((n, i) => n - a[i]),
      w = d.map((n, i) => n - a[i]);
    const cross = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    expect(cross.reduce((s, n, i) => s + n * f.normal[i], 0)).toBeGreaterThan(
      0,
    );
  }
});
test("chunk seams cull buried faces and damage exposes them, including negative coordinates", () => {
  const v = new VoxelVolume();
  v.set(-1, 0, 0, 1);
  v.set(0, 0, 0, 2);
  expect([...v.chunks.values()].flatMap((c) => meshChunk(v, c))).toHaveLength(
    10,
  );
  const change = removeVoxels(v, [
    [0, 0, 0],
    [0, 0, 0],
  ]);
  expect(change.removed).toBe(1);
  expect(change.dirty).toContain("-1,0,0");
  expect([...v.chunks.values()].flatMap((c) => meshChunk(v, c))).toHaveLength(
    6,
  );
});
test("palette boundaries remain distinct and voxel runs roundtrip with strict validation", () => {
  const v = new VoxelVolume();
  v.set(0, 0, 0, 1);
  v.set(1, 0, 0, 2);
  const c = [...v.chunks.values()][0];
  expect(meshChunk(v, c)).toHaveLength(10);
  expect(decodeVoxels(encodeVoxels(c.cells))).toEqual(c.cells);
  expect(() => decodeVoxels([1, 32769])).toThrow();
  expect(() => decodeVoxels([256, 32768])).toThrow();
  expect(() => removeVoxels(v, [[1.2, 0, 0]])).toThrow();
  expect(v.get(1, 0, 0)).toBe(2);
});
