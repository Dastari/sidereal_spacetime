/**
 * EVA milestone 1 (design: wiki `Systems/EVA`): pure rules for characters outside a ship.
 *
 * Frames (AGENTS.md: planar, f64 metres):
 * - ship-local game frame: x starboard, y fore; `world = (x, y) + R(heading) * local`,
 *   `R = [[c, -s], [s, c]]`; heading 0 points the bow at world +Y;
 * - EVA body heading uses the ship convention: counter-clockwise radians, forward = (-sin h, cos h),
 *   right (starboard) = (cos h, sin h).
 * Heights are presentation only: an EVA body is a point in the plane.
 *
 * Nothing here reads or writes state; the world adapter (`packages/world/src/eva.ts`) owns rows.
 */
import {
  insideOutline,
  NORMAL_VECTOR,
  type Outline,
  type Pt,
} from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  prefabOrigin,
  volumeGeometry,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabComponentDefinition } from "./prefab-deck-objects";

export type P2 = [number, number];

/** Provisional lab values (not approved balance). */
export const EVA = {
  /** Jetpack thrust acceleration (m/s^2). Unlimited: no fuel (owner, 2026-09-29). */
  thrust: 5,
  /** Speed relative to the reference velocity that full thrust settles at (m/s). */
  speedCap: 6,
  /** Hard limit on the combined thrust + stabiliser acceleration (m/s^2). */
  accelLimit: 8,
  /** Strafe and reverse thrust as a fraction of forward thrust. */
  strafe: 0.6,
  /** Yaw rate at full turn input (rad/s). */
  turnRate: 2.2,
  /** A ship captures the stabiliser reference within this distance of its bounding radius (m). */
  captureM: 60,
  /** Maglock attaches within this distance outside a hull footprint (m). */
  maglockMarginM: 0.6,
  /** Maximum speed relative to the hull point for a maglock attach (m/s). */
  maglockMaxRelSpeed: 3,
  /** Walking speed on the hull (m/s): a heavy magnetic-boot gait (the Maglock_Walk contract). */
  walkSpeed: 0.9,
  /** Hull walking keeps the feet this far inside the footprint edge (m). */
  walkInsetM: 0.2,
  /** Reach from the deck to an airlock hatch's inside point (m). */
  hatchReachInsideM: 1.5,
  /** Reach from space (free or maglocked) to an airlock hatch's outside point (m). */
  hatchReachOutsideM: 2.5,
  /** The exit point is this far outboard of the exterior face (m). */
  exitOutboardM: 1,
  /** The re-entry point is this far inboard of the exterior face (m). */
  entryInboardM: 0.9,
  /** Emergency return is offered beyond this distance from the own ship (m). */
  strandedM: 1500,
  /** Rescue beacon duration before an emergency return (µs). */
  emergencyReturnMicros: 15_000_000n,
  /** Shared-world coordinate bound (m). */
  positionLimit: 1_000_000_000,
  /** World tick length (s) and integrator sub-steps per tick (like ships). */
  tickSeconds: 0.05,
  subSteps: 3,
  /** EVA body hit disc for handheld beams (m), as on deck. */
  bodyRadiusM: 0.3,
} as const;

export interface ShipPose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
}

const zero = (n: number) => n + 0;

export function rotate(v: readonly [number, number], angle: number): P2 {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return [zero(c * v[0] - s * v[1]), zero(s * v[0] + c * v[1])];
}
export function shipToWorld(pose: ShipPose, local: readonly [number, number]) {
  const r = rotate(local, pose.heading);
  return [pose.x + r[0], pose.y + r[1]] as P2;
}
export function worldToShip(pose: ShipPose, world: readonly [number, number]) {
  return rotate([world[0] - pose.x, world[1] - pose.y], -pose.heading);
}
/** Rigid-body velocity of the ship at a world point: v + ω × r. */
export function pointVelocity(
  pose: ShipPose,
  world: readonly [number, number],
): P2 {
  const rx = world[0] - pose.x,
    ry = world[1] - pose.y;
  return [pose.vx - pose.omega * ry, pose.vy + pose.omega * rx];
}
export const forwardOf = (heading: number): P2 => [
  zero(-Math.sin(heading)),
  zero(Math.cos(heading)),
];
export const rightOf = (heading: number): P2 => [
  zero(Math.cos(heading)),
  zero(Math.sin(heading)),
];
/** Heading whose forward vector points along `dir`. */
export const headingOf = (dir: readonly [number, number]) =>
  zero(Math.atan2(-dir[0], dir[1]));
export function wrapAngle(a: number) {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return zero(r);
}

// ------------------------------------------------------------------ ship model

