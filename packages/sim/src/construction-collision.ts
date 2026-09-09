import type { LayoutDocument, Point } from '../../content/src/ship-layout';
import { compileLayout } from './layout-compiler';
import { canonicalPolygon, cross, inside, compareText, properCross } from './layout-geometry';

/** Pure adapter over validated nominal geometry, not native mesh triangles or room labels.
 * Compile/cache on a layout change. Resolve door state on a door-state change, not per ray.
 * All public positions/deltas/radii are ship-local metres; deck elevation stays metadata.
 */
export const DECK_COLLISION_LIMITS = Object.freeze({ walls: 16384, obstacles: 2048,
  obstacleVertices: 16, coordinateM: 512, displacementM: 1024, radiusM: 4, slideContacts: 8 });
const EPS = 1e-8, SKIN = 1e-7;
export interface DeckLocation { shipId: string; deckId: string; position: Point }
export interface DeckColliderSegment { id: string; a: Point; b: Point; halfWidthM: number }
export interface DeckObstacle { id: string; definitionId: string; vertices: Point[] }
export interface DeckOpeningState { openingId: string; passable: boolean }
export interface CompiledDeckCollision {
  shipId: string; deckId: string; fingerprint: string; elevationM: number;
  floors: readonly Point[][]; walls: readonly DeckColliderSegment[]; obstacles: readonly DeckObstacle[];
  openings: readonly (DeckColliderSegment & { kind: 'door' | 'passage' | 'airlock'; sillM: number })[];
}
export interface DeckCollisionFrame extends Omit<CompiledDeckCollision, 'walls' | 'openings'> {
  segments: readonly DeckColliderSegment[];
}
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Deck collision: ${message}`);
}
const finitePoint = (p: Point, limit: number = DECK_COLLISION_LIMITS.coordinateM) => p.length === 2 && p.every(n => Number.isFinite(n) && Math.abs(n) <= limit);
const metres = (p: Point): Point => [p[0] / 32, p[1] / 32];
const add = (a: Point, b: Point, scale = 1): Point => [a[0] + b[0] * scale, a[1] + b[1] * scale];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
function nearest(p: Point, a: Point, b: Point): Point {
  const edge = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), edge) / dot(edge, edge)));
  return add(a, edge, t);
}
const distanceToSegment = (p: Point, s: DeckColliderSegment) => Math.hypot(...sub(p, nearest(p, s.a, s.b)));

export function compileDeckCollision(document: LayoutDocument, deckId: string, options: {
  shipId: string; perimeterHalfWidthM: number; partitionHalfWidthM: number;
  /** Approved collision footprints in metres; visual AABBs/fitting dimensions are not inferred. */
  obstacles?: readonly DeckObstacle[];
}): CompiledDeckCollision {
  requireCondition(typeof options.shipId === 'string' && options.shipId.length > 0 && options.shipId.length <= 128, 'invalid ship identity');
  requireCondition([options.perimeterHalfWidthM, options.partitionHalfWidthM].every(n => Number.isFinite(n) && n >= 0 && n <= 2), 'invalid wall half-width');
  const compiled = compileLayout(document);
  requireCondition(compiled.valid, `invalid layout: ${compiled.diagnostics.filter(d => d.severity === 'error').map(d => d.code).join(', ')}`);
  const deck = document.decks.find(d => d.id === deckId);
  requireCondition(deck, 'unknown deck');
  const floors = compiled.tiles.filter(t => t.deckId === deckId).map(t => t.vertices.map(metres));
  requireCondition(floors.length > 0, 'deck has no floor support');
  const obstacles = options.obstacles ?? [];
  requireCondition(obstacles.length <= DECK_COLLISION_LIMITS.obstacles, 'too many obstacles');
  const ids = new Set<string>();
  const admitted = obstacles.map(obstacle => {
    requireCondition(typeof obstacle.id === 'string' && obstacle.id.length > 0 && obstacle.id.length <= 128 && !ids.has(obstacle.id), 'invalid or duplicate obstacle identity');
    ids.add(obstacle.id);
    requireCondition(typeof obstacle.definitionId === 'string' && obstacle.definitionId.length > 0 && obstacle.definitionId.length <= 128, 'obstacle requires collision definition');
    requireCondition(obstacle.vertices.length >= 3 && obstacle.vertices.length <= DECK_COLLISION_LIMITS.obstacleVertices && obstacle.vertices.every(p => finitePoint(p)), 'invalid obstacle vertices');
    const vertices = canonicalPolygon(obstacle.vertices);
    requireCondition(vertices.every((p, i) => cross(p, vertices[(i + 1) % vertices.length], vertices[(i + 2) % vertices.length]) > EPS), 'obstacle must be strictly convex');
    for (let i = 0; i < vertices.length; i++) for (let j = i + 1; j < vertices.length; j++)
      requireCondition(!properCross(vertices[i], vertices[(i + 1) % vertices.length], vertices[j], vertices[(j + 1) % vertices.length]), 'self-intersecting obstacle');
    return { ...obstacle, vertices };
  }).sort((a, b) => compareText(a.id, b.id));
  const walls: DeckColliderSegment[] = compiled.walls.filter(w => w.deckId === deckId).map(w => ({ id: w.key, a: metres(w.a), b: metres(w.b),
    halfWidthM: w.source === 'perimeter' ? options.perimeterHalfWidthM : options.partitionHalfWidthM }));
  for (const obstacle of admitted) for (let i = 0; i < obstacle.vertices.length; i++) walls.push({
    id: `obstacle:${JSON.stringify([obstacle.id, i])}`, a: obstacle.vertices[i], b: obstacle.vertices[(i + 1) % obstacle.vertices.length], halfWidthM: 0 });
  const openings = document.openings.filter(o => o.deckId === deckId).map(o => ({ id: o.id, a: metres(o.a), b: metres(o.b),
    halfWidthM: options.partitionHalfWidthM, kind: o.kind, sillM: o.sill / 32 }));
  requireCondition(walls.length + openings.length <= DECK_COLLISION_LIMITS.walls, 'too many collision segments');
  return { shipId: options.shipId, deckId, fingerprint: compiled.fingerprint, elevationM: deck.elevation / 32,
    floors, walls: walls.sort((a, b) => compareText(a.id, b.id)), obstacles: admitted,
    openings: openings.sort((a, b) => compareText(a.id, b.id)) };
}

/** Authority supplies passable only once door motion has cleared its opening. Missing
 * door/airlock state is closed. Passages are open unless explicitly obstructed. Nonzero
 * sills remain blocked: step-up/vertical clearance adapters are not implemented here.
 */
export function resolveDeckCollision(base: CompiledDeckCollision, states: readonly DeckOpeningState[]): DeckCollisionFrame {
  requireCondition(states.length <= base.openings.length, 'too many opening states');
  const known = new Set(base.openings.map(o => o.id)), byId = new Map<string, boolean>();
  for (const state of states) {
    requireCondition(known.has(state.openingId) && !byId.has(state.openingId) && typeof state.passable === 'boolean', 'invalid or duplicate opening state');
    byId.set(state.openingId, state.passable);
  }
  const { walls, openings, ...rest } = base;
  const segments = [...walls];
  for (const opening of openings) if (opening.sillM > 0 || !(byId.get(opening.id) ?? opening.kind === 'passage'))
    segments.push({ id: `opening:${opening.id}`, a: opening.a, b: opening.b, halfWidthM: opening.halfWidthM });
  segments.sort((a, b) => compareText(a.id, b.id));
  return { ...rest, segments };
}

function inFrame(frame: DeckCollisionFrame, location: DeckLocation) {
  return location.shipId === frame.shipId && location.deckId === frame.deckId && finitePoint(location.position);
}
function occupancy(frame: DeckCollisionFrame, p: Point, radius: number) {
  return frame.floors.some(poly => inside(p, poly)) && !frame.obstacles.some(o => inside(p, o.vertices))
    && frame.segments.every(s => distanceToSegment(p, s) >= radius + s.halfWidthM - EPS);
}
export function canOccupyDeck(frame: DeckCollisionFrame, location: DeckLocation, radiusM: number): boolean {
  return inFrame(frame, location) && Number.isFinite(radiusM) && radiusM > 0 && radiusM <= DECK_COLLISION_LIMITS.radiusM
    && occupancy(frame, location.position, radiusM);
}

interface Hit { time: number; normal: Point; id: string }
/** Analytic moving point against a finite capsule (segment expanded by circle radius). */
function sweepSegment(p: Point, delta: Point, segment: DeckColliderSegment, radius: number): Hit | undefined {
  const edge = sub(segment.b, segment.a), length = Math.hypot(...edge), tangent: Point = [edge[0] / length, edge[1] / length];
  const normal: Point = [-tangent[1], tangent[0]], relative = sub(p, segment.a);
  const width = radius + segment.halfWidthM;
  let best: Hit | undefined;
  const accept = (time: number, n: Point) => {
    if (time >= -EPS && time <= 1 + EPS && dot(delta, n) < -EPS && (!best || time < best.time))
      best = { time: Math.max(0, Math.min(1, time)), normal: n, id: segment.id };
  };
  const speed = dot(delta, normal), start = dot(relative, normal);
  if (Math.abs(speed) > EPS) for (const sign of [-1, 1]) {
    const time = (sign * width - start) / speed;
    const along = dot(add(relative, delta, time), tangent);
    if (along >= -EPS && along <= length + EPS) accept(time, [normal[0] * sign, normal[1] * sign]);
  }
  const aa = dot(delta, delta);
  if (aa > EPS * EPS) for (const endpoint of [segment.a, segment.b]) {
    const offset = sub(p, endpoint), bb = dot(offset, delta), cc = dot(offset, offset) - width * width;
    const discriminant = bb * bb - aa * cc;
    if (discriminant < 0) continue;
    const time = (-bb - Math.sqrt(discriminant)) / aa;
    const contact = sub(add(p, delta, time), endpoint), norm = Math.hypot(...contact);
    if (norm > EPS) accept(time, [contact[0] / norm, contact[1] / norm]);
  }
  return best;
}

export function sweepDeckCircle(frame: DeckCollisionFrame, start: DeckLocation, deltaM: Point, radiusM: number) {
  requireCondition(finitePoint(deltaM, DECK_COLLISION_LIMITS.displacementM), 'invalid displacement');
  requireCondition(inFrame(frame, start), 'wrong ship/deck or invalid position');
  requireCondition(Number.isFinite(radiusM) && radiusM > 0 && radiusM <= DECK_COLLISION_LIMITS.radiusM, 'invalid body radius');
  requireCondition(occupancy(frame, start.position, radiusM), 'starting position is unsupported or penetrating');
  let position = [...start.position] as Point, remaining = [...deltaM] as Point;
  const contacts: string[] = [];
  let exhausted = false;
  for (let iteration = 0; iteration < DECK_COLLISION_LIMITS.slideContacts; iteration++) {
    if (Math.hypot(...remaining) < SKIN) { remaining = [0, 0]; break; }
    let hit: Hit | undefined;
    for (const segment of frame.segments) {
      const candidate = sweepSegment(position, remaining, segment, radiusM);
      if (candidate && (!hit || candidate.time < hit.time - EPS)) hit = candidate;
    }
    if (!hit) { position = add(position, remaining); remaining = [0, 0]; break; }
    position = add(position, remaining, Math.max(0, hit.time - SKIN / Math.hypot(...remaining)));
    remaining = [remaining[0] * (1 - hit.time), remaining[1] * (1 - hit.time)];
    const into = Math.min(0, dot(remaining, hit.normal));
    remaining = add(remaining, hit.normal, -into);
    contacts.push(hit.id);
    if (iteration === DECK_COLLISION_LIMITS.slideContacts - 1 && Math.hypot(...remaining) >= SKIN) exhausted = true;
  }
  // Fail closed on numerical or upstream topology inconsistency; no clamping to another deck.
  if (!occupancy(frame, position, radiusM)) return { position: [...start.position] as Point, contacts, exhausted: true };
  return { position, contacts, exhausted };
}

export function deckLineOfSight(frame: DeckCollisionFrame, from: DeckLocation, to: DeckLocation): boolean {
  if (!inFrame(frame, from) || !inFrame(frame, to)) return false;
  if (![from.position, to.position].every(p => frame.floors.some(poly => inside(p, poly)) && !frame.obstacles.some(o => inside(p, o.vertices)))) return false;
  const delta = sub(to.position, from.position);
  for (const segment of frame.segments) {
    if (distanceToSegment(from.position, segment) <= segment.halfWidthM + EPS || distanceToSegment(to.position, segment) <= segment.halfWidthM + EPS
      || sweepSegment(from.position, delta, segment, EPS)) return false;
  }
  return true;
}
export function canReachOnDeck(frame: DeckCollisionFrame, from: DeckLocation, to: DeckLocation, maximumDistanceM: number): boolean {
  return Number.isFinite(maximumDistanceM) && maximumDistanceM >= 0 && maximumDistanceM <= DECK_COLLISION_LIMITS.coordinateM
    && Math.hypot(...sub(to.position, from.position)) <= maximumDistanceM && deckLineOfSight(frame, from, to);
}
