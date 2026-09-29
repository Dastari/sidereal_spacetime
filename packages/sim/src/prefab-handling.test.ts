import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { prefabStats } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabHandling } from "./prefab-handling";
import { PREFAB_FLIGHT_PROFILE } from "./prefab-flight";

/**
 * Owner, 2026-09-29: "Ships engines/reactors need to power the ships so they feel snappy to move
 * around (at least as the basic starter ship sizes etc)". Proposed handling envelope (not
 * owner-approved), measured through the real pilot guidance and allocator at 60 Hz:
 *
 * | S class (starters)              | target          |
 * |---------------------------------|-----------------|
 * | 0 -> 28.5 m/s (95 % of cruise)  | <= 5 s          |
 * | stop from 30 m/s, keys released | <= 9 s          |
 * | 90 degree turn from rest        | <= 2.5 s        |
 * | peak yaw rate                   | >= 55 deg/s     |
 * | yaw rate while at cruise        | >= 45 deg/s     |
 *
 * M and L hulls stay heavier: every one is slower than every S hull on each measure.
 */
const catalog = defaultPrefabComponentCatalog();
const deg = (r: number) => (r * 180) / Math.PI;
const handling = new Map(
  PREFAB_SHIPS.map((p) => [p.id, prefabHandling(p, catalog)] as const),
);
const small = PREFAB_SHIPS.filter((p) => p.sizeClass === "S");
const large = PREFAB_SHIPS.filter((p) => p.sizeClass !== "S");

describe("prefab handling envelope (catalog revision 3, proposed)", () => {
  for (const p of small)
    it(`${p.id} (S) accelerates, turns and stops snappily with budgets closing`, () => {
      const h = handling.get(p.id)!;
      expect(h.zeroToCruiseS).toBeLessThanOrEqual(5);
      expect(h.stopS).toBeLessThanOrEqual(9);
      expect(h.turn90S).toBeLessThanOrEqual(2.5);
      expect(deg(h.yawRateRadS)).toBeGreaterThanOrEqual(55);
      expect(deg(h.cruiseTurnRadS)).toBeGreaterThanOrEqual(45);
      // The profile caps must not clip what the drives provide.
      expect(h.envelope.forward).toBeLessThanOrEqual(
        PREFAB_FLIGHT_PROFILE.maxAcceleration,
      );
      const stats = prefabStats(p, catalog);
      expect(stats.powerBalanceW).toBeGreaterThanOrEqual(0);
      expect(stats.heatBalanceW).toBeLessThanOrEqual(0);
    });

  it("Wren, the starter, meets the envelope with margin", () => {
    const h = handling.get("fed.s.wren")!;
    expect(h.envelope.forward).toBeGreaterThanOrEqual(6);
    expect(h.envelope.reverse).toBeGreaterThanOrEqual(4);
    expect(h.zeroToCruiseS).toBeLessThanOrEqual(4.5);
    expect(h.stopS).toBeLessThanOrEqual(7.5);
    expect(h.stopDistanceM).toBeLessThanOrEqual(120);
    expect(h.turn90S).toBeLessThanOrEqual(2.2);
  });

  it("M and L hulls stay heavier than every S hull", () => {
    const worstSmall = {
      zero: Math.max(...small.map((p) => handling.get(p.id)!.zeroToCruiseS)),
      stop: Math.max(...small.map((p) => handling.get(p.id)!.stopS)),
      turn: Math.max(...small.map((p) => handling.get(p.id)!.turn90S)),
      fwd: Math.min(...small.map((p) => handling.get(p.id)!.envelope.forward)),
    };
    for (const p of large) {
      const h = handling.get(p.id)!;
      expect(h.zeroToCruiseS, p.id).toBeGreaterThan(worstSmall.zero);
      expect(h.stopS, p.id).toBeGreaterThan(worstSmall.stop);
      expect(h.turn90S, p.id).toBeGreaterThan(worstSmall.turn);
      expect(h.envelope.forward, p.id).toBeLessThan(worstSmall.fwd);
    }
  });
});
