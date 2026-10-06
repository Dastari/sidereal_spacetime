import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
import { fleetFootprintsSeparated, planFleetFormation } from "./faction-fleet";

test("formation uses current f64 position and rotated hulls with clear EVA lanes", () => {
  const source = { x: 280000000.25, y: -91000000.125, heading: Math.PI / 4 };
  const obstacle = { ...source, halfX: 8, halfY: 20 };
  const sizes = [
    { halfX: 7, halfY: 10 },
    { halfX: 9, halfY: 12 },
    { halfX: 11, halfY: 17 },
    { halfX: 12, halfY: 16 },
    { halfX: 13, halfY: 22 },
    { halfX: 15, halfY: 26 },
  ];
  const placed = planFleetFormation(source, sizes, [obstacle]);
  expect(placed).toHaveLength(6);
  for (let i = 0; i < placed.length; i++) {
    expect(
      Math.hypot(placed[i].x - source.x, placed[i].y - source.y),
    ).toBeLessThanOrEqual(120.001);
    expect(fleetFootprintsSeparated(placed[i], obstacle)).toBe(true);
    for (let j = 0; j < i; j++)
      expect(fleetFootprintsSeparated(placed[i], placed[j])).toBe(true);
  }
});

test("enclosed or invalid placement fails before installation", () => {
  const source = { x: 0, y: 0, heading: 1 };
  expect(() =>
    planFleetFormation(source, Array(6).fill({ halfX: 12, halfY: 24 }), [
      { ...source, halfX: 300, halfY: 300 },
    ]),
  ).toThrow("No safe");
  expect(() => planFleetFormation({ ...source, x: Infinity }, [], [])).toThrow(
    "Invalid",
  );
});
