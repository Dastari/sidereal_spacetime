import { expect, test } from "vitest";
import { compileMass, STANDARD_FLIGHT } from "./ifcs";
import { toAuthoredFrameMotion, toCenterOfMassMotion } from "./flight-frame";
import { stepSystemSpace } from "./system-space";

const hull = { id: "hull", massKg: 1000, x: 0, y: 0, inertiaKgM2: 4000 };
const passengerWorld = (
  frame: { x: number; y: number; heading: number },
  p: { x: number; y: number },
) => ({
  x: frame.x + Math.cos(frame.heading) * p.x - Math.sin(frame.heading) * p.y,
  y: frame.y + Math.sin(frame.heading) * p.x + Math.cos(frame.heading) * p.y,
});
test("moving cargo aft and port preserves authored frame, its velocity and passenger position", () => {
  const masses = [
    [0, 0],
    [-3, -4],
  ].map(([x, y]) =>
    compileMass([hull, { id: "cargo", massKg: 200, x, y, inertiaKgM2: 20 }]),
  );
  const frame = { x: 100, y: 200, vx: 3, vy: 4, heading: 0.4, omega: 0.2 };
  const passenger = { x: 2, y: 1 };
  const oldBody = toCenterOfMassMotion(frame, masses[0]);
  const newBody = toCenterOfMassMotion(frame, masses[1]);
  expect(newBody.x).not.toBe(oldBody.x);
  expect(masses[1].inertiaKgM2).toBeGreaterThan(masses[0].inertiaKgM2);
  const restored = toAuthoredFrameMotion(newBody, masses[1]);
  for (const key of ["x", "y", "vx", "vy", "heading", "omega"] as const)
    expect(restored[key]).toBeCloseTo(frame[key], 12);
  expect(passengerWorld(restored, passenger)).toEqual(
    passengerWorld(frame, passenger),
  );
  expect(passenger).toEqual({ x: 2, y: 1 });
});

test("asymmetric hull and passenger rotate about compiled COM while the authored frame is retained", () => {
  const mass = compileMass([
    hull,
    { id: "cargo", massKg: 200, x: -3, y: -4, inertiaKgM2: 20 },
  ]);
  const frame = { x: 100, y: 200, vx: 3, vy: 4, heading: 0.4, omega: 0.2 };
  const initial = toCenterOfMassMotion(frame, mass);
  const body = {
    ...initial,
    id: "ship",
    massKg: mass.massKg,
    inertia: mass.inertiaKgM2,
    radius: 1,
    halfLength: 2,
    authoredMidpointX: 0,
    authoredMidpointY: 1.125,
    lateralOffset: -mass.centerX,
    longitudinalOffset: 1.125 - mass.centerY,
  };
  const result = stepSystemSpace(
    [body],
    [
      {
        bodyId: "ship",
        enabled: false,
        intent: { throttle: 0, turn: 0 },
        mass,
        actuators: [],
        profile: STANDARD_FLIGHT,
        maxForwardSpeed: 30,
        maxReverseSpeed: 12,
      },
    ],
  );
  expect(result.exhausted).toBe(false);
  const final = result.bodies[0],
    restored = toAuthoredFrameMotion(final, mass);
  expect(final.x).toBeCloseTo(initial.x + initial.vx * 0.05, 12);
  expect(final.y).toBeCloseTo(initial.y + initial.vy * 0.05, 12);
  const passenger = { x: 2, y: 1 },
    before = passengerWorld(frame, passenger),
    after = passengerWorld(restored, passenger);
  expect(Math.hypot(after.x - final.x, after.y - final.y)).toBeCloseTo(
    Math.hypot(before.x - initial.x, before.y - initial.y),
    12,
  );
  expect(restored.heading).toBeCloseTo(frame.heading + 0.01, 12);
  expect(() =>
    stepSystemSpace(
      [{ ...body, lateralOffset: 0 }],
      [
        {
          bodyId: "ship",
          enabled: false,
          intent: { throttle: 0, turn: 0 },
          mass,
          actuators: [],
          profile: STANDARD_FLIGHT,
          maxForwardSpeed: 30,
          maxReverseSpeed: 12,
        },
      ],
    ),
  ).toThrow(/inertial/);
});
