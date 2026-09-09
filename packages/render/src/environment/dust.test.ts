import { describe, expect, it } from "vitest";
import {
  dustMotion,
  dustCell,
  dustLayout,
  dustDepthLayers,
  DUST_COUNT,
} from "./dust";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
describe("velocity-driven voxel dust", () => {
  it("keeps ordinary ship speed as grains and reserves long streaks for high speed", () => {
    expect(dustMotion(27.7, 0, false).streakRatio).toBe(1);
    expect(dustMotion(100, 0, false).streakRatio).toBeLessThanOrEqual(2);
    expect(dustMotion(600, 0, false).warpBlend).toBe(0);
    expect(dustMotion(1500, 0, false).streakRatio).toBeGreaterThan(10);
    expect(dustMotion(3000, 0, false).streakRatio).toBe(48);
    expect(dustMotion(1e12, 0, false).streakRatio).toBe(48);
    expect(dustMotion(30, 40, false).speed).toBe(50);
  });
  it("suppresses long exposure under reduced motion and rejects nonfinite velocity", () => {
    expect(dustMotion(3000, 0, true).streakRatio).toBe(1);
    expect(dustMotion(NaN, Infinity, false).streakRatio).toBe(1);
    expect(dustMotion(NaN, Infinity, false).heading).toBe(0);
  });
  it("aligns world XY velocity with renderer X/-Z", () => {
    expect(dustMotion(0, -10, false).heading).toBe(0);
    expect(dustMotion(10, 0, false).heading).toBe(Math.PI / 2);
  });
});
describe("perspective dust parallax", () => {
  it("projects nearby grains faster than planets and distant dust at both zoom extremes", () => {
    const viewport = new Viewport(0, 0, 1440, 900);
    for (const halfExtent of [18, 55, 650]) {
      const height = halfExtent / Math.tan(0.25);
      const camera = new Vector3(0, height, 0),
        target = Vector3.Zero();
      const layers = dustDepthLayers(camera, target, 0.5, 1.6);
      expect(layers).toHaveLength(3);
      const projection = Matrix.PerspectiveFovRH(0.5, 1.6, 0.1, height * 8);
      const before = Matrix.LookAtRH(
        camera,
        target,
        new Vector3(0, 0, -1),
      ).multiply(projection);
      const after = Matrix.LookAtRH(
        camera.add(new Vector3(4, 0, 0)),
        new Vector3(4, 0, 0),
        new Vector3(0, 0, -1),
      ).multiply(projection);
      const shift = (y: number) => {
        const point = new Vector3(1, y, 0);
        return Math.abs(
          Vector3.Project(point, Matrix.Identity(), after, viewport).x -
            Vector3.Project(point, Matrix.Identity(), before, viewport).x,
        );
      };
      const speeds = layers.map((layer) => shift(layer.height));
      expect(speeds[0]).toBeGreaterThan(speeds[1] * 2);
      expect(speeds[1]).toBeGreaterThan(speeds[2] * 1.5);
      expect(speeds[0]).toBeGreaterThan(shift(-85) * 2);
      expect(layers.map((l) => l.height)).toEqual(
        dustDepthLayers(
          camera.add(new Vector3(100, 0, 30)),
          target.add(new Vector3(100, 0, 30)),
          0.5,
          1.6,
        ).map((l) => l.height),
      );
      const population = layers.reduce(
        (sum, l) =>
          sum + dustLayout(l.halfZ, l.halfX / l.halfZ, DUST_COUNT / 3).count,
        0,
      );
      expect(population).toBeLessThanOrEqual(DUST_COUNT);
      expect(population).toBeGreaterThan(500);
    }
  });
});
describe("bounded viewport-sized anchored dust cells", () => {
  it("preserves full rectangular coverage and visible populations after zoom/resize", () => {
    for (const half of [55, 650])
      for (const aspect of [0.4, 1, 2.77, 4]) {
        const layout = dustLayout(half, aspect);
        expect(layout.count).toBeLessThanOrEqual(DUST_COUNT);
        expect(layout.count).toBe(layout.columns * layout.rows);
        expect(layout.columns * layout.spacing).toBeGreaterThan(
          half * aspect * 2,
        );
        expect(layout.rows * layout.spacing).toBeGreaterThan(half * 2);
        let visible = 0;
        for (let i = 0; i < layout.count; i++) {
          const cell = dustCell(
            i,
            0,
            0,
            layout.spacing,
            layout.columns,
            layout.rows,
          );
          if (Math.abs(cell.x) < half * aspect && Math.abs(cell.y) < half)
            visible++;
        }
        expect(visible).toBeGreaterThan(60);
      }
    expect(Number.isFinite(dustLayout(Infinity, NaN).spacing)).toBe(true);
  });
  it("does not move seeded world cells with fractional translation or a resized grid", () => {
    const first = dustCell(100, 1e12, 2e12, 128),
      second = dustCell(100, 1e12 + 1, 2e12 + 2, 128);
    expect(second.x).toBeCloseTo(first.x - 1, 8);
    expect(second.y).toBeCloseTo(first.y - 2, 8);
    expect(second.height).toBe(first.height);
    expect(second.size).toBe(first.size);
    // Same central world cell remains identical when only viewport column/row counts change.
    const square = dustCell(12 * 24 + 12, 123, 456, 32, 24, 24);
    const wide = dustCell(7 * 40 + 20, 123, 456, 32, 40, 14);
    expect(wide).toEqual(square);
  });
});
