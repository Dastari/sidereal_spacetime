import { expect, test } from "vitest";
import {
  TILESET_WALL_CONVENTION,
  type TileWallReservationInput,
} from "@sidereal/content/tileset-interfaces";
import { pointInTileWall, tileWallReservation } from "./tile-wall-reservation";

const wall: TileWallReservationInput = {
  id: "south",
  a: [0, 0],
  b: [32, 0],
  interiorSide: "left",
  floorTop: 6,
  fullWallHeight: 96,
  heightQuarters: 4,
};
test("a 1 m tile keeps its outer edge fixed and reserves 250 mm inward", () => {
  const r = tileWallReservation(wall);
  expect(r.corners).toEqual([
    [0, 0],
    [1, 0],
    [1, 0.25],
    [0, 0.25],
  ]);
  expect(pointInTileWall(r, [0.5, 0.1, 1])).toBe(true);
  expect(pointInTileWall(r, [0.5, -0.001, 1])).toBe(false);
  expect(pointInTileWall(r, [0.5, 0.251, 1])).toBe(false);
  expect(pointInTileWall(r, [0.5, 0.1, 0.18])).toBe(false);
});
test("opposing edges consume tile interior without changing external mating dimensions", () => {
  const r = tileWallReservation({ ...wall, a: [32, 32], b: [0, 32] });
  expect(r.corners).toEqual([
    [1, 1],
    [0, 1],
    [0, 0.75],
    [1, 0.75],
  ]);
  const reversed = tileWallReservation({
    ...wall,
    a: [0, 32],
    b: [32, 32],
    interiorSide: "right",
  });
  expect(reversed.corners[2]).toEqual([1, 0.75]);
});
test("quarter-height datums use the frozen specification without rounding or sealing claims", () => {
  expect(TILESET_WALL_CONVENTION.standardDeck.pitchUnits).toBe(112);
  for (const q of [1, 2, 3, 4] as const) {
    const r = tileWallReservation({ ...wall, heightQuarters: q });
    expect(r.top - r.bottom).toBe(q * 0.75);
    expect(pointInTileWall(r, [0.5, 0.1, r.top + 0.01])).toBe(false);
  }
  expect(() =>
    tileWallReservation({ ...wall, fullWallHeight: 90, heightQuarters: 1 }),
  ).toThrow(/lattice/);
});
test("diagonal reservations remain continuous and on the declared interior side", () => {
  const r = tileWallReservation({ ...wall, a: [-32, -32], b: [32, 32] });
  expect(r.corners[0]).toEqual([-1, -1]);
  expect(r.corners[1]).toEqual([1, 1]);
  expect(r.corners[2][0]).toBeCloseTo(1 - 0.25 / Math.sqrt(2), 14);
  expect(r.corners[2][1]).toBeCloseTo(1 + 0.25 / Math.sqrt(2), 14);
  expect(pointInTileWall(r, [-0.1, 0.1, 1])).toBe(true);
  expect(pointInTileWall(r, [0.1, -0.1, 1])).toBe(false);
});
test("invalid endpoints, heights, fractions and points reject with the wall identity", () => {
  for (const bad of [
    { b: [0, 0] },
    { a: [0.1, 0] },
    { floorTop: NaN },
    { fullWallHeight: -1 },
    { floorTop: 8192 },
    { interiorSide: "outside" },
    { heightQuarters: 0 },
  ])
    expect(() =>
      tileWallReservation({ ...wall, ...bad } as TileWallReservationInput),
    ).toThrow(/south/);
  expect(() =>
    pointInTileWall(tileWallReservation(wall), [Infinity, 0, 0]),
  ).toThrow(/south/);
});
