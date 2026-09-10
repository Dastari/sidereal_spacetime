import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { layoutPlaneMatrix } from "./layout-plane-projection";
import { layoutViewOrientation } from "./layout-view-orientation";

describe("explicit editor view orientation", () => {
  it("projects north up and east right in both native and SVG Top views", () => {
    const { alpha, beta } = layoutViewOrientation("3D", "Top")!;
    const eye = new Vector3(
      30 * Math.sin(beta) * Math.cos(alpha),
      30 * Math.cos(beta),
      30 * Math.sin(beta) * Math.sin(alpha),
    );
    const transform = Matrix.LookAtRH(
      eye,
      Vector3.Zero(),
      Vector3.Up(),
    ).multiply(Matrix.PerspectiveFovRH(0.65, 900 / 620, 0.02, 2000));
    const viewport = new Viewport(0, 0, 900, 620);
    const project = (east: number, north: number) =>
      Vector3.Project(
        new Vector3(east, 0, -north),
        Matrix.Identity(),
        transform,
        viewport,
      );
    const center = project(0, 0),
      north = project(0, 2),
      east = project(2, 0);
    expect(north.y).toBeLessThan(center.y);
    expect(east.x).toBeGreaterThan(center.x);
    const css = layoutPlaneMatrix(transform.m, [0, 0, 0], 0, 900, 620);
    const svg = (x: number, y: number) => {
      const w = css[3] * x + css[7] * y + css[15];
      return [
        (css[0] * x + css[4] * y + css[12]) / w,
        (css[1] * x + css[5] * y + css[13]) / w,
      ];
    };
    expect(svg(0, -64)[1]).toBeCloseTo(north.y, 3);
    expect(svg(64, 0)[0]).toBeCloseTo(east.x, 3);
  });
  it("preserves manually orbited cameras across document updates in every named view", () => {
    for (const view of ["Top", "Side", "Front", "3D"])
      expect(layoutViewOrientation(view, view)).toBeUndefined();
  });
  it("restores north-up only when explicitly switching back to Top", () => {
    expect(layoutViewOrientation("Top", "3D")).toEqual({
      alpha: Math.PI / 10,
      beta: Math.PI / 4,
    });
    expect(layoutViewOrientation("3D", "Top")).toEqual({
      alpha: Math.PI / 2,
      beta: 0.03,
    });
    expect(layoutViewOrientation("Top", "unknown")).toBeUndefined();
  });
});
