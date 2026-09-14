import { describe, expect, it } from "vitest";
import type { RigidBody } from "./collision";
import { STANDARD_FLIGHT } from "./ifcs";
import { stepSystemSpace, type SystemFlightControl } from "./system-space";
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
const control = (
  bodyId: string,
  more: Partial<SystemFlightControl> = {},
): SystemFlightControl => ({
  bodyId,
  enabled: true,
  intent: { throttle: 1, turn: 0 },
  mass: { massKg: 1000, inertiaKgM2: 1000, centerX: 0, centerY: 0 },
  actuators: [
    {
      id: "engine",
      x: 0,
      y: 0,
      rotation: 0,
      maxThrustN: 1000,
      availability: 1,
    },
  ],
  profile: STANDARD_FLIGHT,
  maxForwardSpeed: 20,
  maxReverseSpeed: 10,
  ...more,
});
describe("once-per-system space stepping", () => {
  it("advances one shared rock once across two ships and three fixed substeps", () => {
    const input = [
      body("ship-b", 100),
      body("rock", 0, { vx: 10 }),
      body("ship-a", -100),
    ];
    const result = stepSystemSpace(input);
    expect(result.bodies.find((b) => b.id === "rock")!.x).toBeCloseTo(0.5, 12);
    expect(result.completedSubsteps).toBe(3);
    expect(result.exhausted).toBe(false);
    expect(result.changedBodyIds).toEqual(["rock"]);
    expect(input[1].x).toBe(0);
  });
  it("keeps resting separated rows bit-identical without claiming motion writes", () => {
    const input = [body("a", 0), body("b", 30)];
    const result = stepSystemSpace(input);
    expect(result.bodies).toEqual(input);
    expect(result.changedBodyIds).toEqual([]);
    expect(result.impacts).toBe(0);
  });
  it("applies all ships achieved forces before common drift regardless of input order", () => {
    const input = [body("a", -100), body("b", 100), body("rock", 0, { vy: 7 })];
    const controls = [control("a"), control("b")];
    const a = stepSystemSpace(input, controls),
      b = stepSystemSpace([...input].reverse(), [...controls].reverse());
    expect(a).toEqual(b);
    expect(a.bodies[0].vy).toBeCloseTo(0.05, 12);
    expect(a.bodies[0].y).toBeCloseTo(1 / 600, 12);
    expect(a.bodies[2].y).toBeCloseTo(0.35, 12);
    expect(a.commands).toEqual([
      { bodyId: "a", actuators: [{ id: "engine", throttle: 1 }] },
      { bodyId: "b", actuators: [{ id: "engine", throttle: 1 }] },
    ]);
  });
  it("disabled control coasts without invented braking and zeroes actuator presentation", () => {
    const input = [body("a", 0, { vx: 5 })];
    const result = stepSystemSpace(input, [control("a", { enabled: false })]);
    expect(result.bodies[0].x).toBeCloseTo(0.25);
    expect(result.bodies[0].vx).toBe(5);
    expect(result.bodies[0].vy).toBe(0);
    expect(result.commands[0].actuators[0].throttle).toBe(0);
  });
  it("shared collisions conserve pair momentum and do not add kinetic energy", () => {
    const input = [body("a", -10, { vx: 1000 }), body("b", 0), body("c", 100)];
    const result = stepSystemSpace(input);
    expect(result.impacts).toBeGreaterThan(0);
    expect(result.bodies.reduce((n, b) => n + b.massKg * b.vx, 0)).toBeCloseTo(
      1e6,
      7,
    );
    expect(
      result.bodies.reduce(
        (n, b) =>
          n + b.massKg * (b.vx ** 2 + b.vy ** 2) + b.inertia * b.omega ** 2,
        0,
      ),
    ).toBeLessThanOrEqual(1e9);
    expect(result).toEqual(stepSystemSpace([...input].reverse()));
  });
  it("freezes remaining time immediately on contact exhaustion without extra kicks", () => {
    const input = [
      // Diagonal near miss keeps swept AABBs overlapping, exercising the real
      // narrow-phase iteration cap even after broad-phase separation pruning.
      body("a", -Math.SQRT1_2, {
        y: -Math.SQRT1_2,
        vx: 1000 * Math.SQRT1_2,
        vy: 1000 * Math.SQRT1_2,
      }),
      body("b", -2.001 * Math.SQRT1_2, { y: 2.001 * Math.SQRT1_2 }),
      body("ship", 100),
    ];
    const result = stepSystemSpace(input, [control("ship")]);
    expect(result.reason).toBe("contact-budget");
    expect(result.completedSubsteps).toBe(0);
    expect(result.consumption[0].actuators[0].newtonSeconds).toBeCloseTo(1000 / 60, 12);
    expect(result.bodies.find((b) => b.id === "a")!.vx).toBe(
      1000 * Math.SQRT1_2,
    );
    expect(result.bodies.find((b) => b.id === "ship")!.vy).toBeCloseTo(
      1 / 60,
      12,
    );
  });
  it("never truncates bodies or applies any forces on budget exhaustion", () => {
    const input = Array.from({ length: 65 }, (_, i) =>
      body(`b${i}`, i * 10, { vx: 1 }),
    );
    const result = stepSystemSpace(input);
    expect(result.reason).toBe("body-budget");
    expect(result.bodies).toBe(input);
    expect(result.changedBodyIds).toEqual([]);
    const tooMany = Array.from({ length: 257 }, (_, i) => ({
      ...control("a").actuators[0],
      id: `e${i}`,
    }));
    expect(
      stepSystemSpace([body("a", 0)], [control("a", { actuators: tooMany })])
        .reason,
    ).toBe("actuator-budget");
  });
  it("rejects duplicate identities, nonexistent controls, inconsistent inertia and invalid coordinates", () => {
    expect(() => stepSystemSpace([body("a", 0), body("a", 30)])).toThrow(
      /Duplicate/,
    );
    expect(() => stepSystemSpace([body("a", 0)], [control("b")])).toThrow(
      /Missing/,
    );
    expect(() =>
      stepSystemSpace([body("a", 0)], [control("a"), control("a")]),
    ).toThrow(/duplicate/);
    expect(() =>
      stepSystemSpace([body("a", 0, { inertia: 3 })], [control("a")]),
    ).toThrow(/inertial/);
    expect(() => stepSystemSpace([body("a", Infinity)])).toThrow();
  });
  it("returns whole last-safe substep at the coordinate boundary without clamping momentum", () => {
    const input = [body("a", 1e9, { vx: 10 })];
    const result = stepSystemSpace(input);
    expect(result.reason).toBe("coordinate-bound");
    expect(result.bodies).toEqual(input);
    expect(result.changedBodyIds).toEqual([]);
  });
});

