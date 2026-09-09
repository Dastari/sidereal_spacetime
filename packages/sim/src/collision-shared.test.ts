/** Shared hull geometry preserves the existing conservative contact solver. */
import { describe, expect, it } from "vitest";
import { stepContacts, type RigidBody } from "./collision";
import { stepSystemSpace } from "./system-space";
const body = (
  id: string,
  x: number,
  more: Partial<RigidBody> = {},
): RigidBody => ({
  id,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
  massKg: 1000,
  inertia: 10000,
  radius: 1,
  halfLength: 5,
  ...more,
});
const momentum = (b: readonly RigidBody[]) =>
  b.reduce((s, b) => s + b.massKg * b.vx, 0);
const energy = (b: readonly RigidBody[]) =>
  b.reduce(
    (s, b) =>
      s +
      0.5 * b.massKg * (b.vx ** 2 + b.vy ** 2) +
      0.5 * b.inertia * b.omega ** 2,
    0,
  );
describe("shared capsule collision extension", () => {
  it("supports two separated real hulls plus a shared rock without advancing the rock twice", () => {
    const input = [
      body("a", -100),
      body("b", 100),
      body("rock", 0, { halfLength: 0, vx: 10 }),
    ];
    const result = stepSystemSpace(input);
    expect(result.bodies[2].x).toBeCloseTo(0.5);
    expect(result.exhausted).toBe(false);
  });
  it("hits parallel capsule sides at their overlap midpoint without endpoint spin", () => {
    const input = [body("a", -2.1, { vx: 10 }), body("b", 0)];
    const r = stepContacts(input, 1 / 60);
    expect(r.impacts).toBeGreaterThan(0);
    expect(r.exhausted).toBe(false);
    expect(r.bodies[0].omega).toBeCloseTo(0, 12);
    expect(r.bodies[1].omega).toBeCloseTo(0, 12);
    expect(momentum(r.bodies)).toBeCloseTo(momentum(input), 8);
    expect(energy(r.bodies)).toBeLessThanOrEqual(energy(input));
  });
  it("preserves conservation at angled and offset hull contacts", () => {
    const input = [
      body("a", -3, { vx: 120, longitudinalOffset: 1.125 }),
      body("b", 0, { heading: Math.PI / 3, y: 3 }),
    ];
    const r = stepContacts(input, 1 / 60);
    expect(r.impacts).toBeGreaterThan(0);
    expect(momentum(r.bodies)).toBeCloseTo(momentum(input), 7);
    expect(energy(r.bodies)).toBeLessThanOrEqual(energy(input) * 1.00000001);
    expect(r).toEqual(stepContacts([...input].reverse(), 1 / 60));
  });
  it("detects end-to-end contacts without tunneling", () => {
    const r = stepContacts(
      [body("a", 0, { y: -30, vy: 2000 }), body("b", 0)],
      1 / 60,
    );
    expect(r.impacts).toBeGreaterThan(0);
    expect(r.bodies[0].y).toBeLessThan(r.bodies[1].y - 11.99);
    expect(r.bodies[0].vy + r.bodies[1].vy).toBeCloseTo(2000, 7);
  });
  it("handles opposite spine directions and hull rotation without nonfinite state", () => {
    for (const heading of [Math.PI, Math.PI - 1e-10, Math.PI / 2]) {
      const r = stepContacts(
        [body("a", -1.9, { vx: 5, omega: 1 }), body("b", 0, { heading })],
        1 / 60,
      );
      expect(
        r.bodies.every((b) =>
          [b.x, b.y, b.vx, b.vy, b.omega].every(Number.isFinite),
        ),
      ).toBe(true);
      expect(momentum(r.bodies)).toBeCloseTo(5000, 7);
    }
  });
});
