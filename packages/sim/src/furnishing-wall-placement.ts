import {
  FURNISHING_DEFAULT,
  WAYFARER_WALL_FURNISHINGS,
  transformFurnishingPoint,
  type FurnishingOverride,
} from "@sidereal/content/wayfarer-furnishings";
import {
  isWayfarerGameplay,
  WAYFARER_FLOOR_HEIGHT,
  WAYFARER_GAMEPLAY_OBJECTS,
} from "@sidereal/content/wayfarer-authored-gameplay";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";

type Point = readonly [number, number];
export interface FurnishingWallSurface {
  id: string;
  a: Point;
  b: Point;
  /** Unit normal towards the usable room, in source plan metres. */
  normal: Point;
  minZ: number;
  maxZ: number;
}
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
const CONTACT = 0.002;
const TOLERANCE = 0.00001;
const height = WAYFARER_FLOOR_HEIGHT;

/** Trusted r001 architectural faces, not arbitrary prop bounding boxes.
 * Perimeter planes follow the pinned wall-panel inner backing faces. Chamfer
 * coordinates come from WALL_*_chamfer placement matrices, with their real
 * lower canopy-wall height. Bulkhead faces preserve its physical doorway.
 * Partition faces derive from the actual convex footprint, never its AABB. */
export function furnishingWallSurfaces(
  doc: ShipPrefabDocumentV1,
): FurnishingWallSurface[] {
  if (!isWayfarerGameplay(doc)) return [];
  const result: FurnishingWallSurface[] = [];
  const add = (id: string, a: Point, b: Point, normal: Point, top: number) => {
    result.push({ id, a, b, normal, minZ: height, maxZ: height + top });
  };
  add("hull:far", [-10.75, -5.5], [8.13137, -5.5], [0, 1], 1.75);
  add("hull:near", [-10.75, 5.5], [8.13137, 5.5], [0, -1], 1.75);
  add("hull:stern", [-10.75, -5.5], [-10.75, 5.5], [1, 0], 1.75);
  const q = Math.SQRT1_2;
  // Merged only within equal-height, collinear source panel runs. No false
  // rectangles over cockpit corners or support through the canopy glass.
  for (const [side, x, y, width, top] of [
    [1, 8.838477, 6.075736, 1.95, 1.75],
    [1, 10.217336, 4.696877, 3.335281, 1.17],
    [-1, 10.217336, -4.696877, 1.95, 1.75],
    [-1, 12.575736, -2.338478, 3.335281, 1.17],
  ]) {
    const tangent: Point = [side * q, -q],
      normal: Point = [-q, -side * q],
      a: Point = [x + normal[0], y + normal[1]],
      b: Point = [a[0] + tangent[0] * width, a[1] + tangent[1] * width];
    add(`hull:chamfer:${side}:${top}`, a, b, normal, top);
  }
  for (const [lo, hi] of [
    [-5.5, -0.63],
    [0.63, 5.5],
  ]) {
    add(`bulkhead:aft:${lo}`, [4.42, lo], [4.42, hi], [-1, 0], 2.19);
    add(`bulkhead:fore:${lo}`, [5.08, lo], [5.08, hi], [1, 0], 2.19);
  }
  for (const source of WAYFARER_GAMEPLAY_OBJECTS.filter(
    (o) => o.role === "partition",
  )) {
    const p = source.footprint,
      signed = p.reduce(
        (sum, a, i) =>
          sum +
          a[0] * p[(i + 1) % p.length][1] -
          p[(i + 1) % p.length][0] * a[1],
        0,
      );
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      // End caps too narrow to host any portable fixture are not mount faces.
      if (length < 0.35) continue;
      const sign = signed > 0 ? 1 : -1;
      result.push({
        id: `${source.object}:${i}`,
        a,
        b,
        normal: [(sign * dy) / length, (-sign * dx) / length],
        minZ: source.min[2],
        maxZ: source.max[2],
      });
    }
  }
  return result;
}
function wallFixture(id: string) {
  return Object.hasOwn(WAYFARER_WALL_FURNISHINGS, id)
    ? WAYFARER_WALL_FURNISHINGS[id]
    : undefined;
}
function originalCentre(id: string): [number, number] {
  const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!;
  return [
    (source.min[0] + source.max[0]) / 2,
    (source.min[1] + source.max[1]) / 2,
  ];
}
function onFace(
  id: string,
  face: FurnishingWallSurface,
  pointer: Point,
  snap: boolean,
): FurnishingOverride | undefined {
  const mount = wallFixture(id);
  if (
    !mount ||
    mount.minZ < face.minZ - TOLERANCE ||
    mount.maxZ > face.maxZ + TOLERANCE
  )
    return;
  const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!,
    centre = originalCentre(id),
    yaw =
      Math.atan2(face.normal[1], face.normal[0]) -
      Math.atan2(mount.normal[1], mount.normal[0]),
    rotated = source.footprint.map((p) =>
      transformFurnishingPoint(source, p, { ...FURNISHING_DEFAULT, yaw }),
    ),
    tx = face.b[0] - face.a[0],
    ty = face.b[1] - face.a[1],
    length = Math.hypot(tx, ty),
    tangent: Point = [tx / length, ty / length],
    relative = rotated.map(
      (p) => [p[0] - centre[0], p[1] - centre[1]] as Point,
    ),
    minT = Math.min(...relative.map((p) => dot(p, tangent))),
    maxT = Math.max(...relative.map((p) => dot(p, tangent))),
    minN = Math.min(...relative.map((p) => dot(p, face.normal))),
    raw = dot([pointer[0] - face.a[0], pointer[1] - face.a[1]], tangent),
    along = snap ? Math.round(raw / 0.25) * 0.25 : raw;
  if (along + minT < -TOLERANCE || along + maxT > length + TOLERANCE) return;
  const x = face.a[0] + tangent[0] * along + face.normal[0] * (CONTACT - minN),
    y = face.a[1] + tangent[1] * along + face.normal[1] * (CONTACT - minN);
  return {
    dx: round(x - centre[0]),
    dy: round(y - centre[1]),
    yaw: round(yaw),
    snap,
    deleted: false,
  };
}
/** Pointer chooses a nearby real face; XY snapping moves along its tangent only. */
export function wallFurnishingPlacement(
  doc: ShipPrefabDocumentV1,
  id: string,
  pointer: Point,
  snap: boolean,
  maxDistance = 0.75,
): FurnishingOverride | undefined {
  if (
    !pointer.every(Number.isFinite) ||
    !Number.isFinite(maxDistance) ||
    maxDistance < 0
  )
    return;
  const candidates = furnishingWallSurfaces(doc).flatMap((face) => {
    const pose = onFace(id, face, pointer, snap);
    if (!pose) return [];
    const centre = originalCentre(id),
      distance = Math.hypot(
        centre[0] + pose.dx - pointer[0],
        centre[1] + pose.dy - pointer[1],
      );
    return distance <= maxDistance ? [{ pose, distance, id: face.id }] : [];
  });
  candidates.sort(
    (a, b) => a.distance - b.distance || a.id.localeCompare(b.id),
  );
  return candidates[0]?.pose;
}
/** Never turn a client-supplied off-wall pose into a legal one. Facing and contact
 * must already agree; only the admitted face's tangent may then be snapped. */
export function qualifyWallFurnishingPlacement(
  doc: ShipPrefabDocumentV1,
  id: string,
  state: FurnishingOverride,
): FurnishingOverride {
  if (!wallFixture(id)) throw Error("This furnishing is not wall mounted");
  // Original fixtures sometimes use authored backing offsets or special support
  // (the fitted lamp/duct bay). Permit precisely their immutable default pose.
  if (!state.dx && !state.dy && !state.yaw) return { ...state };
  const centre = originalCentre(id),
    pointer: Point = [centre[0] + state.dx, centre[1] + state.dy];
  for (const face of furnishingWallSurfaces(doc)) {
    const free = onFace(id, face, pointer, false);
    if (!free) continue;
    const turn = Math.atan2(
      Math.sin(state.yaw - free.yaw),
      Math.cos(state.yaw - free.yaw),
    );
    if (
      Math.abs(turn) > TOLERANCE ||
      Math.hypot(state.dx - free.dx, state.dy - free.dy) > TOLERANCE
    )
      continue;
    const admitted = onFace(id, face, pointer, state.snap);
    if (admitted) return admitted;
  }
  throw Error(
    "Wall furnishing needs flush supported wall contact and matching facing",
  );
}
