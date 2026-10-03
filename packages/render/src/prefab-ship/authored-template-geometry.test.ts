import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  clipAuthoredGeometry,
  prefabClipPlanes,
} from "./authored-template-geometry";
const triangle = {
  positions: [-1, 0, 0, 1, 0, 0, 1, 0, 1],
  normals: [0, -1, 0, 0, -1, 0, 0, -1, 0],
  indices: [0, 1, 2],
  uvs: [0, 0, 1, 0, 1, 1],
  uvs2: [0, 0, 2, 0, 2, 2],
  tangents: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1],
};
describe("native template clipping", () => {
  it("interpolates both UV charts and the normal-map frame at a real cut", () => {
    const result = clipAuthoredGeometry(triangle, Matrix.Identity(), [
      [1, 0, 0, 0],
    ]);
    expect(result.indices.length).toBe(6);
    for (let i = 0; i < result.positions.length / 3; i++) {
      const x = result.positions[i * 3];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(result.uvs![i * 2]).toBeCloseTo((x + 1) / 2);
      expect(result.uvs2![i * 2]).toBeCloseTo(x + 1);
      expect(Math.hypot(...result.normals.slice(i * 3, i * 3 + 3))).toBeCloseTo(
        1,
      );
      expect(result.tangents![i * 4 + 3]).toBe(1);
    }
  });
  it("keeps mirrored front faces and tangent handedness consistent", () => {
    const result = clipAuthoredGeometry(triangle, Matrix.Scaling(-1, 1, 1), []);
    const p = (i: number) => Vector3.FromArray(result.positions, i * 3);
    const n = Vector3.Cross(
      p(1).subtract(p(0)),
      p(2).subtract(p(0)),
    ).normalize();
    expect(Vector3.Dot(n, Vector3.FromArray(result.normals))).toBeCloseTo(1);
    expect(result.tangents!.filter((_, i) => i % 4 === 3)).toEqual([
      -1, -1, -1,
    ]);
  });
  it("removes rejected triangles and rejects nonfinite or zero-normal planes", () => {
    expect(
      clipAuthoredGeometry(triangle, Matrix.Identity(), [[1, 0, 0, -2]])
        .indices,
    ).toEqual([]);
    expect(() =>
      clipAuthoredGeometry(triangle, Matrix.Identity(), [[0, 0, 0, 1]]),
    ).toThrow();
    expect(() =>
      clipAuthoredGeometry(triangle, Matrix.Identity(), [[NaN, 1, 0, 0]]),
    ).toThrow();
  });
  it("converts author halfspaces with the actual ship origin", () => {
    const plane = prefabClipPlanes([[1, 2, 3, 4]], [7, -5])[0];
    const author = [9, 2, 3],
      render = [-(author[1] + 5), author[2], -(author[0] - 7)];
    expect(
      plane[0] * render[0] +
        plane[1] * render[1] +
        plane[2] * render[2] +
        plane[3],
    ).toBeCloseTo(1 * 9 + 2 * 2 + 3 * 3 + 4);
  });
  it("warps normalized wall height while correcting its surface normals", () => {
    const source = {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    };
    const result = clipAuthoredGeometry(source, Matrix.Identity(), [], {
      bottom: [0, 0, 0.5],
      top: [0.1, 0.2, 2.5],
    });
    expect(result.positions[1]).toBeCloseTo(0.5);
    expect(result.positions[7]).toBeCloseTo(2.5);
    const a = Vector3.FromArray(result.positions, 3).subtract(
        Vector3.FromArray(result.positions),
      ),
      b = Vector3.FromArray(result.positions, 6).subtract(
        Vector3.FromArray(result.positions),
      );
    const face = Vector3.Cross(a, b).normalize();
    expect(Vector3.Dot(face, Vector3.FromArray(result.normals, 6))).toBeCloseTo(
      1,
    );
  });
});
