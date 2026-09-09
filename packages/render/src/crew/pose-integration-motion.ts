export interface PosePlacementMotion {
  /** Positive ship-frame heading: zero faces renderer -Z. */
  currentHeading: number;
  /** Omit when stationary or seated; the caller owns the seat-facing override. */
  travelHeading?: number;
  bound: boolean;
  active: boolean;
  sprinting?: boolean;
}

/** Keep travel independent of placement while the bound solver controls aim.
 * Renderer rotation.y is the negative of this heading. This never changes an
 * authoritative actor transform or the solver's internal visual heading.
 */
export function posePlacementHeading(input: PosePlacementMotion): number {
  if (
    !Number.isFinite(input.currentHeading) ||
    (input.travelHeading !== undefined && !Number.isFinite(input.travelHeading))
  )
    throw new Error("Non-finite pose placement heading");
  if (
    input.travelHeading === undefined ||
    (input.bound && input.active && !input.sprinting)
  )
    return input.currentHeading;
  return input.travelHeading;
}

/** Foot offsets use the current solve's achieved frame (heading + torsoYaw).
 * Supplying only the root heading rotates travel by the torso contribution again.
 * Call during the solve to avoid a frame of feedback from prior diagnostics.
 */
export function relativePoseMovementYaw(
  travelHeading: number,
  achievedYaw: number,
): number {
  if (![travelHeading, achievedYaw].every(Number.isFinite))
    throw new Error("Non-finite pose movement heading");
  const difference = travelHeading - achievedYaw;
  return Math.atan2(Math.sin(difference), Math.cos(difference));
}