it("finishes only achieved zero-demand braking and leaves coasting or unavailable axes alone", () => {
  const tiny = body("ship", 0, { vy: 5e-7, omega: 0 });
  const braking = control("ship", {
    intent: { throttle: 0, turn: 0 },
    actuators: [{ ...control("ship").actuators[0], rotation: Math.PI }],
  });
  expect(stepSystemSpace([tiny], [braking]).bodies[0].vy).toBe(0);
  for (const disabled of [
    { ...braking, enabled: false },
    { ...braking, actuators: [] },
    {
      ...braking,
      actuators: braking.actuators.map((a) => ({ ...a, availability: 0 })),
    },
  ]) {
    expect(stepSystemSpace([tiny], [disabled]).bodies[0].vy).toBe(tiny.vy);
  }
  const rock = body("rock", 20, { vx: 5e-50, omega: 4e-60 });
  const result = stepSystemSpace([tiny, rock], [braking]);
  expect(result.bodies.find((b) => b.id === "rock")).toMatchObject({
    vx: rock.vx,
    omega: rock.omega,
  });
});

it("nonzero pilot demand remains meaningful below the braking terminal tolerance", () => {
  const result = stepSystemSpace(
    [body("ship", 0)],
    [control("ship", { intent: { throttle: 1e-9, turn: 0 } })],
  );
  expect(result.bodies[0].vy).toBeGreaterThan(0);
});

it("tiny unassisted contacts still conserve the pair's linear momentum", () => {
  const a = body("a", -1, { vx: 4e-7 }),
    b = body("b", 1);
  const result = stepSystemSpace([a, b]);
  expect(
    result.bodies.reduce((sum, v) => sum + v.massKg * v.vx, 0),
  ).toBeCloseTo(a.massKg * a.vx, 15);
  expect(result.bodies.some((v) => v.vx !== 0)).toBe(true);
});

it("rolls back output telemetry together with a rejected force kick", () => {
  const ship = body("ship", 1e9, { vx: 10 });
  const result = stepSystemSpace([ship], [control("ship")]);
  expect(result.reason).toBe("coordinate-bound");
  expect(result.completedSubsteps).toBe(0);
  expect(result.bodies).toEqual([ship]);
  expect(result.commands).toEqual([]);
  expect(result.consumption).toEqual([]);
});

it("retains the last completed command sample when a later kick is rolled back", () => {
  const ship = body("ship", 1e9 - .2, { vx: 10 });
  const result = stepSystemSpace([ship], [control("ship", { intent: { throttle: .01, turn: 0 } })]);
  expect(result.reason).toBe("coordinate-bound");
  expect(result.completedSubsteps).toBe(1);
  // One 1000 N engine on 1000 kg: committed delta-v / DT equals throttle.
  // A later uncommitted feedback kick differs as forward speed rises.
  expect(result.commands[0].actuators[0].throttle).toBeGreaterThan(0);
  expect(result.commands[0].actuators[0].throttle).toBeCloseTo(result.bodies[0].vy * 60, 10);
  expect(result.consumption[0].actuators[0].newtonSeconds).toBeCloseTo(result.bodies[0].vy * ship.massKg, 10);
});

it("sums changing throttle across accepted kicks and scales availability once", () => {
  const ship = body("ship", 0);
  const c = control("ship", { intent: { throttle: .01, turn: 0 } });
  c.actuators = c.actuators.map(a => ({ ...a, availability: .5 }));
  const result = stepSystemSpace([ship], [c]);
  const used = result.consumption[0].actuators[0].newtonSeconds;
  expect(used).toBeGreaterThan(0);
  // Independent momentum check: the single forward engine is the only force.
  expect(used).toBeCloseTo(result.bodies[0].vy * ship.massKg, 10);
  const finalThrottleApproximation = result.commands[0].actuators[0].throttle * 500 * .05;
  expect(Math.abs(used - finalThrottleApproximation)).toBeGreaterThan(.001);
  const off = stepSystemSpace([ship], [{ ...c, actuators: c.actuators.map(a => ({ ...a, availability: 0 })) }]);
  expect(off.consumption[0].actuators[0].newtonSeconds).toBe(0);
});
