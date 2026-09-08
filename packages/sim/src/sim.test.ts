import { expect, test } from "vitest";
import { integrate, walk, assertRevision, inventoryFits } from "./index";
const atRest = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };
test("zero thrust preserves momentum", () => {
  const next = integrate(
    { ...atRest, vx: 10 },
    { throttle: 1, turn: 0 },
    100,
    0,
    0,
  );
  expect(next.vx).toBe(10);
  expect(next.x).toBeCloseTo(10 / 60);
});
test("mass changes acceleration and frame positions retain f64 precision", () => {
  const a = integrate(
    { ...atRest, x: 1e9 },
    { throttle: 1, turn: 0 },
    100,
    600,
    0,
  );
  const b = integrate(atRest, { throttle: 1, turn: 0 }, 200, 600, 0);
  expect(a.vy).toBeCloseTo(2 * b.vy);
  expect(a.x).toBe(1e9);
});
test("nonfinite intent rejected", () =>
  expect(() =>
    integrate(atRest, { throttle: NaN, turn: 0 }, 1, 1, 1),
  ).toThrow());
test("walk stays in prototype cabin", () => {
  expect(walk(4, 8, 1, 1)).toEqual({ x: 4, y: 8 });
});
test("stale edits fail", () =>
  expect(() => assertRevision(2n, 1n)).toThrow("Revision conflict"));
test("rectangular inventory footprint respects boundaries", () => {
  expect(
    inventoryFits({ width: 4, height: 5 }, { width: 2, height: 3 }, 2, 2),
  ).toBe(true);
  expect(
    inventoryFits({ width: 4, height: 5 }, { width: 2, height: 3 }, 3, 2),
  ).toBe(false);
});

test("server rows may carry identity and revision metadata alongside motion", () => {
  const row = {
    ...atRest,
    id: "ship-id",
    revision: 1n,
    owner: { identity: "test" },
  };
  expect(integrate(row, { throttle: 1, turn: 0 }, 100, 600, 0).vy).toBeCloseTo(
    0.1,
  );
});
