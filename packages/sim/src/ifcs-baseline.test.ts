import { expect, test } from "vitest";
import { LAB_FLIGHT_ACTUATORS as actuators, LAB_FLIGHT_MASS as mass, LAB_FLIGHT_PROFILE as profile } from "../../content/src/flight";
import { actuatorWrench, allocateThrust, compileMass, pilotDesiredMotion, solveFlight } from "./ifcs";

test.each([
  [{ fx: 0, fy: 18000, torque: 0 }, 30472.404595252614],
  [{ fx: 18000, fy: 0, torque: 0 }, 21326.06699040138],
  [{ fx: 0, fy: 0, torque: 18000 }, 5494.622080948587],
] as const)("phase 0 fixture allocation %j", (request, spent) => {
  const result = allocateThrust(actuators, mass, request);
  for (const axis of ["fx", "fy", "torque"] as const) expect(result.achieved[axis]).toBeCloseTo(request[axis], 6);
  const byId = new Map(actuators.map(a => [a.id, a]));
  // Phase 1 deliberately removes unnecessary opposing thrust.
  expect(result.commands.reduce((sum, c) => sum + c.throttle * byId.get(c.id)!.maxThrustN, 0)).toBeCloseTo(spent, 6);
});

test("phase 0 eight-second full throttle turn from 30 m/s", () => {
  let state = { x: 0, y: 0, vx: 0, vy: 30, heading: 0, omega: 0 };
  for (let i = 0; i < 480; i++) state = solveFlight(state, pilotDesiredMotion(state, { throttle: 1, turn: 1 }, 30, 12, .65), mass, actuators, true, profile).motion;
  // Phase 1 feedforward and envelope-limited turns replace this speed loss.
  expect(Math.hypot(state.vx, state.vy)).toBeCloseTo(15.237297372579977, 6);
});

test("phase 0 one-radian heading capture overshoot", () => {
  let state = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 }, overshoot = 0;
  for (let i = 0; i < 900; i++) {
    state = solveFlight(state, { vx: 0, vy: 0, heading: 1 }, mass, actuators, true, profile).motion;
    overshoot = Math.max(overshoot, state.heading - 1);
  }
  // Phase 1 envelope-aware heading control replaces this overshoot.
  expect(overshoot * 180 / Math.PI).toBeCloseTo(5.009942441453706, 6);
});

test("off-axis mass and lateral force use the longitudinal COM moment arm", () => {
  const compiled = compileMass([
    { id: "hull", massKg: 1000, x: -2, y: -3, inertiaKgM2: 100 },
    { id: "cargo", massKg: 1000, x: 4, y: 5, inertiaKgM2: 20 },
  ]);
  expect(compiled).toEqual({ massKg: 2000, centerX: 1, centerY: 1, inertiaKgM2: 50120 });
  const wrench = actuatorWrench({ id: "side", x: 1, y: 4, rotation: Math.PI / 2, maxThrustN: 2000, availability: 1 }, compiled);
  expect(wrench.fx).toBeCloseTo(-2000);
  expect(wrench.torque).toBeCloseTo(6000);
});
