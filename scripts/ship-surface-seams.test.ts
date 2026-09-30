import { expect, it } from "vitest";
import {
  VoxelVolume,
  meshChunk,
  removeVoxels,
} from "../packages/sim/src/voxels";
import { latticeFaceUvs } from "../packages/render/src/prefab-ship/surface-coordinates";

it("keeps joined chunk map phase through synthetic damage and repair despite greedy repartition", () => {
  const volume = new VoxelVolume();
  for (let x = -3; x <= 35; x++)
    for (let y = 0; y < 2; y++) volume.set(x, y, 0, 1);
  const top = () =>
    [...volume.chunks.values()]
      .flatMap((chunk) => meshChunk(volume, chunk))
      .filter((face) => face.normal[2] === 1);
  const original = top();
  for (const face of original) {
    const mapped = latticeFaceUvs(face.corners, face.normal);
    face.corners.forEach((p, i) =>
      expect([mapped[i * 2], mapped[i * 2 + 1]]).toEqual([
        p[0] / 16,
        p[1] / 16,
      ]),
    );
  }
  const removed = removeVoxels(volume, [
    [31, 0, 0],
    [32, 0, 0],
  ]);
  expect(removed.dirty).toContain("0,0,0");
  expect(removed.dirty).toContain("1,0,0");
  expect(top()).not.toEqual(original);
  for (const face of top()) {
    const mapped = latticeFaceUvs(face.corners, face.normal);
    face.corners.forEach((p, i) => expect(mapped[i * 2]).toBe(p[0] / 16));
  }
  volume.set(31, 0, 0, 1);
  volume.set(32, 0, 0, 1);
  expect(top()).toEqual(original);
});
