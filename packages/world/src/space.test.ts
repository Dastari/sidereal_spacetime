import { expect, test } from "vitest";
import { stepLabSpace } from "./lab-flight";
const ship = {
  id: "ship",
  x: 0,
  y: 0,
  vx: 3,
  vy: 2,
  heading: 0,
  omega: 0.2,
  massKg: 12000,
  thrustN: 36000,
  turnAcceleration: 0.65,
};
test("authority disabled coasts and collision integrator owns exactly one drift", () => {
  const result = stepLabSpace(ship, [], { throttle: 1, turn: 1 }, false).ship;
  expect(result.x).toBeCloseTo(ship.vx * 0.05, 10);
  expect(result.y).toBeCloseTo(ship.vy * 0.05, 10);
  expect(result.heading).toBeCloseTo(ship.omega * 0.05, 10);
  expect(result.vx).toBe(ship.vx);
  expect(result.omega).toBe(ship.omega);
});
test("fresh zero input brakes but revoking station control stops assistance immediately", () => {
  const braking = stepLabSpace(ship, [], { throttle: 0, turn: 0 }, true).ship;
  expect(Math.hypot(braking.vx, braking.vy)).toBeLessThan(
    Math.hypot(ship.vx, ship.vy),
  );
  expect(braking.omega).toBeLessThan(ship.omega);
  const coasting = stepLabSpace(
    { ...ship, ...braking },
    [],
    { throttle: 0, turn: 0 },
    false,
  ).ship;
  expect(coasting.vx).toBe(braking.vx);
  expect(coasting.vy).toBe(braking.vy);
  expect(coasting.omega).toBe(braking.omega);
});
