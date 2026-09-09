import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { aimRotation } from "./pose-math";
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

  it("rotates a forward foot displacement along travel after the solved body transform", () => {
    for (const { heading, torsoYaw, travelHeading } of [
      { heading: 0, torsoYaw: 0, travelHeading: Math.PI / 2 },
      { heading: 0, torsoYaw: 0, travelHeading: Math.PI },
      { heading: 0.8, torsoYaw: 0.31, travelHeading: -1.2 },
      { heading: -2.7, torsoYaw: -0.43, travelHeading: 2.8 },
    ]) {
      const achieved = heading + torsoYaw;
      const relative = relativePoseMovementYaw(travelHeading, achieved);
      const forward = new Vector3(0, 0, -0.24);
      // This is the solver's foot correction in its current achieved body frame.
      const offset = new Vector3(
        Math.sin(relative) * -forward.z,
        0,
        (1 - Math.cos(relative)) * -forward.z,
      );
      const body = Matrix.FromQuaternionToRef(
        aimRotation(achieved, 0),
        Matrix.Identity(),
      );
      const world = Vector3.TransformNormal(forward.add(offset), body);
      const expected = new Vector3(
        Math.sin(travelHeading) * 0.24,
        0,
        -Math.cos(travelHeading) * 0.24,
      );
      expect(Vector3.Distance(world, expected)).toBeLessThan(1e-7);
      expect(world.length()).toBeCloseTo(forward.length(), 7);
    }
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
