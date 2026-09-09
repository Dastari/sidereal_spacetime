import { describe, expect, it } from "vitest";
import {
  MAX_SPACE_COORDINATE_METERS,
  neighboringSpatialCells,
  spatialCell,
  withinSpaceDiscovery,
} from "./spatial-cells";
describe("authoritative spatial cells", () => {
  it("floors negative coordinates and handles exact boundaries", () => {
    expect(spatialCell({ x: -0.001, y: -400 })).toEqual({
      cellX: -1,
      cellY: -1,
    });
    expect(spatialCell({ x: -400.001, y: 400 })).toEqual({
      cellX: -2,
      cellY: 1,
    });
    expect(spatialCell({ x: -0, y: 0 })).toEqual({ cellX: 0, cellY: 0 });
  });
  it("returns nine unique ordered cells convertible to i64", () => {
    const cells = neighboringSpatialCells({ cellX: -1, cellY: -2 });
    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ cellX: -2, cellY: -3 });
    expect(cells[8]).toEqual({ cellX: 0, cellY: -1 });
    expect(
      new Set(cells.map((c) => `${BigInt(c.cellX)}:${BigInt(c.cellY)}`)).size,
    ).toBe(9);
  });
  it("includes the distance boundary but rejects a diagonal neighboring contact outside range", () => {
    expect(withinSpaceDiscovery({ x: -200, y: 0 }, { x: 200, y: 0 })).toBe(
      true,
    );
    expect(withinSpaceDiscovery({ x: -200, y: 0 }, { x: 200.001, y: 0 })).toBe(
      false,
    );
    expect(withinSpaceDiscovery({ x: 0, y: 0 }, { x: 399, y: 399 })).toBe(
      false,
    );
  });
  it("nine cells contain every discovered point across negative and positive seams", () => {
    for (const x of [-800, -400.001, -400, -0.001, 0, 399.999, 400]) {
      const observer = { x, y: x + 37 };
      const cells = neighboringSpatialCells(spatialCell(observer));
      for (let angle = 0; angle < 360; angle += 5) {
        const target = {
          x: x + 399.999 * Math.cos((angle * Math.PI) / 180),
          y: observer.y + 399.999 * Math.sin((angle * Math.PI) / 180),
        };
        expect(withinSpaceDiscovery(observer, target)).toBe(true);
        expect(cells).toContainEqual(spatialCell(target));
      }
    }
  });
  it("rejects nonfinite, unsafe and out-of-domain coordinates before database conversion", () => {
    for (const x of [NaN, Infinity, MAX_SPACE_COORDINATE_METERS + 1])
      expect(() => spatialCell({ x, y: 0 })).toThrow();
    expect(() => neighboringSpatialCells({ cellX: 0.5, cellY: 0 })).toThrow();
    expect(() => spatialCell({ x: 0, y: 0 }, 0)).toThrow();
    expect(() =>
      withinSpaceDiscovery({ x: 0, y: 0 }, { x: 0, y: 0 }, 401),
    ).toThrow();
    expect(() =>
      withinSpaceDiscovery({ x: 0, y: 0 }, { x: NaN, y: 0 }),
    ).toThrow();
    expect(
      spatialCell({
        x: MAX_SPACE_COORDINATE_METERS,
        y: -MAX_SPACE_COORDINATE_METERS,
      }),
    ).toEqual({ cellX: 2500000, cellY: -2500000 });
  });
});
