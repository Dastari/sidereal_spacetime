import { describe, it, expect } from "vitest";
import { stepContacts, type RigidBody } from "./collision";
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
  inertia: 1000,
  radius: 1,
  halfLength: 0,
  ...more,
});
describe("authoritative planar contacts", () => {
  it("transfers momentum without tunneling at high speed", () => {
    const result = stepContacts(
      [body("a", -10, { vx: 2000 }), body("b", 0)],
      1 / 60,
    );
    const [a, b] = result.bodies;
    expect(result.impacts).toBeGreaterThan(0);
    expect(result.exhausted).toBe(false);
    expect(a.x).toBeLessThan(b.x - 1.999);
    expect(a.vx + b.vx).toBeCloseTo(2000, 7);
    expect(a.vx ** 2 + b.vx ** 2).toBeLessThanOrEqual(2000 ** 2);
  });
  it("turns a capsule after an off-center impact and respects rotated mounting", () => {
    const result = stepContacts(
      [
        body("a", 0, { halfLength: 5, inertia: 12000, heading: Math.PI / 2 }),
        body("b", 3, { y: 1.9, vy: -10 }),
      ],
      1 / 60,
    );
    expect(Math.abs(result.bodies[0].omega)).toBeGreaterThan(0.1);
    expect(result.impacts).toBeGreaterThan(0);
  });
  it("prevents a rotating hull sweeping through a stationary rock", () => {
    const r = stepContacts(
      [
        body("a", 0, { halfLength: 5, inertia: 12000, omega: 12 }),
        body("b", -2.2, { y: 4 }),
      ],
      1 / 60,
    );
    expect(r.impacts).toBeGreaterThan(0);
    expect(r.bodies[1].vx).toBeLessThan(0);
  });
  it("keeps separated motion unchanged and input immutable", () => {
    const a = body("a", 0, { vx: 3 }),
      b = body("b", 40);
    const r = stepContacts([b, a], 1 / 60);
    expect(r.bodies[0].x).toBeCloseTo(0.05);
    expect(a.x).toBe(0);
    expect(r.impacts).toBe(0);
  });
  it("rejects a separated grazing sweep before iterative narrow phase", () => {
    // The paths never intersect: closest center separation is 2.001 m for
    // two 1 m circles. Swept bounds prove the gap without iterative exhaustion.
    const a = body("a", -1, { vx: 1000 });
    const b = body("b", 0, { y: 2.001 });
    const result = stepContacts([a, b], 1 / 60);
    expect(result.exhausted).toBe(false);
    expect(result.impacts).toBe(0);
    const [moving, stationary] = result.bodies;
    expect(moving.vx).toBe(1000);
    expect(moving.vy).toBe(0);
    expect(moving.omega).toBe(0);
    expect(moving.x).toBeGreaterThan(a.x);
    expect(moving.x).toBeCloseTo(-1 + 1000 / 60);
    expect(result.work.narrowphasePairs).toBe(0);
    expect(moving.y).toBe(0);
    expect(stationary).toEqual(b);
    expect(a.x).toBe(-1);
  });
  it("advances a resolved separated pass for the complete step", () => {
    const result = stepContacts(
      [body("a", -1, { vx: 1000 }), body("b", 0, { y: 2.1 })],
      1 / 60,
    );
    expect(result.exhausted).toBe(false);
    expect(result.impacts).toBe(0);
    expect(result.bodies[0].x).toBeCloseTo(-1 + 1000 / 60);
    expect(result.bodies[0].vy).toBe(0);
    expect(result.bodies[1].vy).toBe(0);
  });
  it("rejects non-finite and invalid physical data", () => {
    expect(() => stepContacts([body("a", NaN)], 1 / 60)).toThrow();
    expect(() => stepContacts([body("a", 0, { massKg: 0 })], 1 / 60)).toThrow();
    expect(() => stepContacts([body("a", 0)], Infinity)).toThrow();
  });
});

describe("forward-offset capsule envelope", () => {
  const hull = {
    radius: 5.4,
    halfLength: 7.125,
    longitudinalOffset: 1.125,
    inertia: 120000,
  };
  it("contacts the extended nose at either heading without changing the aft reach", () => {
    for (const heading of [0, Math.PI / 2]) {
      const ux = -Math.sin(heading),
        uy = Math.cos(heading);
      const r = stepContacts(
        [
          body("a", 0, { ...hull, heading }),
          body("b", ux * 14.6, { y: uy * 14.6, vx: -ux * 10, vy: -uy * 10 }),
        ],
        1 / 60,
      );
      expect(r.impacts).toBeGreaterThan(0);
      expect(r.bodies[0].inertia).toBe(120000);
    }
    const aft = stepContacts(
      [body("a", 0, hull), body("b", 0, { y: -12.5 })],
      1 / 60,
    );
    expect(aft.impacts).toBe(0);
    expect(aft.bodies[1].y).toBe(-12.5);
  });
  it("uses canonical COM for off-axis torque and includes forward offset in rotational sweep", () => {
    const r = stepContacts(
      [body("a", 0, { ...hull, omega: 5 }), body("b", -6.1, { y: 8 })],
      1 / 60,
    );
    expect(r.impacts).toBeGreaterThan(0);
    expect(r.bodies[0].omega).toBeLessThan(5);
    expect(r.bodies[1].vx).toBeLessThan(0);
  });
  it("rejects nonfinite offsets", () => {
    expect(() =>
      stepContacts(
        [body("a", 0, { ...hull, longitudinalOffset: NaN })],
        1 / 60,
      ),
    ).toThrow();
  });
});

it("wraps contact headings to (-pi, pi] without changing angular momentum", () => {
  for (const [heading, omega] of [[Math.PI, 3], [-Math.PI, 0], [-Math.PI + .01, -3], [200 * Math.PI, 0]]) {
    const result = stepContacts([body("ship", 0, { heading, omega })], 1 / 60).bodies[0];
    expect(result.heading).toBeGreaterThan(-Math.PI);
    expect(result.heading).toBeLessThanOrEqual(Math.PI);
    expect(Math.sin(result.heading)).toBeCloseTo(Math.sin(heading + omega / 60), 12);
    expect(Math.cos(result.heading)).toBeCloseTo(Math.cos(heading + omega / 60), 12);
    expect(result.omega).toBe(omega);
  }
});

it("contact ordering uses plain stable identity comparison", () => {
  const ids = ["z", "A", "a", "_", "ä"];
  expect(stepContacts(ids.map((id, i) => body(id, i * 10)), 1 / 60).bodies.map(b => b.id)).toEqual([...ids].sort());
});
