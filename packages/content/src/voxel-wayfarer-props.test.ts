import { expect, test } from "vitest";
import { VoxelVolume } from "../../sim/src/voxels";
import { manufacturedPropVolume } from "./voxel-wayfarer-props";

test("botanical visual refinement leaves occupied source matter and soil intact", () => {
  const source = new VoxelVolume();
  source.set(0, 0, 0, 37);
  source.set(0, 0, 1, 17);
  const visual = manufacturedPropVolume(source);
  expect(visual.get(0, 0, 1)).toBe(0);
  expect(visual.get(0, 0, 0)).toBe(37);
  expect(source.get(0, 0, 1)).toBe(17);
  visual.set(0, 0, 0, 0);
  expect(source.get(0, 0, 0)).toBe(37);
});
