import { describe, expect, it } from "vitest";
import {
  projectContextPoint,
  projectContextPolygon,
  projectContextSegment,
} from "./context-overlay-projection";

const top = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 50, 0, 1];
describe("component-mode annotation projection", () => {
  it("keeps north-positive room labels and route endpoints aligned on the same deck plane", () => {
    expect(projectContextPoint(top, [10, 20], 100, 100)).toEqual([60, 30]);
    expect(projectContextSegment(top, [-10, -10], [10, 10], 100, 100)).toEqual([
      [40, 60],
      [60, 40],
    ]);
    expect(projectContextPoint(top, [500, 0], 100, 100)).toBeNull();
  });
  it("clips pressure regions and route lines to the viewport instead of creating a large transformed layer", () => {
    const polygon = projectContextPolygon(
      top,
      [
        [-500, -500],
        [500, -500],
        [500, 500],
        [-500, 500],
      ],
      100,
      100,
    );
    expect(polygon).toHaveLength(4);
    expect(new Set(polygon.map((point) => point.join(",")))).toEqual(
      new Set(["0,0", "100,0", "100,100", "0,100"]),
    );
    expect(projectContextSegment(top, [-500, 0], [500, 0], 100, 100)).toEqual([
      [0, 50],
      [100, 50],
    ]);
    expect(
      projectContextSegment(top, [-500, -500], [-100, -100], 100, 100),
    ).toEqual([]);
  });
  it("clips geometry crossing the perspective horizon and drops room labels behind the camera", () => {
    const perspective = [...top];
    perspective[3] = 0.1;
    expect(projectContextPoint(perspective, [-20, 0], 100, 100)).toBeNull();
    const polygon = projectContextPolygon(
      perspective,
      [
        [-20, 0],
        [0, 0],
        [0, -30],
      ],
      100,
      100,
    );
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    expect(
      polygon
        .flat()
        .every(
          (coordinate) =>
            Number.isFinite(coordinate) &&
            coordinate >= -0.0001 &&
            coordinate <= 100.0001,
        ),
    ).toBe(true);
    const segment = projectContextSegment(
      perspective,
      [-20, 0],
      [0, 0],
      100,
      100,
    );
    expect(segment).toHaveLength(2);
    expect(
      segment
        .flat()
        .every(
          (coordinate) =>
            Number.isFinite(coordinate) &&
            coordinate >= -0.0001 &&
            coordinate <= 100.0001,
        ),
    ).toBe(true);
    expect(
      projectContextSegment(perspective, [-30, 0], [-20, 0], 100, 100),
    ).toEqual([]);
  });
  it("ignores unavailable or invalid camera dimensions", () => {
    expect(projectContextPoint([], [0, 0], 100, 100)).toBeNull();
    expect(
      projectContextPolygon(
        top,
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        0,
        100,
      ),
    ).toEqual([]);
    expect(
      projectContextSegment(
        top.map(() => NaN),
        [0, 0],
        [1, 1],
        100,
        100,
      ),
    ).toEqual([]);
  });
});
