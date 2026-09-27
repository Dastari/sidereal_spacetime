import { expect, test } from "vitest";
import {
  sweptCapsuleBounds,
  sweptContactCandidates,
} from "./collision-broadphase";
import { stepContacts, type RigidBody } from "./collision";
const body = (id: string, x = 0, more: Partial<RigidBody> = {}): RigidBody => ({
  id,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
  massKg: 1000,
  inertia: 10000,
  radius: 5.4,
  halfLength: 7.125,
  longitudinalOffset: 1.125,
  ...more,
});
test("bounds contain complete rotating offset hull and translation at either coordinate extreme", () => {
  for (const x of [-1e9, 0, 1e9])
    for (const heading of [0, 0.3, Math.PI / 2, Math.PI])
      for (const omega of [-400, -12, 0, 12, 400])
        for (const lateralOffset of [-8, 0, 8]) {
          const b = body("a", x, {
            y: -x,
            heading,
            omega,
            vx: 3000,
            vy: -1500,
            lateralOffset,
          });
          const dt = 1 / 60,
            box = sweptCapsuleBounds(b, dt);
          for (let i = 0; i <= 32; i++)
            for (const s of [-1, 0, 1]) {
              const t = (dt * i) / 32,
                along = b.longitudinalOffset! + s * b.halfLength;
              const px =
                b.x +
                b.vx * t -
                Math.sin(heading + omega * t) * along +
                Math.cos(heading + omega * t) * lateralOffset;
              const py =
                b.y +
                b.vy * t +
                Math.cos(heading + omega * t) * along +
                Math.sin(heading + omega * t) * lateralOffset;
              expect(px - b.radius).toBeGreaterThanOrEqual(box.minX);
              expect(px + b.radius).toBeLessThanOrEqual(box.maxX);
              expect(py - b.radius).toBeGreaterThanOrEqual(box.minY);
              expect(py + b.radius).toBeLessThanOrEqual(box.maxY);
            }
        }
});
test("64 separated ships need zero narrow phase evaluations instead of 2016", () => {
  const ships = Array.from({ length: 64 }, (_, i) =>
    body(String(i).padStart(2, "0"), i * 100, { vx: 5, heading: i * 0.2 }),
  );
  const r = stepContacts(ships, 1 / 60);
  expect(r.work.exhaustivePairs).toBe(2016);
  expect(r.work.narrowphasePairs).toBe(0);
  expect(r.work.conservativeIterations).toBe(0);
  expect(r.work.broadphaseAxisChecks).toBe(0);
  expect(
    r.bodies.every((b) => b.x === ships.find((s) => s.id === b.id)!.x + 5 / 60),
  ).toBe(true);
  expect(r).toEqual(stepContacts([...ships].reverse(), 1 / 60));
});
test("vertical separation rejects candidates after bounded axis checks", () => {
  const ships = Array.from({ length: 64 }, (_, i) =>
    body(String(i), 0, { y: i * 100 }),
  );
  const r = stepContacts(ships, 1 / 60);
  expect(r.work.broadphaseAxisChecks).toBe(2016);
  expect(r.work.narrowphasePairs).toBe(0);
  expect(r.exhausted).toBe(false);
});
test("crowded broad phase returns every pair in canonical order without truncation", () => {
  const ships = Array.from({ length: 64 }, (_, i) => body(String(i), 0));
  const r = sweptContactCandidates(ships, 1 / 60);
  expect(r.pairs).toHaveLength(2016);
  expect(r.pairs[0]).toEqual([0, 1]);
  expect(r.pairs.at(-1)).toEqual([62, 63]);
  expect(new Set(r.pairs.map((p) => p.join(","))).size).toBe(2016);
});
test("fast distant ships cannot cross between disjoint initial positions", () => {
  const r = stepContacts(
    [body("a", -200, { vx: 20000 }), body("b", 200, { vx: -20000 })],
    1 / 60,
  );
  expect(r.impacts).toBeGreaterThan(0);
  expect(r.work.narrowphasePairs).toBeGreaterThan(0);
  expect(r.bodies[0]!.x).toBeLessThan(r.bodies[1]!.x);
  expect(r.bodies[0]!.vx + r.bodies[1]!.vx).toBeCloseTo(0, 7);
});
test("rotation-only contact remains in sweep even when initial bounds do not overlap", () => {
  const a = body("a", 0, {
    radius: 0.5,
    halfLength: 8,
    longitudinalOffset: 2,
    omega: 12,
  });
  const b = body("b", -2, {
    y: 9,
    radius: 0.5,
    halfLength: 0,
    longitudinalOffset: 0,
  });
  expect(sweptContactCandidates([a, b], 1 / 60).pairs).toEqual([[0, 1]]);
  const r = stepContacts([a, b], 1 / 60);
  expect(r.impacts).toBeGreaterThan(0);
  expect(r.bodies[1]!.vx).toBeLessThan(0);
});
test("a collision impulse rebuilds candidates for a second impact", () => {
  const r = stepContacts(
    [
      body("a", -4, {
        radius: 1,
        halfLength: 0,
        longitudinalOffset: 0,
        vx: 600,
      }),
      body("b", 0, { radius: 1, halfLength: 0, longitudinalOffset: 0 }),
      body("c", 3, { radius: 1, halfLength: 0, longitudinalOffset: 0 }),
    ],
    1 / 60,
  );
  expect(r.impacts).toBeGreaterThanOrEqual(2);
  expect(r.bodies[2]!.vx).toBeGreaterThan(0);
  expect(r.bodies.reduce((s, b) => s + b.vx, 0)).toBeCloseTo(600, 8);
});
