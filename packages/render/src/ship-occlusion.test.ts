import { expect, test } from "vitest";
import { cabinLineOfSight } from "./ship-occlusion";
test("door opening permits spill but room divider blocks it in both directions", () => {
  expect(cabinLineOfSight(-1.4, -6, 0, -6)).toBe(true);
  expect(cabinLineOfSight(-1.4, -6, -3.1, -1.5)).toBe(false);
  expect(cabinLineOfSight(-3.1, -1.5, -1.4, -6)).toBe(false);
  expect(cabinLineOfSight(0, 7.2, 0, -6)).toBe(true);
  expect(cabinLineOfSight(0, 7.2, -3.1, -6)).toBe(false);
});
