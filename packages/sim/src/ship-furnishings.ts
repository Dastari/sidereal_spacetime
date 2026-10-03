import {
  FURNISHING_DEFAULT,
  furnishingRestriction,
  furnishingMountKind,
  effectiveWayfarerObjects,
  type FurnishingOverride,
  type FurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
import {
  isWayfarerGameplay,
  WAYFARER_GAMEPLAY_OBJECTS,
} from "@sidereal/content/wayfarer-authored-gameplay";
import {
  deriveInterior,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { positiveOverlap, inside } from "./layout-geometry";
import { qualifyWallFurnishingPlacement } from "./furnishing-wall-placement";
import {
  canOccupyDeck,
  sweepDeckCircle,
  type DeckCollisionFrame,
} from "./construction-collision";

export interface FurnishingEdit {
  sourceObjectId: string;
  action: string;
  dx: number;
  dy: number;
  yaw: number;
  snap: boolean;
}
export function planFurnishingEdit(
  doc: ShipPrefabDocumentV1,
  previous: FurnishingOverrides,
  edit: FurnishingEdit,
): FurnishingOverrides {
  if (!isWayfarerGameplay(doc))
    throw Error("Furniture editing is not available for this ship");
  if (furnishingRestriction(edit.sourceObjectId))
    throw Error(furnishingRestriction(edit.sourceObjectId));
  if (
    ![edit.dx, edit.dy, edit.yaw].every(Number.isFinite) ||
    Math.abs(edit.dx) > 32 ||
    Math.abs(edit.dy) > 32 ||
    Math.abs(edit.yaw) > Math.PI * 2 ||
    typeof edit.snap !== "boolean" ||
    !["move", "delete", "snap"].includes(edit.action)
  )
    throw Error("Invalid furniture edit");
  const old = previous[edit.sourceObjectId] ?? FURNISHING_DEFAULT;
  if (old.deleted) throw Error("This furniture has been deleted");
  const round = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
  let next: FurnishingOverride;
  if (edit.action === "delete") next = { ...old, deleted: true };
  else if (edit.action === "snap") next = { ...old, snap: edit.snap };
  else if (furnishingMountKind(edit.sourceObjectId) === "wall")
    next = qualifyWallFurnishingPlacement(doc, edit.sourceObjectId, {
      dx: edit.dx,
      dy: edit.dy,
      yaw: edit.yaw,
      snap: edit.snap,
      deleted: false,
    });
  else
    next = {
      dx: round(edit.snap ? Math.round(edit.dx / 0.25) * 0.25 : edit.dx),
      dy: round(edit.snap ? Math.round(edit.dy / 0.25) * 0.25 : edit.dy),
      yaw: round(
        edit.snap
          ? Math.round(edit.yaw / (Math.PI / 12)) * (Math.PI / 12)
          : edit.yaw,
      ),
      snap: edit.snap,
      deleted: false,
    };
  return { ...previous, [edit.sourceObjectId]: next };
}
const location = (frame: DeckCollisionFrame, p: readonly number[]) => ({
  shipId: frame.shipId,
  deckId: frame.deckId,
  position: [p[0], p[1]] as [number, number],
});
const clear = (frame: DeckCollisionFrame, p: readonly number[], radius = 0.3) =>
  canOccupyDeck(frame, location(frame, p), radius);
const sweep = (
  frame: DeckCollisionFrame,
  a: readonly number[],
  b: readonly number[],
) => {
  const p = sweepDeckCircle(
    frame,
    location(frame, a),
    [b[0] - a[0], b[1] - a[1]],
    0.3,
  ).position;
  return Math.hypot(p[0] - b[0], p[1] - b[1]) < 1e-5;
};
/** Bounded graph of legal crew-sized deck paths, reusing connectivity across crew/anchors. */
export function deckRouteGroups(
  frame: DeckCollisionFrame,
  points: readonly (readonly number[])[],
): number[] {
  const step = 0.25,
    nodes = new Map<string, boolean>(),
    labels = new Map<string, number>();
  const point = (x: number, y: number) =>
    [x * step, y * step] as [number, number];
  const legal = (x: number, y: number) => {
    const key = x + "," + y;
    if (!nodes.has(key)) {
      if (nodes.size >= 8192)
        throw Error("Furnishing route validation budget exceeded");
      nodes.set(
        key,
        Math.abs(x) <= 27 && y >= -46 && y <= 54 && clear(frame, point(x, y)),
      );
    }
    return nodes.get(key)!;
  };
  let group = 0;
  const resolve = (p: readonly number[]) => {
    if (!clear(frame, p)) return -1;
    const x = Math.round(p[0] / step),
      y = Math.round(p[1] / step);
    let seed: [number, number] | undefined;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ])
      if (legal(x + dx, y + dy) && sweep(frame, p, point(x + dx, y + dy))) {
        seed = [x + dx, y + dy];
        break;
      }
    if (!seed) return -1;
    const key = seed.join(","),
      old = labels.get(key);
    if (old !== undefined) return old;
    const id = ++group,
      queue = [seed];
    labels.set(key, id);
    for (let n = 0; n < queue.length; n++) {
      const [x, y] = queue[n];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          k = nx + "," + ny;
        if (
          labels.has(k) ||
          !legal(nx, ny) ||
          !sweep(frame, point(x, y), point(nx, ny))
        )
          continue;
        labels.set(k, id);
        queue.push([nx, ny]);
      }
    }
    return id;
  };
  return points.map(resolve);
}

