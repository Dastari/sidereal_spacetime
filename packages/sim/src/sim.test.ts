import { expect, test } from "vitest";
import { integrate, walk, assertRevision, inventoryFits } from "./index";
import { CABIN_COLLIDERS } from "../../content/src/interior";
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
test("crew cannot cross authored partitions but can enter rooms through open doorways", () => {
  let wall = { x: 0, y: -4.5 };
  for (let i = 0; i < 120; i++)
    wall = walk(wall.x, wall.y, -1, 0, CABIN_COLLIDERS);
  expect(wall.x).toBeGreaterThan(-1); // inner bulkhead, including crew radius
  let door = { x: 0, y: -6 };
  for (let i = 0; i < 120; i++)
    door = walk(door.x, door.y, -1, 0, CABIN_COLLIDERS);
  expect(door.x).toBeLessThan(-1.7);
  expect(door.x).toBeGreaterThan(-2.7); // enters, then stops at the reactor
  let hall = { x: 0, y: 6 };
  for (let i = 0; i < 300; i++)
    hall = walk(hall.x, hall.y, 0, -1, CABIN_COLLIDERS);
  expect(hall.y).toBeLessThan(-6);
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

test("sprint selects bounded fixed-step speed and normalizes diagonals", () => {
  const ordinary = walk(0, 0, 1, 0);
  const sprint = walk(0, 0, 1, 0, [], true);
  const diagonal = walk(0, 0, 1, 1, [], true);
  expect(ordinary.x).toBeCloseTo(2.5 / 60);
  expect(sprint.x).toBeCloseTo(4.5 / 60);
  expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(4.5 / 60);
  expect(walk(0, 0, 0, 0, [], true)).toEqual({ x: 0, y: 0 });
  expect(() => walk(0, 0, 1, 0, [], 100 as unknown as boolean)).toThrow();
});
test("sprinting respects partitions, doorway clearance and cabin limits", () => {
  let wall = { x: 0, y: -4.5 };
  let door = { x: 0, y: -6 };
  for (let i = 0; i < 120; i++) {
    wall = walk(wall.x, wall.y, -1, 0, CABIN_COLLIDERS, true);
    door = walk(door.x, door.y, -1, 0, CABIN_COLLIDERS, true);
  }
  expect(wall.x).toBeGreaterThan(-1);
  expect(door.x).toBeLessThan(-1.7);
  expect(door.x).toBeGreaterThan(-2.7);
  expect(walk(4, 8, 1, 1, CABIN_COLLIDERS, true)).toEqual({ x: 4, y: 8 });
});
