import { describe, expect, it } from "vitest";
import {
  THROW_STANDOFF_M,
  blastDamage,
  pelletAngles,
  recoveredEnergy,
  reloadUntil,
  throwLanding,
} from "./combat";

describe("batch A weapon modes (pure rules)", () => {
  it("spreads pellets evenly and symmetrically around the aim", () => {
    const angles = pelletAngles(0.5, 8, 0.35);
    expect(angles).toHaveLength(8);
    expect(angles[0]).toBeCloseTo(0.5 - 0.175);
    expect(angles[7]).toBeCloseTo(0.5 + 0.175);
    const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
    expect(mean).toBeCloseTo(0.5);
    expect(pelletAngles(0.2, 1, 0.35)[0]).toBeCloseTo(0.2, 12);
    // wraps like any aim and is bounded
    expect(pelletAngles(Math.PI, 3, 0.2)[2]).toBeCloseTo(-Math.PI + 0.1);
    expect(pelletAngles(0, 1000, 0.3)).toHaveLength(32);
    expect(() => pelletAngles(NaN, 3, 0.2)).toThrow();
  });

  it("falls blast damage off linearly to the edge fraction, none outside", () => {
    expect(blastDamage(70, 0, 3.5, 0.35)).toBe(70);
    expect(blastDamage(70, 3.5, 3.5, 0.35)).toBeCloseTo(24.5);
    expect(blastDamage(70, 1.75, 3.5, 0.35)).toBeCloseTo(47.25);
    expect(blastDamage(70, 3.6, 3.5, 0.35)).toBe(0);
    expect(blastDamage(70, -1, 3.5, 0.35)).toBe(0);
    expect(blastDamage(0, 0, 3.5, 0.35)).toBe(0);
  });

  it("lands a throw short of the obstacle it struck, at range otherwise", () => {
    const wall = throwLanding([1, 2], 0, 5, true);
    expect(wall.distanceM).toBeCloseTo(5 - THROW_STANDOFF_M);
    expect(wall.x).toBeCloseTo(1);
    expect(wall.y).toBeCloseTo(2 + 5 - THROW_STANDOFF_M);
    const open = throwLanding([0, 0], Math.PI / 2, 14, false);
    expect(open.x).toBeCloseTo(14);
    expect(open.y).toBeCloseTo(0);
    expect(throwLanding([0, 0], 0, 0.1, true).distanceM).toBe(0);
  });

  it("holds a reload until its time and refills without passive recovery racing it", () => {
    const now = 10_000_000n;
    const until = reloadUntil(now, 1500);
    expect(until).toBe(11_500_000n);
    expect(() => reloadUntil(now, 0)).toThrow();
    // reload stores energy = capacity with the checkpoint at `until`: nothing changes before it
    expect(recoveredEnergy(120, 120, until, 5_000_000n, now)).toBe(120);
    expect(recoveredEnergy(120, 120, until, 5_000_000n, until + 1n)).toBe(120);
  });
});
