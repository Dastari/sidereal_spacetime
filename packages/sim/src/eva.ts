/**
 * EVA milestone 2, the same-plane model (owner decision 2026-09-29, wiki `Systems/EVA` and
 * `Decisions/2026-09-29 Same-Plane EVA and Airlock Logic`): pure rules for characters outside a ship.
 *
 * A spacewalker is on the SAME PLANE as ships. There is no layer above the hull and no teleporting
 * airlock cycle: a character walks out through an OPEN exterior door (a continuous hand-off at the
 * doorway from the deck frame to the outside) and floats back in the same way. Hulls are solid from
 * both sides; exterior doors (actuated by ship logic) are the only openings.
 *
 * Frames (AGENTS.md: planar, f64 metres):
 * - ship-local game frame: x starboard, y fore; `world = (x, y) + R(heading) * local`,
 *   `R = [[c, -s], [s, c]]`; heading 0 points the bow at world +Y. Deck positions
 *   (`character.localX/Y`) use the same frame, so the doorway hand-off keeps the point.
 * - body heading uses the ship convention: counter-clockwise radians, forward = (-sin h, cos h).
 * - `local` phase: inside a ship's proximity bubble the body is simulated in that ship's frame and
 *   rides with it (turning is presentation only: no centrifugal or Coriolis terms, still planar).
 * - `free` phase: world frame. A body drops here when it jetpacks clear of the bubble or the ship
 *   out-accelerates the suit (`EVA.accelLimit`, the milestone-1 rule).
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
import { isMaglockBoots } from "@sidereal/content/crew-wardrobe";
import { prefabComponentDefinition } from "./prefab-deck-objects";
import type { MassProperties } from "./ifcs";
import {
  EVA_SUIT,
  evaSuitTick,
  integrateSpin,
  type EvaSuitAllocation,
  type EvaSuitIntent,
} from "./eva-suit";

export type P2 = [number, number];

/** Provisional lab values (not approved balance). */
export const EVA = {
  /** Jetpack thrust acceleration (m/s^2). Unlimited: no fuel (owner, 2026-09-29). */
  thrust: 5,
  /** Speed relative to the reference velocity that full thrust settles at (m/s). */
  speedCap: 6,
  /** Hard limit on the combined thrust + stabiliser acceleration (m/s^2); a ship accelerating
   * harder than this at the body's point out-accelerates the suit and drops it into world space. */
  accelLimit: 8,
  /** Yaw rate while turning the body toward the thrust direction (rad/s). */
  turnRate: 3.5,
  /** Legacy input: strafe and reverse thrust fraction (free phase, throttle/turn keys). */
  strafe: 0.6,
  /** Proximity bubble: a body within this distance beyond a ship's bounding radius is captured
   * into that ship's frame (when slow enough relative to it). */
  bubbleM: 30,
  /** A captured body is released beyond this distance (hysteresis against flicker). */
  releaseM: 40,
  /** Capture only below this speed relative to the ship's point velocity (m/s). */
  captureRelSpeed: 7,
  /** The stabiliser of a free body references the nearest ship within this gap (m). */
  captureM: 60,
  /** Body disc radius for hull collision, doorways and beams (m), as on deck. */
  bodyRadiusM: 0.3,
  /** Contact below this approach speed pushes the body away without damage (m/s). */
  impactSafeSpeed: 5,
  /** Damage per m/s of approach speed above the safe speed (hp). */
  impactDamagePerMs: 12,
  /** Half width of an exterior doorway's clear lane (m): leaves slide into 0.35 m jambs. */
  doorwayHalfM: 0.65,
  /** A walker at most this deep inside the hull line and pushing out steps outside (m). */
  exitDepthM: 0.33,
  /** A spacewalker at least this deep inside the hull line in an open doorway steps aboard (m). */
  entryDepthM: 0.45,
  /** How deep into an open doorway a spacewalker's body may float (m). */
  doorwayDepthM: 1,
  /** A walker must push outward at least this much (unit input · outward normal) to step out. */
  exitPush: 0.3,
  /** Without input, a body slower than this relative to the hull is held at rest (m/s). */
  restSpeed: 0.02,
  /** Presentation: body height above the deck datum while floating outside (m). */
  floatElevationM: 0.35,
  /** Emergency return is offered beyond this distance from the own ship (m). */
  strandedM: 1500,
  /** Rescue beacon duration before an emergency return (µs). */
  emergencyReturnMicros: 15_000_000n,
  /** Shared-world coordinate bound (m). */
  positionLimit: 1_000_000_000,
  /** World tick length (s) and integrator sub-steps per tick (like ships). */
  tickSeconds: 0.05,
  subSteps: 3,
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

/** An exterior door (edge mount): the only way through a hull. */
export interface EvaEntry {
  /** Placed mount id (`<mountId>` of the edge mount) = the door id ship logic actuates. */
  id: string;
  componentId: string;
  /** Catalogue `access.kind === "airlock"` (else a cargo door). */
  airlock: boolean;
  /** Centre of the opening on the hull line (ship-local game frame). */
  hatch: P2;
  /** Outward unit normal and unit direction along the opening. */
  normal: P2;
  along: P2;
  /** Deck point just inside and space point just outside the opening (hints for clients). */
  inside: P2;
  outside: P2;
  room: string | null;
}
/** Legacy name (milestone 1): every exterior entry. */
export type EvaAirlock = EvaEntry;
export interface EvaHullPart {
  id: string;
  /** Outer loop and holes in the ship-local game frame. */
  outline: { outer: P2[]; holes: P2[][] };
  /** Roof top above the ship datum (m). */
  roofM: number;
}
export interface EvaShipModel {
  /** Exterior doors (entry points), id order. */
  entries: EvaEntry[];
  /** Milestone-1 alias of `entries` (render doors match hatches by id). */
  airlocks: EvaEntry[];
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
 * - entries: every exterior door (`edge` mount), airlocks and cargo doors;
 * - the hull: every volume outline (deck hull, pods, wings, plates), solid from both sides.
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
  const entries: EvaEntry[] = [];
  for (const mount of doc.mounts) {
    if (mount.attach !== "edge" || !mount.normal) continue;
    const door = interior.doors.find((d) => d.id === mount.id && d.exterior);
    if (!door) continue;
    const a = toShip(door.a),
      b = toShip(door.b);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (span < 0.5) continue;
    const hatch: P2 = [zero((a[0] + b[0]) / 2), zero((a[1] + b[1]) / 2)];
    const normal = toShipDir(NORMAL_VECTOR[mount.normal]);
    entries.push({
      id: mount.id,
      componentId: mount.component,
      airlock: access(mount.component)?.kind === "airlock",
      hatch,
      normal,
      along: [zero((b[0] - a[0]) / span), zero((b[1] - a[1]) / span)],
      inside: [
        zero(hatch[0] - normal[0] * EVA.entryDepthM),
        zero(hatch[1] - normal[1] * EVA.entryDepthM),
      ],
      outside: [
        zero(hatch[0] + normal[0] * 1),
        zero(hatch[1] + normal[1] * 1),
      ],
      room: door.rooms[0] ?? door.rooms[1],
    });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const hull: EvaHullPart[] = [];
  let radiusM = 0;
  for (const g of doc.volumes.map(volumeGeometry)) {
    if (!g.outline) continue;
    const outer = g.outline.outer.map(toShip);
    const holes = g.outline.holes.map((h) => h.map(toShip));
    for (const p of outer) radiusM = Math.max(radiusM, Math.hypot(p[0], p[1]));
    hull.push({ id: g.volume.id, outline: { outer, holes }, roofM: g.z[1] / 16 });
  }
  const model = { entries, airlocks: entries, hull, radiusM };
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

// ------------------------------------------------------------------ doorways and collision

/** Along-span offset and inward depth (positive inside the hull line) of a point at a doorway. */
export function doorwayCoords(entry: EvaEntry, p: readonly [number, number]) {
  const rx = p[0] - entry.hatch[0],
    ry = p[1] - entry.hatch[1];
  return {
    along: rx * entry.along[0] + ry * entry.along[1],
    depth: -(rx * entry.normal[0] + ry * entry.normal[1]),
  };
}

/** Ids of the exterior doors a body may pass (open, and entry allowed for it). */
export type OpenEntries = ReadonlySet<string>;

/** The hull is solid here (inside an outline and not in the lane of an open doorway). */
export function evaSolidAt(
  model: EvaShipModel,
  p: readonly [number, number],
  open: OpenEntries,
): boolean {
  if (hullSurfaceAt(model, p) === undefined) return false;
  for (const e of model.entries) {
    if (!open.has(e.id)) continue;
    const c = doorwayCoords(e, p);
    if (
      Math.abs(c.along) <= EVA.doorwayHalfM &&
      c.depth >= -0.5 &&
      c.depth <= EVA.doorwayDepthM
    )
      return false;
  }
  return true;
}

const RING = Array.from({ length: 12 }, (_, k) => [
  Math.cos((k * Math.PI) / 6),
  Math.sin((k * Math.PI) / 6),
]);
/** A body disc at `p` overlaps solid hull (centre plus 12 rim samples). */
export function evaBodyBlocked(
  model: EvaShipModel,
  p: readonly [number, number],
  open: OpenEntries,
  radius: number = EVA.bodyRadiusM,
): boolean {
  if (evaSolidAt(model, p, open)) return true;
  for (const [cx, cy] of RING)
    if (evaSolidAt(model, [p[0] + cx * radius, p[1] + cy * radius], open))
      return true;
  return false;
}

/**
 * Push a body out of solid hull to the nearest free point beyond the nearest hull edge. Returns
 * the free point and the unit push direction (the contact normal), or undefined if it is free.
 */
export function evaPushOut(
  model: EvaShipModel,
  p: readonly [number, number],
  open: OpenEntries,
  radius: number = EVA.bodyRadiusM,
): { point: P2; normal: P2 } | undefined {
  if (!evaBodyBlocked(model, p, open, radius)) return;
  const edge = hullEdgeDistance(model, p);
  let dir: P2 = edge
    ? [edge.point[0] - p[0], edge.point[1] - p[1]]
    : [p[0], p[1]];
  const inside = hullSurfaceAt(model, p) !== undefined;
  let len = Math.hypot(dir[0], dir[1]);
  if (len < 1e-9) dir = [p[0] || 1, p[1]];
  len = Math.hypot(dir[0], dir[1]) || 1;
  // Outside but touching: move straight away from the nearest edge.
  dir = inside ? [dir[0] / len, dir[1] / len] : [-dir[0] / len, -dir[1] / len];
  const start = inside ? (edge?.distance ?? 0) : 0;
  for (let step = start + 0.02; step <= start + radius + 4; step += 0.02) {
    const q: P2 = [zero(p[0] + dir[0] * step), zero(p[1] + dir[1] * step)];
    if (!evaBodyBlocked(model, q, open, radius)) return { point: q, normal: dir };
  }
  // Pathological geometry: search outward from the ship centre.
  const out = Math.hypot(p[0], p[1]) || 1;
  const radial: P2 = [p[0] / out, p[1] / out];
  const q: P2 = [
    zero(radial[0] * (model.radiusM + radius + 0.5)),
    zero(radial[1] * (model.radiusM + radius + 0.5)),
  ];
  return { point: q, normal: radial };
}

export interface EvaMoveResult {
  point: P2;
  /** Velocity components removed by contact (ship-local frame), per axis. */
  removed: P2;
}
/**
 * Move a body by `delta` against the hull (ship-local frame): full move, else slide along one
 * axis, else stay. `v` is the body velocity relative to the hull; the blocked axis components are
 * reported as removed (the impact).
 */
export function evaMove(
  model: EvaShipModel,
  p: readonly [number, number],
  delta: readonly [number, number],
  v: readonly [number, number],
  open: OpenEntries,
  radius: number = EVA.bodyRadiusM,
): EvaMoveResult {
  const full: P2 = [p[0] + delta[0], p[1] + delta[1]];
  if (!evaBodyBlocked(model, full, open, radius))
    return { point: full, removed: [0, 0] };
  const xOnly: P2 = [p[0] + delta[0], p[1]];
  const yOnly: P2 = [p[0], p[1] + delta[1]];
  if (delta[0] !== 0 && !evaBodyBlocked(model, xOnly, open, radius))
    return { point: xOnly, removed: [0, v[1]] };
  if (delta[1] !== 0 && !evaBodyBlocked(model, yOnly, open, radius))
    return { point: yOnly, removed: [v[0], 0] };
  return { point: [p[0], p[1]], removed: [v[0], v[1]] };
}

/** Damage for an approach speed (m/s): none up to the safe speed, then linear. */
export function evaImpactDamage(speed: number): number {
  if (!Number.isFinite(speed) || speed <= EVA.impactSafeSpeed) return 0;
  return Math.round((speed - EVA.impactSafeSpeed) * EVA.impactDamagePerMs);
}

/**
 * Deck → outside: the exterior door a walker steps out through, or none. The walker must stand in
 * the lane of an OPEN door, at the hull line (within `EVA.exitDepthM` of it), pushing outward.
 */
export function evaExitThrough(
  model: EvaShipModel,
  p: readonly [number, number],
  walk: readonly [number, number],
  open: OpenEntries,
): EvaEntry | undefined {
  const len = Math.hypot(walk[0], walk[1]);
  if (len < 1e-9) return;
  for (const e of model.entries) {
    if (!open.has(e.id)) continue;
    const c = doorwayCoords(e, p);
    const push = (walk[0] * e.normal[0] + walk[1] * e.normal[1]) / len;
    if (
      Math.abs(c.along) <= EVA.doorwayHalfM - EVA.bodyRadiusM + 1e-6 &&
      c.depth >= -0.05 &&
      c.depth <= EVA.exitDepthM &&
      push >= EVA.exitPush
    )
      return e;
  }
  return;
}

/** Outside → deck: the open exterior door a spacewalker at `p` has floated in through, or none. */
export function evaEntryThrough(
  model: EvaShipModel,
  p: readonly [number, number],
  open: OpenEntries,
): EvaEntry | undefined {
  for (const e of model.entries) {
    if (!open.has(e.id)) continue;
    const c = doorwayCoords(e, p);
    if (
      Math.abs(c.along) <= EVA.doorwayHalfM &&
      c.depth >= EVA.entryDepthM &&
      c.depth <= EVA.doorwayDepthM + EVA.bodyRadiusM
    )
      return e;
  }
  return;
}

// ------------------------------------------------------------------ jetpack (rigid body + suit IFCS)

/** A body in the world frame (free phase). */
export interface EvaFreeState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  /** Angular velocity (rad/s, counter-clockwise). */
  omega: number;
}
/** A body in a ship's frame: position, velocity relative to the hull, heading relative to the ship. */
export type EvaLocalState = EvaFreeState;
export type { EvaSuitIntent };

/** Hold mode with nothing commanded: settle exactly (no creeping drift or spin). */
function settle(
  s: EvaFreeState,
  intent: EvaSuitIntent,
  ref: readonly [number, number],
): EvaFreeState {
  if (intent.mode !== "hold") return s;
  let { vx, vy, omega, heading } = s;
  const idle = Math.hypot(intent.dx, intent.dy) < 1e-9;
  if (idle && Math.hypot(vx - ref[0], vy - ref[1]) < EVA_SUIT.restSpeed) {
    vx = ref[0];
    vy = ref[1];
  }
  if (intent.facing === null) {
    if (Math.abs(omega) < EVA_SUIT.restAngularSpeed) omega = 0;
  } else if (
    Math.abs(omega) < EVA_SUIT.restAngularSpeed &&
    Math.abs(wrapAngle(intent.facing - heading)) < EVA_SUIT.restHeadingError
  ) {
    omega = 0;
    heading = wrapAngle(intent.facing);
  }
  return { ...s, vx: zero(vx), vy: zero(vy), omega: zero(omega), heading };
}

export interface EvaStep {
  state: EvaFreeState;
  /** Largest approach speed removed by hull contact this tick (m/s); ship frame only. */
  impactSpeed: number;
  /** Nozzle allocation this tick (presentation and tests). */
  allocation: EvaSuitAllocation;
}

/**
 * One world tick of free (world-frame) flight: the suit IFCS references `vRef` (the captured
 * ship's point velocity, ramped from `vRefPrevious` with its rate fed forward); momentum carries the
 * body otherwise. Deterministic; positions stay within the shared-world bound. Hull contact is
 * resolved by the caller (`evaWorldContact`).
 */
export function stepEvaFree(
  state: EvaFreeState,
  intent: EvaSuitIntent,
  mass: MassProperties,
  vRef: readonly [number, number] = [0, 0],
  dt: number = EVA.tickSeconds,
  vRefPrevious: readonly [number, number] = vRef,
): EvaStep {
  let aRef: P2 = [(vRef[0] - vRefPrevious[0]) / dt, (vRef[1] - vRefPrevious[1]) / dt];
  const al = Math.hypot(aRef[0], aRef[1]);
  if (!Number.isFinite(al)) aRef = [0, 0];
  else if (al > EVA.accelLimit)
    aRef = [(aRef[0] * EVA.accelLimit) / al, (aRef[1] * EVA.accelLimit) / al];
  const tick = evaSuitTick(state, intent, mass, { v: vRef, a: aRef });
  const h = EVA.subSteps;
  const step = dt / h;
  let { x, y, vx, vy } = state;
  for (let i = 0; i < h; i++) {
    vx += tick.linear[0] * step;
    vy += tick.linear[1] * step;
    x += vx * step;
    y += vy * step;
  }
  const spin = integrateSpin(state.heading, state.omega, tick.angular, dt, h);
  const limit = EVA.positionLimit;
  if (Math.abs(x) > limit || Math.abs(y) > limit) {
    x = Math.max(-limit, Math.min(limit, x));
    y = Math.max(-limit, Math.min(limit, y));
    vx = 0;
    vy = 0;
  }
  return {
    state: settle(
      { x: zero(x), y: zero(y), vx: zero(vx), vy: zero(vy), ...spin },
      intent,
      vRef,
    ),
    impactSpeed: 0,
    allocation: tick.allocation,
  };
}

/**
 * One world tick in a ship's frame: the suit IFCS works relative to the hull (hold mode rides
 * along at rest), and the hull is solid except the lanes of `open` doorways. Contact removes the
 * approaching velocity component and reports its speed (impact leeway: `evaImpactDamage`).
 * Contact never changes the angular velocity (frictionless hull).
 */
export function stepEvaLocal(
  model: EvaShipModel,
  state: EvaLocalState,
  intent: EvaSuitIntent,
  open: OpenEntries,
  mass: MassProperties,
  dt: number = EVA.tickSeconds,
): EvaStep {
  const h = EVA.subSteps;
  const step = dt / h;
  let p: P2 = [state.x, state.y];
  let v: P2 = [state.vx, state.vy];
  let impactSpeed = 0;
  // A body that starts inside solid hull (a legacy roof position, a ship grown around it) is
  // pushed out first, without damage.
  const out = evaPushOut(model, p, open);
  if (out) {
    p = out.point;
    const into = v[0] * out.normal[0] + v[1] * out.normal[1];
    if (into < 0) v = [v[0] - into * out.normal[0], v[1] - into * out.normal[1]];
  }
  const tick = evaSuitTick({ ...state, x: p[0], y: p[1], vx: v[0], vy: v[1] }, intent, mass);
  for (let i = 0; i < h; i++) {
    v = [v[0] + tick.linear[0] * step, v[1] + tick.linear[1] * step];
    const moved = evaMove(model, p, [v[0] * step, v[1] * step], v, open);
    const hit = Math.hypot(moved.removed[0], moved.removed[1]);
    if (hit > impactSpeed) impactSpeed = hit;
    v = [v[0] - moved.removed[0], v[1] - moved.removed[1]];
    p = moved.point;
  }
  const spin = integrateSpin(state.heading, state.omega, tick.angular, dt, h);
  return {
    state: settle(
      { x: zero(p[0]), y: zero(p[1]), vx: zero(v[0]), vy: zero(v[1]), ...spin },
      intent,
      [0, 0],
    ),
    impactSpeed,
    allocation: tick.allocation,
  };
}

// ------------------------------------------------------------------ frames

/**
 * World pose/velocity of a ship-local body. The ship's frame carries the body with the ship's
 * CENTRE velocity: a turning ship's rotation is presentation only (no centripetal or Coriolis
 * terms, owner brief 2026-09-29), so the world velocity is the ship velocity plus the body's
 * velocity relative to the hull, rotated into the world. `refVx/refVy` is that ship velocity.
 */
export function localToWorld(pose: ShipPose, s: EvaLocalState) {
  const [x, y] = shipToWorld(pose, [s.x, s.y]);
  const rv = rotate([s.vx, s.vy], pose.heading);
  return {
    x,
    y,
    vx: zero(pose.vx + rv[0]),
    vy: zero(pose.vy + rv[1]),
    heading: wrapAngle(pose.heading + s.heading),
    omega: s.omega,
    refVx: pose.vx,
    refVy: pose.vy,
  };
}
/** Ship-local state of a world body (velocity relative to the hull point under it). */
export function worldToLocal(pose: ShipPose, s: EvaFreeState): EvaLocalState {
  const [x, y] = worldToShip(pose, [s.x, s.y]);
  const pv = pointVelocity(pose, [s.x, s.y]);
  const rv = rotate([s.vx - pv[0], s.vy - pv[1]], -pose.heading);
  // The body's own spin carries over unchanged (ship rotation is presentation only).
  return {
    x,
    y,
    vx: rv[0],
    vy: rv[1],
    heading: wrapAngle(s.heading - pose.heading),
    omega: s.omega,
  };
}

export interface EvaReferenceCandidate {
  id: string;
  pose: ShipPose;
  radiusM: number;
}
/** The ship whose hull captures the free stabiliser reference: nearest by distance beyond its
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
 * The ship whose frame captures a free body: within `EVA.bubbleM` beyond its bounding radius and
 * moving slower than `EVA.captureRelSpeed` relative to its point velocity; nearest, ties by id.
 */
export function evaCaptureShip(
  ships: readonly EvaReferenceCandidate[],
  body: EvaFreeState,
): string | undefined {
  let best: { gap: number; id: string } | undefined;
  for (const ship of ships) {
    const gap =
      Math.hypot(body.x - ship.pose.x, body.y - ship.pose.y) - ship.radiusM;
    if (gap > EVA.bubbleM) continue;
    const pv = pointVelocity(ship.pose, [body.x, body.y]);
    if (Math.hypot(body.vx - pv[0], body.vy - pv[1]) > EVA.captureRelSpeed)
      continue;
    if (!best || gap < best.gap || (gap === best.gap && ship.id < best.id))
      best = { gap, id: ship.id };
  }
  return best?.id;
}

/**
 * Why a ship-local body leaves the ship's frame this tick, if it does: beyond the release radius,
 * or the ship's linear acceleration (its velocity change since last tick, `shipVPrevious`) exceeds
 * what the suit can follow (`EVA.accelLimit`). Rotation never releases a body (presentation only).
 */
export function evaReleaseReason(
  pose: ShipPose,
  radiusM: number,
  local: readonly [number, number],
  shipVPrevious: readonly [number, number] | undefined,
  dt: number = EVA.tickSeconds,
): "far" | "outpaced" | undefined {
  if (Math.hypot(local[0], local[1]) - radiusM > EVA.releaseM) return "far";
  if (!shipVPrevious) return;
  const a =
    Math.hypot(pose.vx - shipVPrevious[0], pose.vy - shipVPrevious[1]) / dt;
  return a > EVA.accelLimit ? "outpaced" : undefined;
}

/**
 * A world-frame body against one ship's hull: if the body overlaps the hull (the ship moved into
 * it, or it flew into the ship), push it out along the contact normal, remove its approaching
 * velocity relative to the hull point, and report that approach speed.
 */
export function evaWorldContact(
  model: EvaShipModel,
  pose: ShipPose,
  body: EvaFreeState,
  open: OpenEntries,
): { body: EvaFreeState; impactSpeed: number } | undefined {
  const local = worldToShip(pose, [body.x, body.y]);
  const out = evaPushOut(model, local, open);
  if (!out) return;
  const [x, y] = shipToWorld(pose, out.point);
  const n = rotate(out.normal, pose.heading);
  const pv = pointVelocity(pose, [x, y]);
  const rel: P2 = [body.vx - pv[0], body.vy - pv[1]];
  const into = rel[0] * n[0] + rel[1] * n[1];
  const impactSpeed = into < 0 ? -into : 0;
  return {
    body: {
      ...body,
      x,
      y,
      vx: zero(into < 0 ? body.vx - into * n[0] : body.vx),
      vy: zero(into < 0 ? body.vy - into * n[1] : body.vy),
    },
    impactSpeed,
  };
}

// ------------------------------------------------------------------ maglock boots

/**
 * Maglock boots (owner 2026-09-29): a property of space-suit boots only, and they work only
 * inside ships for now. Aboard with suit boots in zero gravity the wearer stays planted on the
 * deck (walks with the `Maglock_*` clips); outside there is no maglock (the jetpack moves you)
 * and the roof is unreachable.
 */
export function maglockBootsActive(input: {
  aboard: boolean;
  /** Equipped boots (wardrobe or inventory definition id), if any. */
  boots: string | null | undefined;
  /** Interior gravity of the ship at the wearer (prefab ships have no gravity model yet: on). */
  gravity: boolean;
}): boolean {
  return input.aboard && !input.gravity && isMaglockBoots(input.boots);
}
/** Whether the wearer's boots are space-suit mag boots at all (inventory/HUD). */
export const hasMaglockBoots = (boots: string | null | undefined) =>
  isMaglockBoots(boots);
