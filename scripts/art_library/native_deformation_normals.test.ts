import { expect, it } from "vitest";
import { deformedFaceNormals } from "./native_deformation_normals";
import { unit, type Vec } from "./native_reference_assembly";
it("keeps a native continuous cap smooth across triangulation after radial placement", () => {
  const map = (v: Vec) =>
    unit([v[0] * 0.4, v[1] * 0.4, 1]).map((x) => x * (1 + v[2] * 0.4)) as Vec;
  const a: Vec = [-0.8, -0.4, 0.2],
    b: Vec = [0.9, -0.4, 0.2],
    c: Vec = [0.9, 0.7, 0.2],
    d: Vec = [-0.8, 0.7, 0.2];
  const left = deformedFaceNormals([a, b, c], map),
    right = deformedFaceNormals([a, c, d], map);
  for (let k = 0; k < 3; k++) {
    expect(left[0][k]).toBeCloseTo(right[0][k], 6);
    expect(left[2][k]).toBeCloseTo(right[1][k], 6);
    expect(left[0][k]).toBeCloseTo(unit(map(a))[k], 6);
  }
});
it("preserves an authored hard edge under affine placement", () => {
  const identity = (v: Vec) => v,
    top = deformedFaceNormals(
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
      ],
      identity,
    ),
    side = deformedFaceNormals(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
      ],
      identity,
    );
  expect(top[0]).toEqual([0, 0, 1]);
  expect(side[0]).toEqual([0, -1, 0]);
});
