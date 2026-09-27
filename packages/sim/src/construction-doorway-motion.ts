import type { Point } from "@sidereal/content/ship-layout";
import { transformPoint } from "@sidereal/content/ship-layout";
import { DOORWAY250_VISUALS } from "@sidereal/content/construction-doorway-visuals";
import type { DeckObstacle } from "./construction-collision";

/** Deliberately separate from the retained reflected legacy door-motion frame. */
export interface Doorway250Frame {
  id: string;
  origin: Point;
  quarterTurns: number;
  leafSha256: string;
}
const leafSha256 = DOORWAY250_VISUALS.parts.find(
  (part) => part.part === "leaf",
)!.sha256;
const hinge: Point = [0.3125, 0.0625];
// Conservative outward-rounded bounds of every actual leaf vertex and both
// gasket morph endpoints, verified against the exact retained GLBs by tests.
const bounds = { min: [0.3125, 0] as Point, max: [1.635, 0.096501] as Point };
function valid(frame: Doorway250Frame) {
  if (
    !frame.id ||
    frame.id.length > 160 ||
    frame.leafSha256 !== leafSha256 ||
    frame.origin.length !== 2 ||
    !frame.origin.every((n) => Number.isFinite(n) && Math.abs(n) <= 256) ||
    ![0, 1, 2, 3].includes(frame.quarterTurns)
  )
    throw Error("Invalid pinned inward doorway frame");
}
function corners(): Point[] {
  return [
    [bounds.min[0], bounds.min[1]],
    [bounds.max[0], bounds.min[1]],
    [bounds.max[0], bounds.max[1]],
    [bounds.min[0], bounds.max[1]],
  ];
}
function world(frame: Doorway250Frame, point: Point): Point {
  const p = transformPoint(point, frame.quarterTurns);
  return [frame.origin[0] + p[0], frame.origin[1] + p[1]];
}
export function doorway250LeafObstacle(
  frame: Doorway250Frame,
  fraction: number,
): DeckObstacle {
  valid(frame);
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    throw Error("Invalid inward doorway fraction");
  const angle = (fraction * Math.PI) / 2,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    id: "door-leaf:" + frame.id,
    definitionId: "doorway250-r004-conservative-leaf",
    vertices: corners().map((p) => {
      const x = p[0] - hinge[0],
        y = p[1] - hinge[1];
      return world(frame, [hinge[0] + c * x - s * y, hinge[1] + s * x + c * y]);
    }),
  };
}
function sweptBounds() {
  const samples: Point[] = [];
  for (const p of corners()) {
    const x = p[0] - hinge[0],
      y = p[1] - hinge[1],
      start = Math.atan2(y, x),
      end = start + Math.PI / 2,
      r = Math.hypot(x, y);
    const angles = [start, end];
    for (let k = -2; k <= 2; k++) {
      const angle = (k * Math.PI) / 2;
      if (angle > start && angle < end) angles.push(angle);
    }
    samples.push(
      ...angles.map(
        (angle) =>
          [
            hinge[0] + Math.cos(angle) * r,
            hinge[1] + Math.sin(angle) * r,
          ] as Point,
      ),
    );
  }
  return {
    min: [
      Math.min(...samples.map((p) => p[0])),
      Math.min(...samples.map((p) => p[1])),
    ] as Point,
    max: [
      Math.max(...samples.map((p) => p[0])),
      Math.max(...samples.map((p) => p[1])),
    ] as Point,
  };
}
const sweep = sweptBounds();
/** Conservative continuous sweep. Authority still owns actor filtering, revision,
 * obstruction timing, accepted hinge state and any future seal sequencing. */
export function doorway250SweepOccupied(
  frame: Doorway250Frame,
  bodies: readonly { position: Point; radius: number }[],
) {
  valid(frame);
  if (bodies.length > 256)
    throw Error("Inward doorway occupant budget exceeded");
  return bodies.some((body) => {
    if (
      body.position.length !== 2 ||
      !body.position.every(Number.isFinite) ||
      !Number.isFinite(body.radius) ||
      body.radius <= 0 ||
      body.radius > 4
    )
      throw Error("Invalid inward doorway occupant");
    const p = transformPoint(
      [body.position[0] - frame.origin[0], body.position[1] - frame.origin[1]],
      (4 - frame.quarterTurns) % 4,
    );
    const x = Math.max(sweep.min[0], Math.min(sweep.max[0], p[0])),
      y = Math.max(sweep.min[1], Math.min(sweep.max[1], p[1]));
    return Math.hypot(p[0] - x, p[1] - y) <= body.radius + 1e-8;
  });
}
