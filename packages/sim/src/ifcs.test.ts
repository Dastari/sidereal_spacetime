import {
  LAB_FLIGHT_MASS,
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_PROFILE,
} from "../../content/src/flight";
import { expect, test } from "vitest";
import {
  pilotDesiredMotion,
  solveFlight,
  compileMass,
  actuatorWrench,
  allocateThrust,
  desiredWrench,
  integrateWrench,
  type Actuator,
} from "./ifcs";
const mass = compileMass([
  { id: "deck", massKg: 1000, x: 0, y: 0, inertiaKgM2: 8000 },
]);
const engine = (
  id: string,
  x: number,
  rotation = 0,
  availability = 1,
): Actuator => ({ id, x, y: 0, rotation, maxThrustN: 2000, availability });
test("moving cargo shifts center of mass and inertia without changing mass", () => {
  const hull = { id: "hull", massKg: 1000, x: 0, y: 0, inertiaKgM2: 8000 };
  const a = compileMass([
    hull,
    { id: "cargo", massKg: 1000, x: 0, y: 0, inertiaKgM2: 20 },
  ]);
  const b = compileMass([
    hull,
    { id: "cargo", massKg: 1000, x: 4, y: 0, inertiaKgM2: 20 },
  ]);
  expect(b.massKg).toBe(a.massKg);
  expect(b.centerX).toBe(2);
  expect(b.inertiaKgM2 - a.inertiaKgM2).toBe(8000);
  expect(() => compileMass([hull, hull])).toThrow();
  expect(() => compileMass([{ ...hull, massKg: NaN }])).toThrow();
});
test("mount offset and nozzle rotation create real torque and directional force", () => {
  expect(actuatorWrench(engine("port", -2), mass)).toEqual({
    fx: -0,
    fy: 2000,
    torque: -4000,
  });
  const reverse = actuatorWrench(engine("retro", 0, Math.PI), mass);
  expect(reverse.fy).toBeCloseTo(-2000);
  const side = actuatorWrench(engine("side", 0, Math.PI / 2), mass);
  expect(side.fx).toBeCloseTo(-2000);
  expect(side.fy).toBeCloseTo(0);
});
test("no engines, disabled engines and uncovered axes invent no force", () => {
  const request = { fx: 2000, fy: -2000, torque: 0 };
  expect(allocateThrust([], mass, request).achieved).toEqual({
    fx: 0,
    fy: 0,
    torque: 0,
  });
  const result = allocateThrust(
    [engine("forward", 0), engine("dead", 0, Math.PI, 0)],
    mass,
    request,
  );
  expect(result.achieved.fy).toBe(0);
  expect(result.residual).toEqual(request);
});
test("balanced engines share translation, saturate correctly and solve independent of row order", () => {
  const parts = [engine("port", -2), engine("starboard", 2)],
    request = { fx: 0, fy: 3000, torque: 0 };
  const a = allocateThrust(parts, mass, request),
    b = allocateThrust([...parts].reverse(), mass, request);
  expect(a).toEqual(b);
  expect(a.achieved.fy).toBeCloseTo(3000, 4);
  expect(a.achieved.torque).toBeCloseTo(0, 4);
  for (const command of a.commands)
    expect(command.throttle).toBeCloseTo(0.75, 4);
  const saturated = allocateThrust(parts, mass, { fx: 0, fy: 9000, torque: 0 });
  expect(saturated.achieved.fy).toBe(4000);
  expect(saturated.residual.fy).toBe(5000);
});
test("a damaged engine constrains yaw-free translation rather than granting phantom thrust", () => {
  const result = allocateThrust(
    [engine("port", -2, 0, 0.25), engine("starboard", 2)],
    mass,
    { fx: 0, fy: 1000, torque: 0 },
  );
  expect(result.achieved.fy).toBeCloseTo(1000, 3);
  expect(result.achieved.torque).toBeCloseTo(0, 3);
  expect(result.commands.find((c) => c.id === "port")?.throttle).toBeCloseTo(
    1,
    3,
  );
});
test("heading demand wraps the short way, and zero angular demand actively brakes", () => {
  const state = { x: 0, y: 0, vx: 0, vy: 0, heading: Math.PI - 0.01, omega: 0 };
  expect(
    desiredWrench(state, { vx: 0, vy: 0, heading: -Math.PI + 0.01 }, mass)
      .torque,
  ).toBeGreaterThan(0);
  expect(
    desiredWrench(
      { ...state, omega: 0.3 },
      { vx: 0, vy: 0, angularVelocity: 0 },
      mass,
    ).torque,
  ).toBeLessThan(0);
});
test("closed loop converges on requested world velocity and heading with actual opposing actuators", () => {
  const parts = [
    engine("a", -2),
    engine("b", 2),
    engine("c", -2, Math.PI),
    engine("d", 2, Math.PI),
    engine("e", 0, Math.PI / 2),
    engine("f", 0, -Math.PI / 2),
  ];
  let state = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };
  for (let i = 0; i < 1200; i++) {
    const request = desiredWrench(state, { vx: 2, vy: 3, heading: 0.65 }, mass);
    state = integrateWrench(
      state,
      mass,
      allocateThrust(parts, mass, request).achieved,
    );
  }
  expect(state.vx).toBeCloseTo(2, 2);
  expect(state.vy).toBeCloseTo(3, 2);
  expect(state.heading).toBeCloseTo(0.65, 2);
  expect(state.omega).toBeCloseTo(0, 2);
  const coast = integrateWrench(state, mass, { fx: 0, fy: 0, torque: 0 });
  expect(coast.vx).toBe(state.vx);
  expect(coast.vy).toBe(state.vy);
});

