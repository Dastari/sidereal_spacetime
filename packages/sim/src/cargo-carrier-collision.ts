import type { Point } from "@sidereal/content/ship-layout";
import { inside, properCross } from "./layout-geometry";
import {
  canOccupyDeck,
  type DeckCollisionFrame,
  type DeckObstacle,
} from "./construction-collision";
import {
  carrierInterface,
  requireSecuredCargoAssembly,
  type SecuredCargoAssembly,
} from "./cargo-carrier-assembly";
import type { CargoPlacement } from "./construction-cargo";

export interface CargoCollisionBinding {
  assembly: SecuredCargoAssembly;
  placement: CargoPlacement;
  revision: bigint;
}
/** Replaces only the caller's server-qualified cargo placed identities. This is
 * also used for preflight before installing the replacement, never as client data. */
export function withoutAdoptedCargo(
  frame: DeckCollisionFrame,
  placedIds: readonly string[],
): DeckCollisionFrame {
  if (
    placedIds.length > 512 ||
    new Set(placedIds).size !== placedIds.length ||
    placedIds.some((id) => !id || id.length > 180)
  )
    throw Error("Bounded unique cargo adoption identities required");
  const matches = (id: string) =>
    placedIds.some((placed) => id === placed || id.startsWith(placed + ":"));
  return {
    ...frame,
    obstacles: frame.obstacles.filter((o) => !matches(o.id)),
    segments: frame.segments.filter((s) => !matches(s.id)),
  };
}

export function applyCargoCarrierCollision(
  frame: DeckCollisionFrame,
  bindings: readonly CargoCollisionBinding[],
): DeckCollisionFrame {
  if (!bindings.length) return frame;
  if (
    bindings.length > 256 ||
    new Set(bindings.map((b) => b.assembly.containerId)).size !==
      bindings.length
  )
    throw Error("Bounded unique cargo collision bindings required");
  const base = withoutAdoptedCargo(
    frame,
    bindings.flatMap((b) => [
      b.assembly.placedObjectId,
      `cargo-carrier:${b.assembly.carrierId}`,
    ]),
  );
  const obstacles: DeckObstacle[] = [];
  for (const { assembly, placement } of bindings) {
    requireSecuredCargoAssembly(assembly);
    if (
      assembly.instanceId !== frame.shipId ||
      assembly.deckId !== frame.deckId ||
      placement.containerId !== assembly.containerId ||
      placement.interfaceId !== carrierInterface(assembly.carrierSize).id
    )
      throw Error(
        "Cargo collision belongs to another instance/deck or payload",
      );
    const size = carrierInterface(assembly.carrierSize).size,
      x = placement.origin[0] / 32,
      y = placement.origin[1] / 32;
    const w = size[0] / 32,
      d = size[1] / 32;
    if (
      ![...placement.origin, placement.quarterTurns].every(Number.isInteger) ||
      placement.origin.some((n) => Math.abs(n) > 8192) ||
      placement.quarterTurns < 0 ||
      placement.quarterTurns > 3
    )
      throw Error("Invalid cargo collision transform");
    // The continuous lower deck occupies the entire nominal footprint. It is not
    // a walkable stair; upper open-frame voids are not represented as solid3D.
    obstacles.push({
      id: `cargo-carrier:${assembly.carrierId}`,
      definitionId: CARRIER_COLLISION_REVISION,
      vertices: [
        [x, y],
        [x + w, y],
        [x + w, y + d],
        [x, y + d],
      ],
    });
  }
  return {
    ...base,
    fingerprint: `${base.fingerprint.split(":cargo:")[0]}:cargo:${bindings
      .map((b) => `${b.assembly.carrierId}/${b.revision}`)
      .sort()
      .join("|")}`,
    obstacles: [...base.obstacles, ...obstacles],
    segments: [
      ...base.segments,
      ...obstacles.flatMap((o) =>
        o.vertices.map((a, i) => ({
          id: `${o.id}:${i}`,
          a,
          b: o.vertices[(i + 1) % o.vertices.length]!,
          halfWidthM: 0,
        })),
      ),
    ],
  };
}
export const CARRIER_COLLISION_REVISION =
  "carrier-continuous-base-footprint-r001";
/** Equipment is floor-bearing, not wall-mounted. Touching a structural wall is
 * not a permitted mount; reserve one nominal lattice unit beside the envelope. */
export const CARGO_STRUCTURE_CLEARANCE_M = 1 / 32;

function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const x = b[0] - a[0],
    y = b[1] - a[1],
    length = x * x + y * y;
  const t = length
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / length))
    : 0;
  return Math.hypot(p[0] - a[0] - t * x, p[1] - a[1] - t * y);
}
function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  if (properCross(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/** Rectangle must have supported corners and no remaining boundary/obstacle
 * crossing or enclosed in its interior. This excludes floor holes and machinery. */
export function qualifyCargoRectangle(
  frame: DeckCollisionFrame,
  rectangle: readonly [number, number, number, number],
  structureClearanceM = 0,
) {
  const [x0, y0, x1, y1] = rectangle;
  if (
    !rectangle.every(Number.isFinite) ||
    x0 >= x1 ||
    y0 >= y1 ||
    !Number.isFinite(structureClearanceM) ||
    structureClearanceM < 0 ||
    structureClearanceM > 1
  )
    return false;
  const corners: Point[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  if (
    !corners.every((position) =>
      canOccupyDeck(
        frame,
        { shipId: frame.shipId, deckId: frame.deckId, position },
        Math.max(0.000001, structureClearanceM),
      ),
    )
  )
    return false;
  const strictInside = (p: Point) =>
    p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;
  if (
    frame.segments.some(
      (s) =>
        !Number.isFinite(s.halfWidthM) ||
        s.halfWidthM < 0 ||
        strictInside(s.a) ||
        strictInside(s.b) ||
        corners.some(
          (a, i) =>
            segmentDistance(a, corners[(i + 1) % 4]!, s.a, s.b) <
            s.halfWidthM + structureClearanceM + 1e-8,
        ),
    )
  )
    return false;
  if (
    frame.obstacles.some(
      (o) =>
        o.vertices.some(strictInside) ||
        corners.some((p) => inside(p, o.vertices)) ||
        o.vertices.some((a, i) =>
          corners.some(
            (b, j) =>
              segmentDistance(
                a,
                o.vertices[(i + 1) % o.vertices.length]!,
                b,
                corners[(j + 1) % 4]!,
              ) <
              structureClearanceM + 1e-8,
          ),
        ),
    )
  )
    return false;
  return true;
}
