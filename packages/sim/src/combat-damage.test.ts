import { describe, expect, it } from "vitest";
import {
  availabilityLoss,
  castCharacterBeam,
  prefabPowerFactor,
  catalogDamageStates,
  CHARACTER_MAX_HEALTH,
  componentDamageState,
  componentHitDamage,
  DOWNED_MICROS,
  freshVitals,
  hitCharacter,
  RECOVER_HEALTH,
  REGEN_DELAY_MICROS,
  settledVitals,
} from "./combat-damage";
import { LAB_WEAPONS } from "@sidereal/content/weapons";

const S = 1_000_000n;

describe("character health", () => {
  it("takes damage, goes down at zero and takes no more while down", () => {
    let v = freshVitals(0n);
    const first = hitCharacter(v, 40, S);
    expect(first).toMatchObject({ applied: 40, downed: false });
    expect(first.vitals.health).toBe(60);
    v = first.vitals;
    const last = hitCharacter(v, 90, 2n * S);
    expect(last).toMatchObject({ applied: 60, downed: true });
    expect(last.vitals).toMatchObject({
      health: 0,
      state: "downed",
      downedUntilMicros: 2n * S + DOWNED_MICROS,
    });
    const again = hitCharacter(last.vitals, 50, 3n * S);
    expect(again).toMatchObject({ applied: 0, downed: false });
    expect(again.vitals.health).toBe(0);
  });
  it("stands up after the downed time with recovery health, then regenerates after the delay", () => {
    const down = hitCharacter(freshVitals(0n), 500, S).vitals;
    expect(settledVitals(down, S + DOWNED_MICROS - 1n).state).toBe("downed");
    const up = settledVitals(down, S + DOWNED_MICROS);
    expect(up).toMatchObject({ state: "active", health: RECOVER_HEALTH });
    // No regeneration inside the delay; 2/s after it; capped at max.
    const t0 = S + DOWNED_MICROS;
    expect(settledVitals(up, t0 + REGEN_DELAY_MICROS).health).toBe(
      RECOVER_HEALTH,
    );
    expect(settledVitals(up, t0 + REGEN_DELAY_MICROS + 2n * S).health).toBe(
      RECOVER_HEALTH + 4,
    );
    expect(settledVitals(up, t0 + 1000n * S).health).toBe(CHARACTER_MAX_HEALTH);
  });
  it("never double counts regeneration across checkpoints", () => {
    const hit = hitCharacter(freshVitals(0n), 50, 0n).vitals;
    const a = settledVitals(hit, REGEN_DELAY_MICROS + 1n * S);
    const b = settledVitals(a, REGEN_DELAY_MICROS + 3n * S);
    expect(b.health).toBeCloseTo(
      settledVitals(hit, REGEN_DELAY_MICROS + 3n * S).health,
    );
    expect(b.health).toBeCloseTo(56);
  });
  it("rejects nonsense damage", () => {
    expect(() => hitCharacter(freshVitals(0n), -1, 0n)).toThrow();
    expect(() => hitCharacter(freshVitals(0n), NaN, 0n)).toThrow();
  });
  it("every lab weapon deals positive damage", () => {
    for (const w of Object.values(LAB_WEAPONS))
      expect(w.damage).toBeGreaterThan(0);
  });
});

describe("component damage states", () => {
  const rules = catalogDamageStates("ship-components-v1@2");
  it("reads the catalogue table for every admitted revision", () => {
    expect(rules.map((r) => r.state)).toEqual([
      "pristine",
      "scuffed",
      "damaged",
      "destroyed",
    ]);
    expect(catalogDamageStates("ship-components-v1@1")).toEqual(rules);
    expect(() => catalogDamageStates("ship-components-v1@99")).toThrow();
  });
  it("maps hp fractions to states and performance", () => {
    expect(componentDamageState(80, 80, rules)).toEqual({
      state: "pristine",
      performance: 1,
    });
    expect(componentDamageState(50, 80, rules).state).toBe("scuffed");
    expect(componentDamageState(20, 80, rules)).toEqual({
      state: "damaged",
      performance: 0.5,
    });
    expect(componentDamageState(0.0001, 80, rules).state).toBe("damaged");
    expect(componentDamageState(0, 80, rules)).toEqual({
      state: "destroyed",
      performance: 0,
    });
  });
  it("applies armour as a flat per-hit reduction", () => {
    expect(componentHitDamage(15, 3)).toBe(12);
    expect(componentHitDamage(7, 8)).toBe(0);
    expect(() => componentHitDamage(-1, 0)).toThrow();
  });
  it("computes the multiplicative IFCS loss to reach a target availability", () => {
    expect(availabilityLoss(1, 0.5)).toBe(0.5);
    expect(availabilityLoss(0.5, 0)).toBe(1);
    expect(availabilityLoss(1, 1)).toBeUndefined();
    expect(availabilityLoss(0.5, 1)).toBeUndefined();
    expect(availabilityLoss(0, 0)).toBeUndefined();
  });
});

describe("power-fed fittings", () => {
  const wren = [
    { mountId: "reactor", generationKw: 700, activeKw: 5, fitted: false },
    { mountId: "main", generationKw: 0, activeKw: 400, fitted: true },
    { mountId: "rcs", generationKw: 0, activeKw: 20, fitted: true },
    { mountId: "core", generationKw: 0, activeKw: 0.5, fitted: true },
    { mountId: "life", generationKw: 0, activeKw: 8, fitted: false },
  ];
  it("keeps full supply while generation covers the fitted draw", () => {
    expect(prefabPowerFactor(wren, () => 1)).toBe(1);
  });
  it("browns out with a damaged reactor and cuts off with a destroyed one", () => {
    expect(
      prefabPowerFactor(wren, (id) => (id === "reactor" ? 0.5 : 1)),
    ).toBeCloseTo(350 / 420.5, 9);
    expect(prefabPowerFactor(wren, (id) => (id === "reactor" ? 0 : 1))).toBe(0);
  });
  it("does not limit ships without rated generation", () => {
    expect(prefabPowerFactor(wren.slice(1), () => 0)).toBe(1);
  });
});

describe("character beam targets", () => {
  it("hits the nearest body in front and never the shooter", () => {
    const hit = castCharacterBeam([0, 0], 0, 60, [
      { id: "self", x: 0, y: 0.1 },
      { id: "far", x: 0, y: 5 },
      { id: "near", x: 0.2, y: 3 },
      { id: "behind", x: 0, y: -2 },
      { id: "wide", x: 1, y: 2 },
    ]);
    expect(hit?.id).toBe("near");
    expect(hit!.distanceM).toBeCloseTo(3 - Math.sqrt(0.09 - 0.04), 6);
  });
  it("stops at the given distance (a wall in front)", () => {
    expect(
      castCharacterBeam([0, 0], Math.PI / 2, 2, [{ id: "a", x: 3, y: 0 }]),
    ).toBeUndefined();
    expect(
      castCharacterBeam([0, 0], Math.PI / 2, 4, [{ id: "a", x: 3, y: 0 }])
        ?.point,
    ).toEqual([2.7, 0]);
  });
});