/** Choose a supported interaction socket in a crew-connected component, not merely the first clear point. */
export function reachableFurnishingApproach(
  frame: DeckCollisionFrame,
  crew: readonly (readonly number[])[],
  points: readonly (readonly [number, number])[],
): [number, number] | undefined {
  const candidates = points.filter((p) => clear(frame, p)),
    routes = deckRouteGroups(frame, [...crew, ...candidates]);
  const point = candidates.find(
    (_p, i) =>
      routes[crew.length + i] > 0 &&
      routes
        .slice(0, crew.length)
        .some((g) => g > 0 && g === routes[crew.length + i]),
  );
  return point ? [point[0], point[1]] : undefined;
}

const polygonArea = (p: readonly (readonly number[])[]) =>
  Math.abs(
    p.reduce(
      (a, v, i) =>
        a + v[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * v[1],
      0,
    ),
  ) / 2;
/** Exact convex clipping against each nonoverlapping admitted floor patch, including tiny slivers. */
export function footprintFloorCoverage(
  polygon: readonly (readonly number[])[],
  floors: readonly (readonly (readonly number[])[])[],
): { area: number; supported: number } {
  const clip = (
    subject: readonly (readonly number[])[],
    boundary: readonly (readonly number[])[],
  ) => {
    let out = subject.map((p) => [p[0], p[1]] as [number, number]);
    const signed = boundary.reduce(
        (a, v, i) =>
          a +
          v[0] * boundary[(i + 1) % boundary.length][1] -
          boundary[(i + 1) % boundary.length][0] * v[1],
        0,
      ),
      direction = signed < 0 ? -1 : 1;
    for (let i = 0; i < boundary.length && out.length; i++) {
      const a = boundary[i],
        b = boundary[(i + 1) % boundary.length],
        distance = (p: readonly number[]) =>
          direction *
          ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      const input = out;
      out = [];
      for (let k = 0; k < input.length; k++) {
        const p = input[k],
          q = input[(k + 1) % input.length],
          dp = distance(p),
          dq = distance(q),
          pin = dp >= 0,
          qin = dq >= 0;
        if (pin) out.push(p);
        if (pin !== qin) {
          const t = dp / (dp - dq);
          out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }
      }
    }
    return out;
  };
  return {
    area: polygonArea(polygon),
    supported: floors.reduce(
      (sum, f) => sum + polygonArea(clip(polygon, f)),
      0,
    ),
  };
}
/** Source-room floor thresholds qualify actual existing physical apertures without inventing doors. */
export function furnishingDoorwayAnchors(
  doc: ShipPrefabDocumentV1,
  frame: DeckCollisionFrame,
): [number, number][] {
  const floors = deriveInterior(doc, 0).floors.filter((f) => !f.partial),
    map = new Map(floors.map((f) => [f.cell.join(","), f]));
  const points: [number, number][] = [];
  for (const floor of floors)
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const [x, y] = floor.cell,
        neighbor = map.get(`${x + dx},${y + dy}`);
      if (!neighbor || neighbor.room === floor.room) continue;
      for (const along of [0.125, 0.375, 0.625, 0.875]) {
        const px = x + (dx ? 1 : along),
          py = y + (dy ? 1 : along),
          a: [number, number] = [-(py - dy * 0.4), px - dx * 0.4],
          b: [number, number] = [-(py + dy * 0.4), px + dx * 0.4];
        if (clear(frame, a) && clear(frame, b) && sweep(frame, a, b))
          points.push(a, b);
      }
    }
  return points;
}

