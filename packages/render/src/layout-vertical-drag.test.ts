import { describe, expect, it } from "vitest";
import {
  verticalDragMetresPerPixel,
  verticalDragPosition,
} from "./layout-vertical-drag";

describe("component height gestures", () => {
  it("raises and lowers on the snap grid without shifting fractional horizontal mounts", () => {
    const position = [1.1875, -3.34375, 0.1875] as const;
    expect(verticalDragPosition(position, -65, 0.01, 0.25)).toEqual([
      1.1875, -3.34375, 0.9375,
    ]);
    expect(verticalDragPosition(position, 65, 0.01, 0.25)).toEqual([
      1.1875, -3.34375, -0.5625,
    ]);
    expect(position).toEqual([1.1875, -3.34375, 0.1875]);
  });
  it("does not jump an existing floor datum at the start or accumulate preview rounding", () => {
    const position = [2, 4, 0.1875] as const;
    expect(verticalDragPosition(position, 0, 0.01, 1)).toEqual(position);
    for (const y of [-10, -20, -50, -80, 10])
      verticalDragPosition(position, y, 0.01, 1);
    expect(verticalDragPosition(position, 0, 0.01, 1)).toEqual(position);
    expect(verticalDragPosition(position, -100, 0.01, 1)).toEqual([
      2, 4, 1.1875,
    ]);
  });
  it("uses view scale for stable orthographic and perspective sensitivity", () => {
    const scale = verticalDragMetresPerPixel(800, 10, Math.PI / 2);
    expect(scale).toBeCloseTo(0.025);
    expect(verticalDragPosition([0, 0, 0], -40, scale, 1 / 32)[2]).toBe(1);
    expect(verticalDragMetresPerPixel(1600, 20, Math.PI / 2)).toBeCloseTo(
      scale,
    );
  });
  it("rejects non-finite geometry and invalid grids before applying a preview", () => {
    expect(() => verticalDragPosition([0, 0, NaN], 1, 1, 1)).toThrow();
    expect(() => verticalDragPosition([0, 0, 0], 1, 1, 0)).toThrow();
    expect(() => verticalDragMetresPerPixel(0, 10, 1)).toThrow();
  });
});
