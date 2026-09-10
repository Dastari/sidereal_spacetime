import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { layoutPlaneMatrix } from "./layout-plane-projection";

describe("shared camera floorplan projection", () => {
  for (const eye of [
    new Vector3(12, 18, -22),
    new Vector3(-21, 14, 8),
    new Vector3(0, 35, -0.1),
  ]) {
    it(`matches native mesh projection at camera ${eye.asArray()}`, () => {
      const width = 900,
        height = 620,
        origin = [100, 3, -70],
        elevation = 3.1875;
      const camera = Matrix.LookAtRH(eye, Vector3.Zero(), Vector3.Up());
      const projection = Matrix.PerspectiveFovRH(
        0.65,
        width / height,
        0.02,
        2000,
      );
      const transform = camera.multiply(projection);
      const css = layoutPlaneMatrix(
        transform.m,
        origin,
        elevation,
        width,
        height,
      );
      for (const [east, north] of [
        [99, 70],
        [101, 72],
        [97, 69],
        [104, 66],
      ]) {
        const x = east * 32,
          y = -north * 32;
        const w = css[3] * x + css[7] * y + css[15];
        const actual = [
          (css[0] * x + css[4] * y + css[12]) / w,
          (css[1] * x + css[5] * y + css[13]) / w,
        ];
        const native = Vector3.Project(
          new Vector3(
            east - origin[0],
            elevation - origin[1],
            -north - origin[2],
          ),
          Matrix.Identity(),
          transform,
          new Viewport(0, 0, width, height),
        );
        // Babylon composes Float32 matrices; tolerate less than one thousandth pixel.
        expect(actual[0]).toBeCloseTo(native.x, 3);
        expect(actual[1]).toBeCloseTo(native.y, 3);
      }
    });
  }
});
