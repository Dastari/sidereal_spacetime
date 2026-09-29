import type {
  DeckCollisionFrame,
  DeckLocation,
} from "./construction-collision";
import { canOccupyDeck, sweepDeckCircle } from "./construction-collision";
import type { QualifiedFlightInstance } from "./construction-flight";
export class PilotGeometryError extends Error {}
/** Seat and approach points (ship-local metres). */
export interface PilotPose {
  position: readonly [number, number];
  approach: readonly [number, number];
}
/** Prefab stations: the seat is the derived pilot station, approached from 0.875 m aft. */
export const prefabPilotPose = (
  station: readonly [number, number],
): PilotPose => ({
  position: [station[0], station[1]],
  approach: [station[0], station[1] - 0.875],
});
export interface PilotGeometry {
  instance: QualifiedFlightInstance;
  frame: DeckCollisionFrame;
  seatPlacedObjectId: string;
  supportHeightAt(x: number, y: number): number | undefined;
  /** The re-derived station pose (prefab stations have no native seat collider). */
  pose: PilotPose;
}
const point = (
  frame: DeckCollisionFrame,
  x: number,
  y: number,
): DeckLocation => ({
  shipId: frame.shipId,
  deckId: frame.deckId,
  position: [x, y],
});
export function qualifyPilotGeometry(g: PilotGeometry) {
  const { instance, frame } = g;
  if (frame.shipId !== instance.id || frame.deckId !== instance.spawnDeckId)
    throw new PilotGeometryError("Pilot instance/deck frame mismatch");
  return qualifyPoseGeometry(g, g.pose);
}
export function canApproachPilot(
  frame: DeckCollisionFrame,
  x: number,
  y: number,
  pose: PilotPose,
) {
  const approach = pose.approach;
  if (
    !canOccupyDeck(frame, point(frame, x, y), 0.3) ||
    Math.hypot(x - approach[0], y - approach[1]) > 1.8
  )
    return false;
  const sweep = sweepDeckCircle(
    frame,
    point(frame, x, y),
    [approach[0] - x, approach[1] - y],
    0.3,
  );
  return (
    Math.hypot(
      sweep.position[0] - approach[0],
      sweep.position[1] - approach[1],
    ) < 1e-5
  );
}
/** Station seats: no native seat collider; the station itself must be supported, clear and
 * reachable from its approach point. The station pose is re-derived by the caller. */
function qualifyPoseGeometry(g: PilotGeometry, pose: PilotPose) {
  const frame = g.frame;
  const approachHeight = g.supportHeightAt(pose.approach[0], pose.approach[1]),
    seatHeight = g.supportHeightAt(pose.position[0], pose.position[1]);
  if (
    !Number.isFinite(approachHeight) ||
    !Number.isFinite(seatHeight) ||
    Math.abs(approachHeight! - 0.1875) > 0.05 ||
    Math.abs(seatHeight! - 0.1875) > 0.05
  )
    throw new PilotGeometryError("Pilot support surface is unqualified");
  if (
    !canOccupyDeck(
      frame,
      point(frame, pose.approach[0], pose.approach[1]),
      0.3,
    ) ||
    !canOccupyDeck(frame, point(frame, pose.position[0], pose.position[1]), 0.3)
  )
    throw new PilotGeometryError("Pilot approach/seat is obstructed");
  const swept = sweepDeckCircle(
    frame,
    point(frame, pose.approach[0], pose.approach[1]),
    [pose.position[0] - pose.approach[0], pose.position[1] - pose.approach[1]],
    0.3,
  );
  if (
    Math.hypot(
      swept.position[0] - pose.position[0],
      swept.position[1] - pose.position[1],
    ) > 1e-5
  )
    throw new PilotGeometryError("Pilot seating transition is obstructed");
  return {
    frame,
    transition: frame,
    approachHeight: approachHeight!,
    seatHeight: seatHeight!,
  };
}
/** Recovery considers a bounded same-deck area and never crosses a wall or uses
 * the seat exception for ordinary walking. Call only for a currently seated actor. */
export function pilotRecoveryPoint(
  g: PilotGeometry,
  nearby: readonly { id: string; x: number; y: number }[],
  actorId: string,
) {
  if (nearby.length > 128)
    throw new PilotGeometryError("Pilot recovery occupancy budget exceeded");
  const q = qualifyPilotGeometry(g);
  const pose = g.pose;
  for (const [dx, dy] of [
    [0, 0],
    [-0.375, 0],
    [0.375, 0],
    [0, -0.375],
    [-0.375, -0.375],
    [0.375, -0.375],
    [-0.75, 0],
    [0.75, 0],
  ] as const) {
    const x = pose.approach[0] + dx,
      y = pose.approach[1] + dy;
    const h = g.supportHeightAt(x, y);
    if (
      !Number.isFinite(h) ||
      Math.abs(h! - 0.1875) > 0.05 ||
      !canOccupyDeck(q.frame, point(q.frame, x, y), 0.3) ||
      nearby.some((a) => a.id !== actorId && Math.hypot(a.x - x, a.y - y) < 0.6)
    )
      continue;
    const sweep = sweepDeckCircle(
      q.transition,
      point(q.frame, pose.position[0], pose.position[1]),
      [x - pose.position[0], y - pose.position[1]],
      0.3,
    );
    if (Math.hypot(sweep.position[0] - x, sweep.position[1] - y) < 1e-5)
      return { x, y, height: h! };
  }
  return undefined;
}
