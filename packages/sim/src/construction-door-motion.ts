import type { Point } from "@sidereal/content/ship-layout";
import { transformPoint } from "@sidereal/content/ship-layout";
import type { DeckObstacle } from "./construction-collision";
import boundary from "@sidereal/content/construction-boundary-interfaces.json";

/** Geometry and motion only. This candidate has no gasket, pressure rating, powered
 * actuator rating or native damage adapter. Authority supplies permission and time. */
export interface HingedDoorFrame {
  id: string;
  origin: Point;
  quarterTurns: number;
}
export interface DoorMotion {
  fraction: number;
  targetOpen: boolean;
  blocked: boolean;
}
const fail = (condition: boolean, message: string) => {
  if (!condition) throw Error("Construction door: " + message);
};
function validateFrame(frame: HingedDoorFrame) {
  fail(
    typeof frame.id === "string" &&
      frame.id.length > 0 &&
      frame.id.length <= 160,
    "invalid identity",
  );
  fail(
    frame.origin.length === 2 &&
      frame.origin.every((n) => Number.isFinite(n) && Math.abs(n) <= 256) &&
      [0, 1, 2, 3].includes(frame.quarterTurns),
    "invalid metre frame",
  );
}
function transform(frame: HingedDoorFrame, p: Point): Point {
  const q = transformPoint(p, frame.quarterTurns);
  return [q[0] + frame.origin[0], q[1] + frame.origin[1]];
}
export function validateDoorMotion(state: DoorMotion) {
  fail(
    Number.isFinite(state.fraction) &&
      state.fraction >= 0 &&
      state.fraction <= 1 &&
      typeof state.targetOpen === "boolean" &&
      typeof state.blocked === "boolean",
    "invalid motion state",
  );
}
/** Conservative source bounds include the authored hinge straps, not just the slab.
 * Exact bound translation is retained; no cursor-derived or independent leaf motion. */
export function doorLeafObstacle(
  frame: HingedDoorFrame,
  fraction: number,
): DeckObstacle {
  validateFrame(frame);
  fail(
    Number.isFinite(fraction) && fraction >= 0 && fraction <= 1,
    "invalid leaf angle",
  );
  const part = boundary.parts.find((p) => p.id === "door-leaf")!;
  const [hx, hy] = boundary.door.leafBindTranslationBlenderM;
  const [x0, y0] = part.visual.localBounds.min,
    [x1, y1] = part.visual.localBounds.max;
  const angle = ((boundary.door.openAngleDegrees * Math.PI) / 180) * fraction,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const vertices = (
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as Point[]
  ).map(([x, y]) => transform(frame, [hx + c * x - s * y, hy + s * x + c * y]));
  return {
    id: "door-leaf:" + frame.id,
    definitionId: "boundary-r001-conservative-leaf",
    vertices,
  };
}
/** Entire hinge swept envelope is reserved while moving. This is deliberately
 * conservative: it can refuse a safe near-edge action, but cannot sweep through a
 * character between sampled angles. Narrow swept-volume refinement is future work. */
export function doorSweepOccupied(
  frame: HingedDoorFrame,
  bodies: readonly { position: Point; radius: number }[],
): boolean {
  validateFrame(frame);
  fail(bodies.length <= 256, "occupant budget");
  const box = boundary.door.conservativeSweepAabbBlenderM;
  for (const body of bodies) {
    fail(
      body.position.length === 2 &&
        body.position.every(Number.isFinite) &&
        Number.isFinite(body.radius) &&
        body.radius > 0 &&
        body.radius <= 4,
      "invalid occupant",
    );
    const p = transformPoint(
      [body.position[0] - frame.origin[0], body.position[1] - frame.origin[1]],
      (4 - frame.quarterTurns) % 4,
    );
    const x = Math.max(box.min[0], Math.min(box.max[0], p[0])),
      y = Math.max(box.min[1], Math.min(box.max[1], p[1]));
    if (Math.hypot(x - p[0], y - p[1]) <= body.radius + 1e-8) return true;
  }
  return false;
}
/** Completion gates passage; partial opening never makes a full-width opening passable. */
export function doorMotionStep(
  state: DoorMotion,
  deltaSeconds: number,
  durationSeconds: number,
  obstructed: boolean,
): DoorMotion {
  validateDoorMotion(state);
  fail(
    Number.isFinite(deltaSeconds) &&
      deltaSeconds >= 0 &&
      deltaSeconds <= 0.25 &&
      Number.isFinite(durationSeconds) &&
      durationSeconds >= 0.1 &&
      durationSeconds <= 60 &&
      typeof obstructed === "boolean",
    "invalid time/obstruction",
  );
  const target = state.targetOpen ? 1 : 0;
  if (state.fraction === target) return { ...state, blocked: false };
  if (obstructed) return { ...state, blocked: true };
  const direction = state.targetOpen ? 1 : -1;
  const fraction = Math.max(
    0,
    Math.min(1, state.fraction + (direction * deltaSeconds) / durationSeconds),
  );
  return {
    ...state,
    fraction: Math.abs(fraction - target) < 1e-9 ? target : fraction,
    blocked: false,
  };
}