test("pilot release commands opposing engines until rotation and translation settle", () => {
  let state = { x: 0, y: 0, vx: 3, vy: 8, heading: 0.4, omega: 0.5 };
  const initial = solveFlight(
    state,
    pilotDesiredMotion(state, { throttle: 0, turn: 0 }, 30, 12, 0.65),
    LAB_FLIGHT_MASS,
    LAB_FLIGHT_ACTUATORS,
    true,
    LAB_FLIGHT_PROFILE,
  );
  expect(initial.achieved.torque).toBeLessThan(0);
  expect(
    initial.commands.some(
      (c) => c.id.startsWith("drives-retro") && c.throttle > 0,
    ),
  ).toBe(true);
  for (let i = 0; i < 900; i++) {
    state = solveFlight(
      state,
      pilotDesiredMotion(state, { throttle: 0, turn: 0 }, 30, 12, 0.65),
      LAB_FLIGHT_MASS,
      LAB_FLIGHT_ACTUATORS,
      true,
      LAB_FLIGHT_PROFILE,
    ).motion;
  }
  expect(Math.hypot(state.vx, state.vy)).toBeLessThan(0.001);
  expect(Math.abs(state.omega)).toBeLessThan(0.001);
});
test("lost grant/computer and absent engines coast even with an active setpoint", () => {
  const state = { x: 0, y: 0, vx: 3, vy: 8, heading: 0.4, omega: 0.5 };
  for (const [enabled, parts] of [
    [false, LAB_FLIGHT_ACTUATORS],
    [true, []],
  ] as const) {
    const result = solveFlight(
      state,
      { vx: 0, vy: 0, heading: 1 },
      LAB_FLIGHT_MASS,
      parts,
      enabled,
    );
    expect(result.achieved).toEqual({ fx: 0, fy: 0, torque: 0 });
    expect(result.motion.vx).toBe(state.vx);
    expect(result.motion.vy).toBe(state.vy);
    expect(result.motion.omega).toBe(state.omega);
  }
});
test("fixture captures a heading by applying reverse torque before arrival", () => {
  let state = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };
  let counterthrust = false;
  for (let i = 0; i < 900; i++) {
    const result = solveFlight(
      state,
      { vx: 0, vy: 0, heading: 1 },
      LAB_FLIGHT_MASS,
      LAB_FLIGHT_ACTUATORS,
      true,
      LAB_FLIGHT_PROFILE,
    );
    counterthrust ||=
      state.heading < 1 && state.omega > 0.05 && result.achieved.torque < 0;
    state = result.motion;
  }
  expect(counterthrust).toBe(true);
  expect(state.heading).toBeCloseTo(1, 3);
  expect(state.omega).toBeCloseTo(0, 3);
});
