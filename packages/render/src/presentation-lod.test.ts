import { describe, expect, it } from "vitest";
import {
  assignCrewTiers,
  assignShipTiers,
  CREW_LOD,
  nextShipTier,
  projectedRadiusPx,
  SHIP_LOD,
} from "./presentation-lod";

describe("ship LOD (presentation only; never drops a perceived ship)", () => {
  it("projects a hull radius to screen pixels", () => {
    // 10 m at 100 m under a 90 degree fov on a 1000 px viewport: 10/100 * 500 = 50 px.
    expect(projectedRadiusPx(10, 100, Math.PI / 2, 1000)).toBeCloseTo(50);
    expect(projectedRadiusPx(10, 0, Math.PI / 2, 1000)).toBeCloseTo(500);
    expect(projectedRadiusPx(Number.NaN, 100, 1, 1000)).toBe(0);
  });

  it("switches tiers by projected size with hysteresis", () => {
    expect(nextShipTier(undefined, 80)).toBe(0);
    expect(nextShipTier(undefined, 50)).toBe(1);
    expect(nextShipTier(0, 50)).toBe(0); // inside the band: stays full
    expect(nextShipTier(0, SHIP_LOD.fullExitPx - 1)).toBe(1);
    expect(nextShipTier(1, SHIP_LOD.fullEnterPx - 1)).toBe(1);
    expect(nextShipTier(1, 6)).toBe(1);
    expect(nextShipTier(2, 6)).toBe(2);
    expect(nextShipTier(1, 3)).toBe(2);
    expect(nextShipTier(undefined, Number.NaN)).toBe(2);
  });

  it("demotes over-budget full exteriors to the proxy, never removing a ship", () => {
    const ships = Array.from({ length: 200 }, (_, i) => ({
      id: `ship-${String(i).padStart(3, "0")}`,
      px: 60 + i,
    }));
    const tiers = assignShipTiers(ships, 24);
    expect(tiers.size).toBe(200);
    const full = [...tiers].filter(([, t]) => t === 0).map(([id]) => id);
    expect(full).toHaveLength(24);
    // The 24 largest on screen keep full detail.
    expect(full.sort()).toEqual(
      ships
        .slice(-24)
        .map((s) => s.id)
        .sort(),
    );
    expect([...tiers.values()].every((t) => t === 0 || t === 1)).toBe(true);
  });
});

describe("crew LOD (replaces the 12-body cap)", () => {
  it("draws the nearest bodies in full and every other body as a marker", () => {
    const bodies = Array.from({ length: 100 }, (_, i) => ({
      id: `crew-${i}`,
      distanceM: i,
    }));
    const tiers = assignCrewTiers(bodies);
    expect(tiers.size).toBe(100);
    const full = [...tiers].filter(([, t]) => t === "full");
    expect(full).toHaveLength(CREW_LOD.fullBodyBudget);
    expect(full.map(([id]) => id)).toEqual(
      bodies.slice(0, CREW_LOD.fullBodyBudget).map((b) => b.id),
    );
  });

  it("keeps a full body at a near tie (no thrash at the budget edge)", () => {
    const tiers = assignCrewTiers(
      [
        { id: "a", distanceM: 5, previous: "full" },
        { id: "b", distanceM: 4.5, previous: "marker" },
      ],
      1,
    );
    expect(tiers.get("a")).toBe("full");
    expect(tiers.get("b")).toBe("marker");
    const swapped = assignCrewTiers(
      [
        { id: "a", distanceM: 5, previous: "full" },
        { id: "b", distanceM: 3, previous: "marker" },
      ],
      1,
    );
    expect(swapped.get("b")).toBe("full");
  });
});