export interface EvaAirlock {
  /** Placed mount id (`<mountId>` of the edge mount). */
  id: string;
  componentId: string;
  /** One direction of the cycle: half the catalogue `access.cycleS` (µs). */
  cycleMicros: bigint;
  /** Centre of the opening on the exterior face (ship-local game frame). */
  hatch: P2;
  /** Outward unit normal (ship-local game frame). */
  normal: P2;
  /** Deck point just inside the hatch (re-entry placement, reach test from the deck). */
  inside: P2;
  /** Space point just outside the hatch (exit placement, reach test from EVA). */
  outside: P2;
  room: string | null;
}
export interface EvaHullPart {
  id: string;
  /** Outer loop and holes in the ship-local game frame. */
  outline: { outer: P2[]; holes: P2[][] };
  /** Roof top above the ship datum (m): presentation height of a maglocked body. */
  roofM: number;
}
export interface EvaShipModel {
  airlocks: EvaAirlock[];
  hull: EvaHullPart[];
  /** Largest distance of any hull vertex from the ship origin (m). */
  radiusM: number;
}

/** Access stats for a component id; the default reads the pinned ship-component catalogue. */
export type EvaAccessLookup = (
  componentId: string,
) => { kind: string; cycleS: number } | null | undefined;

const cache = new WeakMap<ShipPrefabDocumentV1, EvaShipModel>();

/**
 * EVA geometry of a prefab ship, derived from grammar data only (deterministic):
 * - exterior airlocks: `edge` mounts whose component's `access.kind` is `airlock`;
 * - the hull footprint: every volume outline (deck hull, pods, wings, plates).
 */
export function prefabEvaModel(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  access: EvaAccessLookup = (id) =>
    prefabComponentDefinition(id, catalog.revision)?.access,
): EvaShipModel {
  const hit = cache.get(doc);
  if (hit) return hit;
  const [ox, oy] = prefabOrigin(doc);
  const toShip = (p: readonly number[]): P2 => [
    zero(-(p[1] - oy)),
    zero(p[0] - ox),
  ];
  const toShipDir = (v: readonly number[]): P2 => [zero(-v[1]), zero(v[0])];
  const interior = deriveInterior(doc, 0, catalog);
  const airlocks: EvaAirlock[] = [];
  for (const mount of doc.mounts) {
    if (mount.attach !== "edge" || !mount.normal) continue;
    const stats = access(mount.component);
    if (!stats || stats.kind !== "airlock") continue;
    const door = interior.doors.find((d) => d.id === mount.id && d.exterior);
    if (!door) continue;
    const hatch = toShip([
      (door.a[0] + door.b[0]) / 2,
      (door.a[1] + door.b[1]) / 2,
    ]);
    const normal = toShipDir(NORMAL_VECTOR[mount.normal]);
    airlocks.push({
      id: mount.id,
      componentId: mount.component,
      cycleMicros: BigInt(Math.round((Math.max(1, stats.cycleS) / 2) * 1e6)),
      hatch,
      normal,
      inside: [
        zero(hatch[0] - normal[0] * EVA.entryInboardM),
        zero(hatch[1] - normal[1] * EVA.entryInboardM),
      ],
      outside: [
        zero(hatch[0] + normal[0] * EVA.exitOutboardM),
        zero(hatch[1] + normal[1] * EVA.exitOutboardM),
      ],
      room: door.rooms[0],
    });
  }
  airlocks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hull: EvaHullPart[] = [];
  let radiusM = 0;
  for (const g of doc.volumes.map(volumeGeometry)) {
    if (!g.outline) continue;
    const outer = g.outline.outer.map(toShip);
    const holes = g.outline.holes.map((h) => h.map(toShip));
    for (const p of outer) radiusM = Math.max(radiusM, Math.hypot(p[0], p[1]));
    hull.push({
      id: g.volume.id,
      outline: { outer, holes },
      roofM: g.z[1] / 16,
    });
  }
  const model = { airlocks, hull, radiusM };
  cache.set(doc, model);
  return model;
}

const asOutline = (o: EvaHullPart["outline"]): Outline => ({
  outer: o.outer as Pt[],
  holes: o.holes as Pt[][],
});

/** Roof height of the highest hull part under a ship-local point, or undefined off the hull. */
export function hullSurfaceAt(
  model: EvaShipModel,
  local: readonly [number, number],
): number | undefined {
  let top: number | undefined;
  for (const part of model.hull)
    if (insideOutline(asOutline(part.outline), local[0], local[1]))
      top = top === undefined ? part.roofM : Math.max(top, part.roofM);
  return top;
}

function closestOnSegment(p: readonly number[], a: P2, b: P2): P2 {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
    : 0;
  return [a[0] + dx * t, a[1] + dy * t];
}

