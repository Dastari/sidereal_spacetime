import type {
  DeckCollisionFrame,
  DeckLocation,
} from "./construction-collision";
import { canOccupyDeck, sweepDeckCircle } from "./construction-collision";
import { qualifiedWayfarerInstanceObstacles } from "./wayfarer-walking-bindings";
import type { QualifiedFlightInstance } from "./construction-flight";
export const QUALIFIED_PILOT_APPROACH = [0, 9.375] as const;
export const QUALIFIED_PILOT_POSITION = [0, 10.25] as const;
export interface PilotGeometry {
  instance: QualifiedFlightInstance;
  frame: DeckCollisionFrame;
  seatPlacedObjectId: string;
  supportHeightAt(x: number, y: number): number | undefined;
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
    throw Error("Pilot instance/deck frame mismatch");
  const expected = qualifiedWayfarerInstanceObstacles(instance, frame.deckId);
  const map = JSON.parse(instance.idMapJson) as {
    objects: { sourceId: string; instanceId: string }[];
  };
  if (
    !map.objects.some(
      (m) =>
        m.sourceId === "equipment-control-seat" &&
        m.instanceId === g.seatPlacedObjectId,
    )
  )
    throw Error("Exact native pilot seat mapping required");
  const own = frame.obstacles.filter((o) =>
    o.id.startsWith(g.seatPlacedObjectId + ":"),
  );
  const source = expected.filter((o) =>
    o.id.startsWith(g.seatPlacedObjectId + ":"),
  );
  if (
    own.length !== 1 ||
    source.length !== 1 ||
    JSON.stringify(own[0].vertices) !== JSON.stringify(source[0].vertices)
  )
    throw Error("Exact native pilot seat collider required");
  const segments = new Set(
    own.flatMap((o) =>
      o.vertices.map((_, i) => `obstacle:${JSON.stringify([o.id, i])}`),
    ),
  );
  if (frame.segments.filter((s) => segments.has(s.id)).length !== segments.size)
    throw Error("Complete native pilot seat edges required");
  const transition = {
    ...frame,
    obstacles: frame.obstacles.filter((o) => !own.includes(o)),
    segments: frame.segments.filter((s) => !segments.has(s.id)),
  };
  const approachHeight = g.supportHeightAt(...QUALIFIED_PILOT_APPROACH),
    seatHeight = g.supportHeightAt(...QUALIFIED_PILOT_POSITION);
  if (
    !Number.isFinite(approachHeight) ||
    !Number.isFinite(seatHeight) ||
    Math.abs(approachHeight! - 0.1875) > 0.05 ||
    Math.abs(seatHeight! - 0.1875) > 0.05
  )
    throw Error("Pilot support surface is unqualified");
  if (
    !canOccupyDeck(frame, point(frame, ...QUALIFIED_PILOT_APPROACH), 0.3) ||
    !canOccupyDeck(transition, point(frame, ...QUALIFIED_PILOT_POSITION), 0.3)
  )
    throw Error("Pilot approach/seat is obstructed");
  const swept = sweepDeckCircle(
    transition,
    point(frame, ...QUALIFIED_PILOT_APPROACH),
    [0, QUALIFIED_PILOT_POSITION[1] - QUALIFIED_PILOT_APPROACH[1]],
    0.3,
  );
  if (
    Math.hypot(
      swept.position[0],
      swept.position[1] - QUALIFIED_PILOT_POSITION[1],
    ) > 1e-5
  )
    throw Error("Pilot seating transition is obstructed");
  return {
    frame,
    transition,
    approachHeight: approachHeight!,
    seatHeight: seatHeight!,
  };
}
export function canApproachPilot(
  frame: DeckCollisionFrame,
  x: number,
  y: number,
) {
  if (
    !canOccupyDeck(frame, point(frame, x, y), 0.3) ||
    Math.hypot(
      x - QUALIFIED_PILOT_APPROACH[0],
      y - QUALIFIED_PILOT_APPROACH[1],
    ) > 1.8
  )
    return false;
  const sweep = sweepDeckCircle(
    frame,
    point(frame, x, y),
    [QUALIFIED_PILOT_APPROACH[0] - x, QUALIFIED_PILOT_APPROACH[1] - y],
    0.3,
  );
  return (
    Math.hypot(
      sweep.position[0] - QUALIFIED_PILOT_APPROACH[0],
      sweep.position[1] - QUALIFIED_PILOT_APPROACH[1],
    ) < 1e-5
  );
}
/** Recovery considers a bounded same-deck area and never crosses a wall or uses
 * the seat exception for ordinary walking. Call only for a currently seated actor. */
export function pilotRecoveryPoint(
  g: PilotGeometry,
  nearby: readonly { id: string; x: number; y: number }[],
  actorId: string,
) {
  if (nearby.length > 128)
    throw Error("Pilot recovery occupancy budget exceeded");
  const q = qualifyPilotGeometry(g);
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
    const x = QUALIFIED_PILOT_APPROACH[0] + dx,
      y = QUALIFIED_PILOT_APPROACH[1] + dy;
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
      point(q.frame, ...QUALIFIED_PILOT_POSITION),
      [x - QUALIFIED_PILOT_POSITION[0], y - QUALIFIED_PILOT_POSITION[1]],
      0.3,
    );
    if (Math.hypot(sweep.position[0] - x, sweep.position[1] - y) < 1e-5)
      return { x, y, height: h! };
  }
  return undefined;
}