/** All geometry and paths use server frames; no rendered transform enters these checks. */
export function validateFurnishingPlacement(
  sourceObjectId: string,
  overrides: FurnishingOverrides,
  before: DeckCollisionFrame,
  after: DeckCollisionFrame,
  crew: readonly (readonly number[])[],
  anchors: readonly (readonly number[])[],
) {
  const moved = effectiveWayfarerObjects(overrides).find(
    (row) => row.object === sourceObjectId,
  );
  if (moved) {
    const pose = overrides[sourceObjectId] ?? FURNISHING_DEFAULT,
      originalWallPose =
        furnishingMountKind(sourceObjectId) === "wall" &&
        !pose.dx &&
        !pose.dy &&
        !pose.yaw;
    const polygon = moved.footprint.map(
      ([x, y]) => [-y, x] as [number, number],
    );
    for (const obstacle of after.obstacles)
      if (
        obstacle.id !== `prefab-socket:${sourceObjectId}` &&
        // Frozen source fixtures may be recessed into their authored support.
        // This exception never applies to a translated/rotated wall fixture or
        // to other props, crew, floor support, approaches or route checks.
        !(
          originalWallPose &&
          /^prefab-(?:bulkhead:|socket:PART_)/.test(obstacle.id)
        ) &&
        positiveOverlap(
          polygon,
          obstacle.vertices.map((p) => [p[0], p[1]]),
        )
      )
        throw Error(
          `Furniture overlaps ${obstacle.id.replace(/^prefab-(?:socket|mount):/, "").replace(/[_:-]/g, " ")}`,
        );
    const frame = {
      ...after,
      obstacles: after.obstacles.filter(
        (o) => o.id !== `prefab-socket:${sourceObjectId}`,
      ),
      segments: after.segments.filter(
        (s) =>
          !s.id.includes(`prefab-socket:${sourceObjectId}`) &&
          !(
            originalWallPose &&
            /^obstacle:\["prefab-(?:bulkhead:|socket:PART_)/.test(s.id)
          ),
      ),
    };
    const coverage = footprintFloorCoverage(polygon, after.floors);
    if (coverage.area - coverage.supported > 1e-9)
      throw Error("Furniture footprint needs complete supported deck");
    for (const segment of frame.segments) {
      const dx = segment.b[0] - segment.a[0],
        dy = segment.b[1] - segment.a[1],
        length = Math.hypot(dx, dy),
        w = Math.max(1e-8, segment.halfWidthM),
        nx = (-dy / length) * w,
        ny = (dx / length) * w;
      if (
        positiveOverlap(polygon, [
          [segment.a[0] + nx, segment.a[1] + ny],
          [segment.a[0] - nx, segment.a[1] - ny],
          [segment.b[0] - nx, segment.b[1] - ny],
          [segment.b[0] + nx, segment.b[1] + ny],
        ])
      )
        throw Error("Furniture overlaps a fixed wall or doorway boundary");
    }
    for (const p of crew)
      if (
        inside([p[0], p[1]], polygon) ||
        polygon.some((a, i) => {
          const b = polygon[(i + 1) % polygon.length],
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            t = Math.max(
              0,
              Math.min(
                1,
                ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
              ),
            );
          return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) < 0.3;
        })
      )
        throw Error("Move crew clear of the furniture destination");
  }
  const required = anchors.filter((p) => clear(before, p));
  for (const p of required)
    if (!clear(after, p))
      throw Error(
        "Furniture blocks a required door, helm or interaction approach",
      );
  // Never strand crew or break any route that existed before this edit.
  const points = [...crew, ...required],
    old = deckRouteGroups(before, points),
    next = deckRouteGroups(after, points);
  for (let i = 0; i < crew.length; i++) {
    if (old[i] > 0 && next[i] < 0)
      throw Error("Furniture destination blocks crew standing support");
    for (let j = crew.length; j < points.length; j++)
      if (old[i] > 0 && old[i] === old[j] && next[i] !== next[j])
        throw Error("Furniture would strand crew from a required approach");
  }
}