/** Distance from a ship-local point to the nearest hull edge (any loop of any part). */
export function hullEdgeDistance(
  model: EvaShipModel,
  local: readonly [number, number],
): { distance: number; point: P2 } | undefined {
  let best: { distance: number; point: P2 } | undefined;
  for (const part of model.hull)
    for (const loop of [part.outline.outer, ...part.outline.holes])
      for (let i = 0; i < loop.length; i++) {
        const q = closestOnSegment(local, loop[i], loop[(i + 1) % loop.length]);
        const d = Math.hypot(q[0] - local[0], q[1] - local[1]);
        if (!best || d < best.distance) best = { distance: d, point: q };
      }
  return best;
}

/** A hull point is walkable when it is on the hull and at least `inset` from every hull edge
 * that borders open space (edges shared between overlapping parts do not count). */
export function hullWalkable(
  model: EvaShipModel,
  local: readonly [number, number],
  inset: number = EVA.walkInsetM,
): boolean {
  if (hullSurfaceAt(model, local) === undefined) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (
      hullSurfaceAt(model, [
        local[0] + Math.cos(a) * inset,
        local[1] + Math.sin(a) * inset,
      ]) === undefined
    )
      return false;
  }
  return true;
}

/**
 * Where a maglock attach lands: the point itself when walkable, otherwise the nearest walkable
 * point within the attach margin (searched along the direction to the nearest edge), else none.
 */
export function maglockPoint(
  model: EvaShipModel,
  local: readonly [number, number],
  margin: number = EVA.maglockMarginM,
): P2 | undefined {
  if (hullWalkable(model, local)) return [local[0], local[1]];
  const edge = hullEdgeDistance(model, local);
  if (!edge || edge.distance > margin + EVA.walkInsetM + 1e-9) return;
  const inside = hullSurfaceAt(model, local) !== undefined;
  let dir: P2 = [edge.point[0] - local[0], edge.point[1] - local[1]];
  const len = Math.hypot(dir[0], dir[1]);
  if (len < 1e-9) return;
  dir = [dir[0] / len, dir[1] / len];
  // Outside: walk past the edge; inside (too close to it): walk away from it.
  const sign = inside ? -1 : 1;
  for (
    let step = 0.05;
    step <= margin + 2 * EVA.walkInsetM + 0.3;
    step += 0.05
  ) {
    const p: P2 = [
      local[0] + dir[0] * sign * step,
      local[1] + dir[1] * sign * step,
    ];
    if (hullWalkable(model, p)) return p;
  }
  return;
}

// ------------------------------------------------------------------ integrator

export interface EvaFreeState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
}
export interface EvaThrustInput {
  /** Thrust along the heading, -1..1 (reverse is scaled by `EVA.strafe`). */
  forward: number;
  /** Thrust to the right (starboard) of the heading, -1..1 (scaled by `EVA.strafe`). */
  strafe: number;
  /** Yaw input, -1..1; positive turns counter-clockwise (left), like the helm. */
  turn: number;
}
const clamp1 = (v: number) =>
  Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;

/**
 * One world tick of jetpack flight (`EVA.subSteps` semi-implicit Euler sub-steps):
 * `a = A * thrust - K (v - vRef) + aRef`, `|a| <= A_MAX`, `K = A / V_CAP`. Without input the body
 * settles to `vRef` (the captured ship's point velocity); with full thrust it moves up to `V_CAP`
 * relative to it. `vRefPrevious` is last tick's reference: the reference ramps from it to `vRef`
 * over the tick and its rate is fed forward (`aRef`), so a body holds station next to an
 * accelerating or turning ship as long as the ship's point acceleration stays under `A_MAX`.
 * Deterministic; positions stay within the shared-world bound.
 */
