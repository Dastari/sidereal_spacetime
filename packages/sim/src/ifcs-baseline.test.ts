import { expect, test } from "vitest";
import {
  LAB_FLIGHT_ACTUATORS as actuators,
  LAB_FLIGHT_MASS as mass,
  LAB_FLIGHT_PROFILE as profile,
} from "@sidereal/content/flight";
import {
  actuatorWrench,
  allocateThrust,
  compileMass,
  pilotDesiredMotion,
  solveFlight,
} from "./ifcs";

test.each([
  [{ fx: 0, fy: 18000, torque: 0 }, 18000],
  [{ fx: 18000, fy: 0, torque: 0 }, 18000],
  [{ fx: 0, fy: 0, torque: 18000 }, 18000 / 6.5],
] as const)("phase 1 fixture allocation %j", (request, spent) => {
  const result = allocateThrust(actuators, mass, request);
  for (const axis of ["fx", "fy", "torque"] as const)
    expect(result.achieved[axis]).toBeCloseTo(request[axis], 6);
  const byId = new Map(actuators.map((a) => [a.id, a]));
  // Phase 0 spent 30,472 / 21,326 / 5,495 N; phase 1 removes opposing thrust.
  expect(
    result.commands.reduce(
      (sum, c) => sum + c.throttle * byId.get(c.id)!.maxThrustN,
      0,
    ),
  ).toBeCloseTo(spent, 6);
});

test("eight-second full-throttle turn from 30 m/s: facing follows the yaw intent, speed recovers along it", () => {
  // Facing and speed are separate intents (fly-by-wire, 2026-09-29). The nose turns at the
  // pilot's rate through allocated torque; the drives swing the velocity after it, so the
  // ship slides while turning and regains the requested speed along the new heading.
  let state = { x: 0, y: 0, vx: 0, vy: 30, heading: 0, omega: 0 };
  let peakOmega = 0;
  for (let i = 0; i < 480; i++) {
    state = solveFlight(
      state,
      pilotDesiredMotion(state, { throttle: 1, turn: 1 }, 30, 12, 0.65),
      mass,
      actuators,
      true,
      profile,
    ).motion;
    peakOmega = Math.max(peakOmega, state.omega);
  }
  expect(peakOmega).toBeLessThanOrEqual(0.65 + 1e-9);
  expect(peakOmega).toBeGreaterThan(0.6);
  for (let i = 0; i < 1800; i++)
    state = solveFlight(
      state,
      pilotDesiredMotion(state, { throttle: 1, turn: 0 }, 30, 12, 0.65),
      mass,
      actuators,
      true,
      profile,
    ).motion;
  const along =
    -state.vx * Math.sin(state.heading) + state.vy * Math.cos(state.heading);
  expect(Math.abs(along - 30) / 30).toBeLessThan(0.02);
  expect(Math.abs(state.omega)).toBeLessThan(1e-3);
});

test("phase 1 one-radian heading capture overshoot", () => {
  let state = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 },
    overshoot = 0;
  for (let i = 0; i < 900; i++) {
    state = solveFlight(
      state,
      { vx: 0, vy: 0, heading: 1 },
      mass,
      actuators,
      true,
      profile,
    ).motion;
    overshoot = Math.max(overshoot, state.heading - 1);
  }
  // Phase 0 overshot by 5.00994 degrees; phase 1 must stay below 0.5.
  expect((overshoot * 180) / Math.PI).toBeLessThan(0.5);
});

test("off-axis mass and lateral force use the longitudinal COM moment arm", () => {
  const compiled = compileMass([
    { id: "hull", massKg: 1000, x: -2, y: -3, inertiaKgM2: 100 },
    { id: "cargo", massKg: 1000, x: 4, y: 5, inertiaKgM2: 20 },
  ]);
  expect(compiled).toEqual({
    massKg: 2000,
    centerX: 1,
    centerY: 1,
    inertiaKgM2: 50120,
  });
  const wrench = actuatorWrench(
    {
      id: "side",
      x: 1,
      y: 4,
      rotation: Math.PI / 2,
      maxThrustN: 2000,
      availability: 1,
    },
    compiled,
  );
  expect(wrench.fx).toBeCloseTo(-2000);
  expect(wrench.torque).toBeCloseTo(6000);
});
