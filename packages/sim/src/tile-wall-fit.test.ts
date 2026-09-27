import { transformPlacementPoint } from "@sidereal/content/placement-orientation";
import { describe, it, expect } from "vitest";
import { tileWallReservation } from "./tile-wall-reservation";
import {
  bodyIntrudesIntoTileWall,
  type InteriorBodyReservation,
} from "./tile-wall-fit";
const wall = tileWallReservation({
  id: "south",
  a: [0, 0],
  b: [32, 0],
  interiorSide: "left",
  floorTop: 6,
  fullWallHeight: 96,
  heightQuarters: 4,
});
const box = (minY: number): InteriorBodyReservation => ({
  footprint: [
    [0.25, minY],
    [0.75, minY],
    [0.75, minY + 0.25],
    [0.25, minY + 0.25],
  ],
  bottom: 0.1875,
  top: 1.1875,
});
describe("complete interior body against inward boundary reservation", () => {
  it("rejects a 1/16m-increment body whose centre is clear but near face enters the wall", () => {
    expect(bodyIntrudesIntoTileWall(wall, box(0.1875))).toBe(true);
    expect(bodyIntrudesIntoTileWall(wall, box(0.25))).toBe(false);
    expect(bodyIntrudesIntoTileWall(wall, box(0.3125))).toBe(false);
  });
  it("checks vertical overlap and admits exact wall-top contact", () => {
    expect(
      bodyIntrudesIntoTileWall(wall, { ...box(0), bottom: 3.1875, top: 3.5 }),
    ).toBe(false);
    expect(
      bodyIntrudesIntoTileWall(wall, { ...box(0), bottom: 3.125, top: 3.5 }),
    ).toBe(true);
    const low = tileWallReservation({
      id: "sill",
      a: [0, 0],
      b: [32, 0],
      interiorSide: "left",
      floorTop: 6,
      fullWallHeight: 96,
      heightQuarters: 1,
    });
    expect(
      bodyIntrudesIntoTileWall(low, { ...box(0), bottom: 0.9375, top: 1.5 }),
    ).toBe(false);
  });
  it("rejects rotated body corners even where the placement origin stays clear", () => {
    const body = box(0.3125);
    body.footprint = body.footprint.map(([x, y]) => {
      const p = transformPlacementPoint([x - 0.5, y - 0.4375], 9);
      return [0.5 + p[0], 0.4375 + p[1]];
    });
    expect(bodyIntrudesIntoTileWall(wall, body)).toBe(true);
  });
  it("fails closed on degenerate, nonconvex and invalid body bounds", () => {
    expect(() =>
      bodyIntrudesIntoTileWall(wall, {
        ...box(0),
        footprint: [
          [0, 0],
          [1, 1],
          [0, 1],
          [1, 0],
        ],
      }),
    ).toThrow("convex");
    expect(() =>
      bodyIntrudesIntoTileWall(wall, { ...box(0), top: NaN }),
    ).toThrow("reservation");
  });
});