export function stepEvaFree(
  state: EvaFreeState,
  input: EvaThrustInput,
  vRef: readonly [number, number],
  dt: number = EVA.tickSeconds,
  vRefPrevious: readonly [number, number] = vRef,
): EvaFreeState {
  const forward = clamp1(input.forward),
    strafe = clamp1(input.strafe),
    turn = clamp1(input.turn);
  const k = EVA.thrust / EVA.speedCap;
  const h = EVA.subSteps;
  const step = dt / h;
  let { x, y, vx, vy, heading } = state;
  let fx = (vRef[0] - vRefPrevious[0]) / dt,
    fy = (vRef[1] - vRefPrevious[1]) / dt;
  const fl = Math.hypot(fx, fy);
  if (!Number.isFinite(fl)) fx = fy = 0;
  else if (fl > EVA.accelLimit) {
    fx *= EVA.accelLimit / fl;
    fy *= EVA.accelLimit / fl;
  }
  for (let i = 0; i < h; i++) {
    const w = (i + 1) / h;
    const rx = vRefPrevious[0] + (vRef[0] - vRefPrevious[0]) * w,
      ry = vRefPrevious[1] + (vRef[1] - vRefPrevious[1]) * w;
    heading = wrapAngle(heading + turn * EVA.turnRate * step);
    const f = forwardOf(heading),
      r = rightOf(heading);
    const fwd = forward >= 0 ? forward : forward * EVA.strafe;
    let tx = f[0] * fwd + r[0] * strafe * EVA.strafe,
      ty = f[1] * fwd + r[1] * strafe * EVA.strafe;
    const tl = Math.hypot(tx, ty);
    if (tl > 1) {
      tx /= tl;
      ty /= tl;
    }
    let ax = EVA.thrust * tx - k * (vx - rx) + fx,
      ay = EVA.thrust * ty - k * (vy - ry) + fy;
    const al = Math.hypot(ax, ay);
    if (al > EVA.accelLimit) {
      ax *= EVA.accelLimit / al;
      ay *= EVA.accelLimit / al;
    }
    vx += ax * step;
    vy += ay * step;
    x += vx * step;
    y += vy * step;
  }
  const limit = EVA.positionLimit;
  if (Math.abs(x) > limit || Math.abs(y) > limit) {
    x = Math.max(-limit, Math.min(limit, x));
    y = Math.max(-limit, Math.min(limit, y));
    vx = 0;
    vy = 0;
  }
  return { x: zero(x), y: zero(y), vx: zero(vx), vy: zero(vy), heading };
}

export interface EvaReferenceCandidate {
  id: string;
  pose: ShipPose;
  radiusM: number;
}
/** The ship whose hull captures the stabiliser reference: nearest by distance beyond its
 * bounding radius, within `EVA.captureM`; ties break by id. */
export function evaReference(
  ships: readonly EvaReferenceCandidate[],
  at: readonly [number, number],
): { shipId: string; velocity: P2 } | undefined {
  let best: { gap: number; ship: EvaReferenceCandidate } | undefined;
  for (const ship of ships) {
    const gap =
      Math.hypot(at[0] - ship.pose.x, at[1] - ship.pose.y) - ship.radiusM;
    if (gap > EVA.captureM) continue;
    if (!best || gap < best.gap || (gap === best.gap && ship.id < best.ship.id))
      best = { gap, ship };
  }
  return best
    ? { shipId: best.ship.id, velocity: pointVelocity(best.ship.pose, at) }
    : undefined;
}

/**
 * One world tick of maglock walking in the ship-local frame. `dir` is the requested walk
 * direction (ship-local, |dir| <= 1). Slides along an axis when the full move would leave the
 * walkable hull; a start point that is not walkable (held at a hatch) may only move onto it.
 */
export function stepMaglockWalk(
  model: EvaShipModel,
  local: readonly [number, number],
  dir: readonly [number, number],
  dt: number = EVA.tickSeconds,
): P2 {
  let dx = clamp1(dir[0]),
    dy = clamp1(dir[1]);
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [local[0], local[1]];
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  const d = EVA.walkSpeed * dt;
  const tries: P2[] = [
    [local[0] + dx * d, local[1] + dy * d],
    [local[0] + dx * d, local[1]],
    [local[0], local[1] + dy * d],
  ];
  for (const p of tries)
    if ((p[0] !== local[0] || p[1] !== local[1]) && hullWalkable(model, p))
      return [zero(p[0]), zero(p[1])];
  return [local[0], local[1]];
}

// ------------------------------------------------------------------ airlock reach

/** The airlock whose inside point the deck position can reach, nearest first. */
export function airlockFromInside(
  model: EvaShipModel,
  local: readonly [number, number],
): EvaAirlock | undefined {
  return nearestAirlock(model, local, "inside", EVA.hatchReachInsideM);
}
/** The airlock whose outside point a body in space (ship-local position) can reach. */
export function airlockFromOutside(
  model: EvaShipModel,
  local: readonly [number, number],
): EvaAirlock | undefined {
  return nearestAirlock(model, local, "outside", EVA.hatchReachOutsideM);
}
function nearestAirlock(
  model: EvaShipModel,
  local: readonly [number, number],
  side: "inside" | "outside",
  reach: number,
) {
  let best: { d: number; lock: EvaAirlock } | undefined;
  for (const lock of model.airlocks) {
    const p = lock[side];
    const d = Math.hypot(p[0] - local[0], p[1] - local[1]);
    if (d <= reach && (!best || d < best.d)) best = { d, lock };
  }
  return best?.lock;
}

/** World pose and velocity of a body leaving through `lock` of a ship at `pose`. */
export function evaExitPose(pose: ShipPose, lock: EvaAirlock) {
  const [x, y] = shipToWorld(pose, lock.outside);
  const [vx, vy] = pointVelocity(pose, [x, y]);
  return {
    x,
    y,
    vx,
    vy,
    heading: wrapAngle(pose.heading + headingOf(lock.normal)),
    localHeading: headingOf(lock.normal),
  };
}
