import { expect, test } from "vitest";
import { validateInteraction, interactionLineOfSight } from "./interactions";
import { CABIN_PARTITIONS } from "../../content/src/interior";
test("interaction kinds, reach and occupancy are validated independently", () => {
  expect(() =>
    validateInteraction("seat", "sit", 1, false, false),
  ).not.toThrow();
  expect(() => validateInteraction("seat", "sit", 1, true, false)).toThrow(
    "occupied",
  );
  expect(() => validateInteraction("seat", "stand", 1, false, false)).toThrow();
  expect(() =>
    validateInteraction("light", "set-light-off", 1, false, false),
  ).not.toThrow();
  for (const distance of [1.81, Infinity, NaN])
    expect(() =>
      validateInteraction("light", "set-light-off", distance, false, false),
    ).toThrow();
  expect(() =>
    validateInteraction("light", "open-door", 1, false, false),
  ).toThrow();
});
test("interaction reach cannot cross room partitions but can cross an open doorway", () => {
  expect(interactionLineOfSight(0, 3, 2.25, 3, CABIN_PARTITIONS)).toBe(true);
  expect(interactionLineOfSight(2.25, 4.2, 2.25, 6, CABIN_PARTITIONS)).toBe(
    false,
  );
});
