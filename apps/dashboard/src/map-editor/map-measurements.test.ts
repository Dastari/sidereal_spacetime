import { test, expect } from "vitest";
import { formatTravelTime, orbitLabelPath } from "./map-measurements";
test.each([
  [0, "0 s"],
  [900, "30 s"],
  [1800, "1 min"],
  [108000, "1 h"],
  [2592000, "1 d"],
])("travel distance %s is calculated at 30m/s", (value, label) => {
  expect(formatTravelTime(value as number)).toBe(label);
});
test("labels are bounded arcs even at deep zoom", () => {
  const path = orbitLabelPath(500, -1e10, 1e10, Math.PI / 2);
  expect(path.length).toBeLessThan(220);
  expect(path).not.toMatch(/NaN|Infinity/);
  expect(path.split(" A ")).toHaveLength(2);
  expect(orbitLabelPath(0, 0, 20, 0)).toBe("");
});

test("offscreen orbit arcs use the viewport fallback", () => {
  expect(orbitLabelPath(10, 10, 200, 0, { width: 1000, height: 800 })).toBe("");
  expect(
    orbitLabelPath(500, 400, 200, -Math.PI / 2, { width: 1000, height: 800 }),
  ).not.toBe("");
});
