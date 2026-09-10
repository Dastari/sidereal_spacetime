import { expect, test } from "vitest";
import { qualifiedConstructionReviewEntry } from "./construction-review-entry";
import { CARGO_HANDLING_FIXTURE as FIXTURE } from "@sidereal/content/cargo-handling-fixture";
import type { DeckCollisionFrame } from "@sidereal/sim/construction-collision";
const frame: DeckCollisionFrame = {
  shipId: "instance",
  deckId: "deck",
  fingerprint: "current",
  elevationM: 0,
  floors: [
    [
      [-1, -1],
      [7, -1],
      [7, 5],
      [-1, 5],
    ],
  ],
  segments: [],
  obstacles: [
    {
      id: "carrier",
      definitionId: "carrier-2m",
      vertices: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
    },
  ],
};
const row = {
  id: "instance",
  spawnDeckId: "deck",
  spawnX: 0,
  spawnY: 0,
  blueprintSha256: FIXTURE.sha256,
};
test("exact handling fixture uses its reserved free entry without moving cargo or historical spawn", () => {
  const before = JSON.stringify({ frame, row });
  expect(qualifiedConstructionReviewEntry(frame, row)).toEqual([-0.5, -0.5]);
  expect(JSON.stringify({ frame, row })).toBe(before);
});
test("other instances cannot inherit the fixture socket to bypass a blocked historical spawn", () => {
  expect(() =>
    qualifiedConstructionReviewEntry(frame, {
      ...row,
      blueprintSha256: "other",
    }),
  ).toThrow("blocked");
  expect(
    qualifiedConstructionReviewEntry(frame, {
      ...row,
      blueprintSha256: "other",
      spawnX: 3,
      spawnY: 1,
    }),
  ).toEqual([3, 1]);
});
test("even the explicit fixture entry must be clear on its exact deck at admission time", () => {
  const closed = {
    ...frame,
    obstacles: [
      ...frame.obstacles,
      {
        id: "blocking-equipment",
        definitionId: "crate",
        vertices: [
          [-1, -1],
          [0, -1],
          [0, 0],
          [-1, 0],
        ] as [number, number][],
      },
    ],
  };
  expect(() => qualifiedConstructionReviewEntry(closed, row)).toThrow(
    "blocked",
  );
  expect(() =>
    qualifiedConstructionReviewEntry({ ...frame, deckId: "other" }, row),
  ).toThrow("blocked");
});
