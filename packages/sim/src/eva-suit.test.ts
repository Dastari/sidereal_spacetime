import { describe, expect, it } from "vitest";
import {
  EVA_SUIT,
  EVA_SUIT_NOZZLES,
  allocateEvaSuit,
  evaSuitDemand,
  evaSuitMass,
  type EvaSuitIntent,
} from "./eva-suit";
import { stepEvaFree, type EvaFreeState } from "./eva";
import { actuatorWrench } from "./ifcs";
import { evaSuitCheck, evaSuitMessage } from "@sidereal/content/crew-wardrobe";

const mass = evaSuitMass(40);
const intent = (over: Partial<EvaSuitIntent> = {}): EvaSuitIntent => ({
  dx: 0,
  dy: 0,
  facing: null,
  mode: "hold",
  ...over,
});
const at = (over: Partial<EvaFreeState> = {}): EvaFreeState => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  omega: 0,
  ...over,
});
const run = (s: EvaFreeState, i: EvaSuitIntent, ticks: number) => {
  for (let k = 0; k < ticks; k++) s = stepEvaFree(s, i, mass).state;
  return s;
};

describe("suit rigid body", () => {
  it("mass and inertia include the carried equipment", () => {
    expect(mass.massKg).toBe(EVA_SUIT.bodyMassKg + 40);
    expect(mass.inertiaKgM2).toBeCloseTo(120 * EVA_SUIT.gyrationM ** 2, 9);
    expect(evaSuitMass(0).massKg).toBe(EVA_SUIT.bodyMassKg);
  });

  it("conserves angular momentum in free mode with no torque (no snapping, no damping)", () => {
    const s = run(at({ omega: 1.3, heading: 0.2 }), intent({ mode: "free" }), 200);
    expect(s.omega).toBe(1.3);
    // 10 s at 1.3 rad/s: the heading advanced continuously (wrapped), never snapped.
    const expected = (((0.2 + 13) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const got = ((s.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(got).toBeCloseTo(expected, 9);
  });

  it("conserves linear momentum in free mode (drift) and thrusts only while commanded", () => {
    const drift = run(at({ vx: 1.5, vy: -0.5 }), intent({ mode: "free" }), 100);
    expect(drift.vx).toBe(1.5);
    expect(drift.vy).toBe(-0.5);
    expect(drift.x).toBeCloseTo(7.5, 9);
    const burn = run(at(), intent({ mode: "free", dx: 1 }), 20);
    expect(burn.vx).toBeGreaterThan(1);
    const coast = run(burn, intent({ mode: "free" }), 40);
    expect(coast.vx).toBe(burn.vx);
  });

  it("turns smoothly to a facing: continuous heading, bounded angular speed, no overshoot past 0.05 rad", () => {
    let s = at();
    let maxOmega = 0,
      last = s.heading,
      maxStep = 0;
    const target = 2.5;
    for (let k = 0; k < 120; k++) {
      s = stepEvaFree(s, intent({ facing: target }), mass).state;
      maxOmega = Math.max(maxOmega, Math.abs(s.omega));
      maxStep = Math.max(maxStep, Math.abs(s.heading - last));
      last = s.heading;
    }
    expect(s.heading).toBeCloseTo(target, 3);
    expect(s.omega).toBe(0);
    expect(maxOmega).toBeLessThanOrEqual(EVA_SUIT.maxAngularSpeed + 1e-9);
    expect(maxStep).toBeLessThan(EVA_SUIT.maxAngularSpeed * 0.05 + 1e-9);
  });

  it("the stabiliser (hold) kills rotation and relative velocity; free mode keeps both", () => {
    const spinning = at({ omega: 2, vx: 2 });
    const held = run(spinning, intent(), 80);
    expect(held.omega).toBe(0);
    expect(held.vx).toBe(0);
    const free = run(spinning, intent({ mode: "free" }), 80);
    expect(free.omega).toBe(2);
    expect(free.vx).toBe(2);
  });

  it("thrust directions are continuous: any angle is reachable, not eight", () => {
    for (const a of [0.1, 0.7, 1.9, -2.6]) {
      const s = run(at(), intent({ dx: Math.cos(a), dy: Math.sin(a) }), 60);
      expect(Math.atan2(s.vy, s.vx)).toBeCloseTo(a, 2);
    }
  });
});

describe("suit IFCS allocation (shared ship allocator)", () => {
  it("allocates pure force and pure torque to the nozzles within their limits", () => {
    for (const demand of [
      { fx: 0, fy: 400, torque: 0 },
      { fx: -300, fy: 0, torque: 0 },
      { fx: 0, fy: 0, torque: 60 },
      { fx: 200, fy: -150, torque: -40 },
    ]) {
      const r = allocateEvaSuit(demand, mass);
      expect(r.achieved.fx).toBeCloseTo(demand.fx, 3);
      expect(r.achieved.fy).toBeCloseTo(demand.fy, 3);
      expect(r.achieved.torque).toBeCloseTo(demand.torque, 3);
      for (const t of r.throttles) {
        expect(t.throttle).toBeGreaterThanOrEqual(0);
        expect(t.throttle).toBeLessThanOrEqual(1);
      }
      // The throttles really produce the achieved wrench.
      const sum = { fx: 0, fy: 0, torque: 0 };
      for (const t of r.throttles) {
        const w = actuatorWrench(EVA_SUIT_NOZZLES.find((n) => n.id === t.id)!, mass);
        sum.fx += w.fx * t.throttle;
        sum.fy += w.fy * t.throttle;
        sum.torque += w.torque * t.throttle;
      }
      expect(sum.fx).toBeCloseTo(r.achieved.fx, 6);
      expect(sum.torque).toBeCloseTo(r.achieved.torque, 6);
    }
  });

  it("saturates beyond the nozzles (a demand bigger than the pack gets the pack's best)", () => {
    const r = allocateEvaSuit({ fx: 0, fy: 5000, torque: 0 }, mass);
    expect(r.achieved.fy).toBeCloseTo(2 * EVA_SUIT.nozzleN, 3);
    expect(r.achieved.torque).toBeCloseTo(0, 6);
  });

  it("the demand is in the body frame: forward thrust of a turned body points where it faces", () => {
    const w = evaSuitDemand(
      at({ heading: Math.PI / 2 }),
      intent({ mode: "free", dx: -1, dy: 0 }),
      mass,
    );
    // Heading +90° faces world -X, so world -X thrust is body forward (+Y).
    expect(w.fy).toBeGreaterThan(0);
    expect(Math.abs(w.fx)).toBeLessThan(1e-6);
  });
});

describe("suit rule (vacuum needs suit, helmet and jetpack)", () => {
  const eq = (...ids: [string, string][]) => ids.map(([slot, id]) => ({ slot, id }));
  it("needs all three EVA parts in their slots; boots are optional", () => {
    expect(evaSuitCheck([]).missing).toEqual(["suit", "helmet", "pack"]);
    expect(
      evaSuitCheck(
        eq(["uniform", "wardrobe-suit-body"], ["helmet", "wardrobe-suit-helmet"], ["back", "wardrobe-suit-pack"]),
      ).ready,
    ).toBe(true);
    expect(
      evaSuitCheck(eq(["uniform", "wardrobe-suit-body"], ["back", "wardrobe-suit-pack"])).missing,
    ).toEqual(["helmet"]);
    // Ordinary clothing, armour and a jetpack armour part do not count.
    expect(
      evaSuitCheck(eq(["uniform", "wardrobe-uniform-command"], ["back", "wardrobe-t2-back"])).ready,
    ).toBe(false);
    expect(evaSuitMessage(["helmet"])).toContain("helmet");
    expect(evaSuitMessage(["suit", "helmet", "pack"])).toContain("pressure suit, helmet and EVA jetpack");
  });
});
