import { expect, test } from "vitest";
import {
  qualifyCargoRectangle,
  CARGO_STRUCTURE_CLEARANCE_M,
} from "./cargo-carrier-collision";
import type { DeckCollisionFrame } from "./construction-collision";
const frame = (): DeckCollisionFrame => ({
  shipId: "fixture",
  deckId: "deck",
  fingerprint: "clearance",
  elevationM: 0,
  floors: [
    [
      [-1, -1],
      [3, -1],
      [3, 3],
      [-1, 3],
    ],
  ],
  segments: [],
  obstacles: [],
});
test("wall thickness penetrating a carrier side is rejected even when centerline and carrier corners are clear", () => {
  const f = frame();
  f.segments = [
    { id: "wall", a: [-0.05, 0.5], b: [-0.05, 1.5], halfWidthM: 0.0625 },
  ];
  expect(qualifyCargoRectangle(f, [0, 0, 2, 2])).toBe(false);
});
test("equipment spanning a cargo footprint is rejected without relying on enclosed vertices or duplicate edge records", () => {
  const f = frame();
  f.obstacles = [
    {
      id: "locker",
      definitionId: "fixture-locker",
      vertices: [
        [0.5, -0.5],
        [1.5, -0.5],
        [1.5, 2.5],
        [0.5, 2.5],
      ],
    },
  ];
  expect(qualifyCargoRectangle(f, [0, 0, 2, 2])).toBe(false);
});
test("floor bearing is allowed while structural walls require an explicit positive equipment clearance", () => {
  const f = frame();
  expect(
    qualifyCargoRectangle(f, [0, 0, 2, 2], CARGO_STRUCTURE_CLEARANCE_M),
  ).toBe(true);
  f.segments = [
    { id: "wall", a: [-0.08, 0.5], b: [-0.08, 1.5], halfWidthM: 0.0625 },
  ];
  expect(qualifyCargoRectangle(f, [0, 0, 2, 2])).toBe(true);
  expect(
    qualifyCargoRectangle(f, [0, 0, 2, 2], CARGO_STRUCTURE_CLEARANCE_M),
  ).toBe(false);
  f.segments = [
    { id: "wall", a: [-0.1, 0.5], b: [-0.1, 1.5], halfWidthM: 0.0625 },
  ];
  expect(
    qualifyCargoRectangle(f, [0, 0, 2, 2], CARGO_STRUCTURE_CLEARANCE_M),
  ).toBe(true);
});
