import { expect, test } from "vitest";
import { cursorShipTurn, evaSteering } from "./steering";
test("ship cursor requests bounded yaw, counteracts spin and preserves manual/blocked intent", () => {
  expect(cursorShipTurn([-1, 0], 0, 0, false)).toBe(1);
  expect(cursorShipTurn([1, 0], 0, 0, false)).toBe(-1);
  expect(cursorShipTurn([0, 1], 1, 0, false)).toBeCloseTo(-0.8);
  expect(cursorShipTurn(undefined, 0, 1, false)).toBe(1);
  expect(cursorShipTurn([1, 0], 0, 1, false)).toBe(1);
  expect(cursorShipTurn([NaN, 0], 0, 0, false)).toBe(0);
  expect(cursorShipTurn([-1, 0], 0, 1, true)).toBe(0);
});
test("both EVA stabilizer modes offer cursor following or WASD body steering", () => {
  for (const mode of ["hold", "free"]) {
    const cursor = evaSteering(
      new Set(["KeyW", "KeyD"]),
      "cursor",
      mode,
      0,
      Math.PI / 2,
      false,
    );
    expect(cursor.active).toBe(true);
    expect(cursor.facing).toBe(Math.PI / 2);
    expect(cursor.intent.turn).toBe(0);
    expect(Math.hypot(cursor.intent.dx, cursor.intent.dy)).toBeCloseTo(1);
    const keyboard = evaSteering(
      new Set(["KeyW", "KeyA"]),
      "keyboard",
      mode,
      0,
      -2,
      false,
    );
    expect(keyboard.intent.dx).toBeCloseTo(0);
    expect(keyboard.intent.dy).toBe(1);
    expect(keyboard.intent.turn).toBe(1);
    expect(keyboard.active).toBe(mode === "hold");
    const strafe = evaSteering(
      new Set(["ShiftLeft", "KeyD"]),
      "keyboard",
      mode,
      0,
      2,
      false,
    );
    expect(strafe.intent.dx).toBe(1);
    expect(strafe.intent.turn).toBe(0);
    expect(strafe.active).toBe(false);
    const blocked = evaSteering(
      new Set(["KeyW", "KeyA"]),
      "keyboard",
      mode,
      0,
      2,
      true,
    );
    expect(blocked.active).toBe(false);
    expect(blocked.intent).toEqual({
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
  }
});
