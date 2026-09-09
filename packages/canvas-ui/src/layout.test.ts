import { describe, expect, it } from "vitest";
import {
  clampWindow,
  contains,
  destinationBearing,
  flex,
  gameplayIntent,
  grid,
} from "./layout";
describe("canvas layout and authority input boundary", () => {
  it("distributes flexible tracks inside available space including gaps", () => {
    const tracks = flex({ x: 10, y: 20, w: 330, h: 40 }, [1, 2, 1], 10);
    expect(tracks.map((r) => r.w)).toEqual([77.5, 155, 77.5]);
    expect(tracks.at(-1)!.x + tracks.at(-1)!.w).toBe(340);
  });
  it("wraps grid rows without placing trailing items outside the viewport", () => {
    const cells = grid({ x: 0, y: 0, w: 320, h: 200 }, 3, 5, 10);
    expect(cells[3]).toEqual({ x: 0, y: 105, w: 100, h: 95 });
    expect(cells.every((r) => r.x + r.w <= 320 && r.y + r.h <= 200)).toBe(true);
  });
  it("keeps windows reachable after a desktop to phone resize", () => {
    const r = clampWindow({ x: 1500, y: 800, w: 800, h: 900 }, 390, 844);
    expect(r).toEqual({ x: 12, y: 12, w: 366, h: 820 });
    expect(contains(r, 378, 12)).toBe(false);
  });
  it("text fields, menu, disconnect and focus blocking zero every movement lane", () => {
    for (const seated of [true, false])
      for (const interior of [true, false])
        expect(
          gameplayIntent(new Set(["KeyW", "KeyD"]), seated, interior, true),
        ).toEqual({
          throttle: 0,
          turn: 0,
          horizontal: 0,
          vertical: 0,
          sprint: false,
        });
  });
  it("view switching never supplies piloting authority or seated walk intent", () => {
    for (const interior of [true, false]) {
      const pilot = gameplayIntent(new Set(["KeyW", "KeyA"]), true, interior, false);
      expect(pilot.throttle).toBe(1);
      expect(pilot.turn).toBe(1);
      expect(pilot.vertical).toBe(0);
      expect(pilot.horizontal).toBe(0);
    }
    expect(
      gameplayIntent(new Set(["KeyW"]), false, false, false).throttle,
    ).toBe(0);
    expect(gameplayIntent(new Set(["KeyW"]), true, true, false).vertical).toBe(
      0,
    );
    expect(gameplayIntent(new Set(["KeyW"]), true, false, false).throttle).toBe(
      1,
    );
    expect(gameplayIntent(new Set(["KeyW"]), false, true, false).vertical).toBe(
      1,
    );
  });
});

it("Shift requests sprint only for moving, unseated, unblocked crew", () => {
  const keys = new Set(["KeyW", "ShiftLeft"]);
  expect(gameplayIntent(keys, false, true, false).sprint).toBe(true);
  for (const [seated, interior, blocked] of [
    [true, true, false],
    [false, false, false],
    [false, true, true],
  ])
    expect(gameplayIntent(keys, seated, interior, blocked).sprint).toBe(false);
  expect(
    gameplayIntent(new Set(["ShiftLeft"]), false, true, false).sprint,
  ).toBe(false);
});

it("destination bearings follow authoritative heading axes, shortest turns and large world origins", () => {
  expect(destinationBearing(0, 0, 0, 0, 100)).toEqual({
    distance: 100,
    bearing: 0,
    turn: 0,
  });
  expect(destinationBearing(0, 0, 0, -100, 0)).toEqual({
    distance: 100,
    bearing: 90,
    turn: 90,
  });
  expect(destinationBearing(0, 0, 0, 100, 0)).toEqual({
    distance: 100,
    bearing: 270,
    turn: -90,
  });
  expect(destinationBearing(1e12, -1e12, 350, 1e12, -1e12 + 100).turn).toBe(10);
  expect(destinationBearing(7, 9, 42, 7, 9)).toEqual({
    distance: 0,
    bearing: 42,
    turn: 0,
  });
});
