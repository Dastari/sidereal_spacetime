import { describe, expect, it } from "vitest";
import {
  measurePath,
  measurementShipPoint,
  measurementTriangleVertices,
  nearestMeasurementVertex,
} from "./layout-measurement";

describe("vertex measurements", () => {
  it("measures a polyline across objects in 3D and retains signed height changes", () => {
    expect(
      measurePath([
        [0, 0, 0],
        [3, 0, 4],
        [3, 4, 1],
      ]),
    ).toEqual({
      segments: [
        { distance: 5, deltaZ: 4 },
        { distance: 5, deltaZ: -3 },
      ],
      totalDistance: 10,
      deltaZ: 1,
    });
    expect(measurePath([])).toEqual({
      segments: [],
      totalDistance: 0,
      deltaZ: 0,
    });
    expect(measurePath([[10, -2, 3]])).toEqual({
      segments: [],
      totalDistance: 0,
      deltaZ: 0,
    });
  });
  it("uses indexed face vertices rather than bounding corners or the arbitrary hit point", () => {
    const buffer = [0, 0, 0, 3, 0, 0, 2, 0, 4, 0, 0, 4];
    expect(measurementTriangleVertices(buffer, [0, 1, 2, 0, 2, 3], 1)).toEqual([
      [0, 0, 0],
      [2, 0, 4],
      [0, 0, 4],
    ]);
    expect(measurementTriangleVertices(buffer, [0, 1, 2], 1)).toEqual([]);
    expect(measurementTriangleVertices(buffer, null, -1)).toEqual([]);
  });
  it("supports unindexed native triangles and rejects incomplete vertex buffers", () => {
    const buffer = [0, 0, 0, 1, 0, 0, 0, 0, 1, 10, 1, 2, 20, 1, 2, 10, 1, 4];
    expect(measurementTriangleVertices(buffer, null, 1)).toEqual([
      [10, 1, 2],
      [20, 1, 2],
      [10, 1, 4],
    ]);
    expect(measurementTriangleVertices(buffer, [], 1)).toEqual(
      measurementTriangleVertices(buffer, null, 1),
    );
    expect(measurementTriangleVertices(buffer.slice(0, -1), null, 1)).toEqual(
      [],
    );
  });
  it("selects by screen distance within a bounded pixel radius and ignores clipped vertices", () => {
    const vertices = [
      {
        point: [3, 0, 1] as [number, number, number],
        screen: [100, 100, 0.5] as [number, number, number],
      },
      {
        point: [2, 0, 4] as [number, number, number],
        screen: [130, 100, 0.7] as [number, number, number],
      },
      {
        point: [1, 0, 8] as [number, number, number],
        screen: [125, 100, 1.5] as [number, number, number],
      },
    ];
    expect(nearestMeasurementVertex(vertices, 125, 100)).toEqual([2, 0, 4]);
    expect(nearestMeasurementVertex(vertices, 160, 100)).toBeNull();
  });
  it("restores the render origin and maps renderer Y to ship up with north inverted", () => {
    expect(measurementShipPoint([0.5, 2, -3], [10000, 7, -20000])).toEqual([
      10000.5, 20003, 9,
    ]);
  });
});
