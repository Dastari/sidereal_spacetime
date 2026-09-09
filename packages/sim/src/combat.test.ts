import { describe, it, expect } from "vitest";
import {
  normalizedAim,
  aimIsFresh,
  recoveredEnergy,
  validateShot,
} from "./combat";
describe("authoritative weapon energy and aim", () => {
  it("normalizes intent and rejects nonfinite angles", () => {
    expect(normalizedAim(5 * Math.PI)).toBeCloseTo(Math.PI);
    expect(() => normalizedAim(NaN)).toThrow();
    expect(() => normalizedAim(Infinity)).toThrow();
  });
  it("expires aim and rejects future timestamps", () => {
    expect(aimIsFresh(true, 1n, 300001n)).toBe(true);
    expect(aimIsFresh(true, 1n, 300002n)).toBe(false);
    expect(aimIsFresh(true, 10n, 9n)).toBe(false);
  });
  it("recovers only elapsed time beyond delay, never double counts checkpoints, caps offline", () => {
    expect(recoveredEnergy(70, 100, 1_000_000n, 1_000_000n, 2_000_000n)).toBe(
      70,
    );
    expect(recoveredEnergy(70, 100, 1_000_000n, 1_000_000n, 3_000_000n)).toBe(
      76,
    );
    expect(recoveredEnergy(76, 100, 3_000_000n, 1_000_000n, 3_500_000n)).toBe(
      82,
    );
    expect(recoveredEnergy(70, 100, 1n, 1n, 999_000_000n)).toBe(100);
  });
  it("enforces cooldown and energy independently", () => {
    expect(() =>
      validateShot(100, 8, 250, 1_000_000n, 1_249_999n, true),
    ).toThrow("cooling");
    expect(() => validateShot(7, 8, 250, 1n, 2_000_000n, true)).toThrow(
      "energy",
    );
    expect(() =>
      validateShot(8, 8, 250, 1_000_000n, 1_250_000n, true),
    ).not.toThrow();
  });
});
