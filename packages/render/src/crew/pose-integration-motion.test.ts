import { describe, expect, it } from "vitest";
import {
  posePlacementHeading,
  relativePoseMovementYaw,
} from "./pose-integration-motion";

describe("game integration of equipment aim and travel", () => {
  it("keeps bound aim facing while travel strafes or reverses", () => {
    for (const travelHeading of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const placement = posePlacementHeading({
        currentHeading: 0,
        travelHeading,
        bound: true,
        active: true,
      });
      expect(placement).toBe(0);
      expect(
        Math.abs(relativePoseMovementYaw(travelHeading, placement)),
      ).toBeGreaterThan(1);
    }
  });

  it("preserves the existing travel-facing behavior when unbound, lowered or sprinting", () => {
    for (const mode of [
      { bound: false, active: true, sprinting: false },
      { bound: true, active: false, sprinting: false },
      { bound: true, active: true, sprinting: true },
    ]) {
      expect(
        posePlacementHeading({
          currentHeading: 0.7,
          travelHeading: -1.2,
          ...mode,
        }),
      ).toBe(-1.2);
    }
  });

  it("preserves stationary placement instead of inventing travel from a zero vector", () => {
    expect(
      posePlacementHeading({ currentHeading: 1.1, bound: true, active: false }),
    ).toBe(1.1);
  });

  it("wraps movement across the heading seam", () => {
    expect(relativePoseMovementYaw(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(
      0.2,
      10,
    );
    expect(relativePoseMovementYaw(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(
      -0.2,
      10,
    );
  });

  it("rejects non-finite headings before they reach character transforms", () => {
    expect(() =>
      posePlacementHeading({ currentHeading: NaN, bound: true, active: true }),
    ).toThrow("Non-finite");
    expect(() =>
      posePlacementHeading({
        currentHeading: 0,
        travelHeading: Infinity,
        bound: false,
        active: false,
      }),
    ).toThrow("Non-finite");
    expect(() => relativePoseMovementYaw(0, NaN)).toThrow("Non-finite");
  });
});
