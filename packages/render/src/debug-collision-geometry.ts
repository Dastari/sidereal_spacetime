import type {
  DeckCollisionFrame,
  DeckColliderSegment,
} from "../../sim/src/construction-collision";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface DebugCollisionFrame {
  id: string;
  /** Human-readable source coverage, including any omitted private dynamics. */
  scope?: string;
  /** Exact resolved shared-simulation frame, including current door passability. */
  frame: DeckCollisionFrame;
  /** Presentation transform only; frame coordinates remain ship-local metres. */
  world: Matrix;
}

function capsule(segment: DeckColliderSegment, height: number) {
  const { a, b, halfWidthM: radius } = segment;
  const point = (x: number, y: number) => new Vector3(x, height, -y);
  if (radius === 0) return [point(...a), point(...b)];
  const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const points: Vector3[] = [];
  for (const [end, start] of [
    [b, heading - Math.PI / 2],
    [a, heading + Math.PI / 2],
  ] as const)
    for (let i = 0; i <= 8; i++) {
      const angle = start + (i * Math.PI) / 8;
      points.push(
        point(
          end[0] + Math.cos(angle) * radius,
          end[1] + Math.sin(angle) * radius,
        ),
      );
    }
  return [...points, points[0].clone()];
}

/** Collision is planar authority geometry at its actual deck elevation. It is
 * never inferred from visible models, their AABBs, or guessed wall heights.
 */
export function collisionDebugGeometry(source: DebugCollisionFrame) {
  const { frame, world } = source;
  const height = frame.elevationM + 0.025;
  const polygon = (vertices: readonly (readonly [number, number])[]) =>
    [...vertices, vertices[0]].map(([x, y]) => new Vector3(x, height, -y));
  const transform = (lines: Vector3[][]) =>
    lines.map((line) =>
      line.map((point) => Vector3.TransformCoordinates(point, world)),
    );
  return {
    floors: transform(frame.floors.map(polygon)),
    blockers: transform([
      ...frame.segments.map((segment) => capsule(segment, height)),
      ...frame.obstacles.map((obstacle) => polygon(obstacle.vertices)),
    ]),
  };
}
