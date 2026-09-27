import { expect, test } from "vitest";
import { stepContacts, type RigidBody } from "./collision";
import { stepSystemSpace } from "./system-space";
import { compileZones, sweepZones } from "./zones";
import { newSystemMap } from "@sidereal/content/system-map";
import { newMapZone } from "@sidereal/content/zones";
const body = (
  id: string,
  x: number,
  extra: Partial<RigidBody> = {},
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
  ...extra,
});
test("collision bounce retains each accepted drift instead of an endpoint chord", () => {
  const input = [
      body("ship", -10, { vx: 2000 }),
      body("rock", 0, { massKg: 1e12, inertia: 1e12 }),
    ],
    r = stepContacts(input, 1 / 60, 0.8, new Set(["ship"]));
  expect(r.impacts).toBeGreaterThan(0);
  const trace = r.trace.filter((s) => s.kind === "drift");
  expect(trace.length).toBeGreaterThanOrEqual(2);
  expect(trace[0].to.x).toBeGreaterThan(trace[0].from.x);
  expect(trace.at(-1)!.to.x).toBeLessThan(trace.at(-1)!.from.x);
  const d = newSystemMap("system");
  d.zones = [{ ...newMapZone("near-wall", -3, 0), width: 1, length: 100 }];
  const zones = compileZones(d),
    events = trace.flatMap(
      (s) =>
        sweepZones(zones, { ...s.from, height: 0 }, { ...s.to, height: 0 })
          .changes,
    );
  expect(events.map((e) => e.entered)).toEqual([true, false, true, false]);
});
test("rolled-back coordinate substeps expose no trace", () => {
  const input = [body("ship", 1e9, { vx: 10 })],
    r = stepSystemSpace(input, [], new Set(["ship"]));
  expect(r.reason).toBe("coordinate-bound");
  expect(r.bodies).toEqual(input);
  expect(r.trace).toEqual([]);
});
test("contact exhaustion retains only the partial accepted motion trace", () => {
  const input = [
      body("ship", -Math.SQRT1_2, {
        y: -Math.SQRT1_2,
        vx: 1000 * Math.SQRT1_2,
        vy: 1000 * Math.SQRT1_2,
      }),
      body("rock", -2.001 * Math.SQRT1_2, { y: 2.001 * Math.SQRT1_2 }),
    ],
    r = stepSystemSpace(input, [], new Set(["ship"]));
  expect(r.reason).toBe("contact-budget");
  expect(r.trace.length).toBeGreaterThan(0);
  const last = r.trace.at(-1)!;
  expect(last.to.x).toBe(r.bodies.find((b) => b.id === "ship")!.x);
  expect(last.to.y).toBe(r.bodies.find((b) => b.id === "ship")!.y);
});
test("overlap correction is distinct from drift", () => {
  const r = stepContacts(
    [body("ship", 0), body("rock", 1)],
    1 / 60,
    0.2,
    new Set(["ship"]),
  );
  expect(r.trace.some((s) => s.kind === "correction")).toBe(true);
});

test("accepted traces may follow an authored point when a COM rotates in place", () => {
  const point = (b: RigidBody) => ({x: b.x - 3 * Math.cos(b.heading), y: b.y - 3 * Math.sin(b.heading)});
  const input = [body("ship", 0, {omega: 0.4})];
  const r = stepSystemSpace(input, [], new Set(["ship"]), point);
  expect(r.trace.length).toBeGreaterThan(0);
  expect(r.trace[0].from).toEqual(point(input[0]));
  expect(r.trace.at(-1)!.to).toEqual(point(r.bodies[0]));
  expect(r.bodies[0].x).toBe(0);
  expect(r.bodies[0].y).toBe(0);
});
