import {
  MAP_BACKGROUNDS,
  systemCenter,
  type MapPoint,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import type { MapZone, ZoneVector } from "@sidereal/content/zones";
import { compileZonePath } from "./zone-path";
export const ZONE_LIMITS = { zones: 48, depth: 8, edges: 8192, history: 128 };
export interface CompiledZone extends MapZone {
  parentId?: string;
  level: number;
  ancestors: string[];
  root?: boolean;
  bounds?: { minX: number; maxX: number; minY: number; maxY: number };
}
const cross = (a: ZoneVector, b: ZoneVector, c: ZoneVector) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onEdge = (a: ZoneVector, b: ZoneVector, p: ZoneVector) =>
  Math.abs(cross(a, b, p)) < 1e-8 &&
  p.x >= Math.min(a.x, b.x) - 1e-9 &&
  p.x <= Math.max(a.x, b.x) + 1e-9 &&
  p.y >= Math.min(a.y, b.y) - 1e-9 &&
  p.y <= Math.max(a.y, b.y) + 1e-9;
export function zonePolygonContains(p: ZoneVector, v: readonly ZoneVector[]) {
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const a = v[i],
      b = v[j];
    if (onEdge(a, b, p)) return true;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function validateZonePolygon(v: readonly ZoneVector[]) {
  let area = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i],
      b = v[(i + 1) % v.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6)
      throw Error("Zone has repeated vertices or collapsed edges");
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 2; j < v.length; j++) {
      if (i === 0 && j === v.length - 1) continue;
      const c = v[j],
        d = v[(j + 1) % v.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 &&
          cross(c, d, a) * cross(c, d, b) < 0) ||
        onEdge(a, b, c) ||
        onEdge(a, b, d) ||
        onEdge(c, d, a) ||
        onEdge(c, d, b)
      )
        throw Error("Zone edges intersect");
    }
  }
  if (Math.abs(area) < 2)
    throw Error("Zone area must be at least one square metre");
}
/** Normalize legacy fields without exposing their population/resource data. */
export function compileZones(doc: SystemMapDocument): CompiledZone[] {
  if (doc.zones !== undefined && !Array.isArray(doc.zones))
    throw Error("Invalid zones");
  const center = systemCenter(doc);
  const source: MapZone[] = [
    {
      id: doc.id,
      name: doc.name,
      color: doc.color,
      backgroundId: doc.backgroundId,
      feather: doc.feather,
      x: center.x,
      y: center.y,
      height: center.height,
      shape: "ellipsoid",
      width: doc.radius * 2,
      length: doc.radius * 2,
      depth: doc.radius * 2,
      vertices: [],
    },
    ...doc.fields,
    ...(doc.zones ?? []),
  ];
  if (source.length > ZONE_LIMITS.zones)
    throw Error("Zone budget exceeded (48 including root and fields)");
  const zones = new Map<string, CompiledZone>(),
    bodyIds = new Set(doc.bodies.map((b) => b.id));
  let edges = 0;
  for (let i = 0; i < source.length; i++) {
    const z = source[i];
    if (
      !z ||
      typeof z.id !== "string" ||
      !/^[a-zA-Z0-9:_-]{1,100}$/.test(z.id) ||
      zones.has(z.id) ||
      (i > 0 && bodyIds.has(z.id))
    )
      throw Error("Invalid or duplicate zone ID");
    if (typeof z.name !== "string" || !z.name.trim() || z.name.length > 80)
      throw Error("Zone name must contain 1–80 characters");
    if (
      z.parentId !== undefined &&
      (typeof z.parentId !== "string" ||
        !/^[a-zA-Z0-9:_-]{1,100}$/.test(z.parentId))
    )
      throw Error("Invalid zone parent ID");
    if (z.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(z.color))
      throw Error("Zone color must be a six-digit hex color");
    if (!["ellipsoid", "box", "polygon"].includes(z.shape))
      throw Error("Invalid zone shape");
    for (const k of ["x", "y", "height"] as const)
      if (!Number.isFinite(z[k]) || Math.abs(z[k]) > 1e9)
        throw Error("Invalid zone coordinates");
    for (const k of ["width", "length", "depth"] as const)
      if (!Number.isFinite(z[k]) || z[k] < 1 || z[k] > 2e8)
        throw Error("Invalid zone dimensions");
    if (
      z.backgroundId !== undefined &&
      !MAP_BACKGROUNDS.some((b) => b.id === z.backgroundId)
    )
      throw Error("Unknown zone background");
    if (
      z.feather !== undefined &&
      (!Number.isFinite(z.feather) || z.feather < 0 || z.feather > 1e8)
    )
      throw Error("Invalid zone feather");
    if (
      z.priority !== undefined &&
      (!Number.isInteger(z.priority) || Math.abs(z.priority) > 100)
    )
      throw Error("Invalid zone priority");
    const vertices = z.shape === "polygon" ? compileZonePath(z.vertices) : [];
    if (vertices.length) validateZonePolygon(vertices);
    edges += vertices.length;
    if (edges > ZONE_LIMITS.edges)
      throw Error("Total zone edge budget exceeded");
    const ex = vertices.length
        ? Math.max(...vertices.map((p) => Math.abs(p.x)))
        : z.width / 2,
      ey = vertices.length
        ? Math.max(...vertices.map((p) => Math.abs(p.y)))
        : z.length / 2;
    if (
      Math.abs(z.x) + ex > 1e9 ||
      Math.abs(z.y) + ey > 1e9 ||
      Math.abs(z.height) + z.depth / 2 > 1e9
    )
      throw Error("Zone exceeds coordinate bounds");
    // Explicit projection: never spread asteroid population into public geometry.
    zones.set(z.id, {
      id: z.id,
      name: z.name,
      color: z.color,
      parentId: i ? (z.parentId ?? doc.id) : undefined,
      backgroundId: z.backgroundId,
      feather: z.feather,
      priority: z.priority,
      x: z.x,
      y: z.y,
      height: z.height,
      shape: z.shape,
      width: z.width,
      length: z.length,
      depth: z.depth,
      vertices,
      root: i === 0,
      level: 0,
      ancestors: [],
      bounds: { minX: -ex, maxX: ex, minY: -ey, maxY: ey },
    });
  }
  for (const z of zones.values()) {
    let p = z.parentId;
    const seen = new Set([z.id]);
    while (p) {
      if (seen.has(p)) throw Error("Zone hierarchy cycle");
      seen.add(p);
      const parent = zones.get(p);
      if (!parent) throw Error("Zone parent does not exist");
      z.ancestors.unshift(p);
      if (z.ancestors.length > ZONE_LIMITS.depth)
        throw Error("Zone nesting exceeds eight levels");
      p = parent.parentId;
    }
    z.level = z.ancestors.length;
  }
  return [...zones.values()].sort(
    (a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
export function zoneContains(z: MapZone, p: MapPoint) {
  const x = p.x - z.x,
    y = p.y - z.y,
    h = p.height - z.height;
  if (Math.abs(h) > z.depth / 2) return false;
  const bounds = (z as CompiledZone).bounds;
  if (
    bounds &&
    (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY)
  )
    return false;
  if (z.shape === "ellipsoid")
    return (
      ((2 * x) / z.width) ** 2 +
        ((2 * y) / z.length) ** 2 +
        ((2 * h) / z.depth) ** 2 <=
      1
    );
  return z.shape === "box"
    ? Math.abs(x) <= z.width / 2 && Math.abs(y) <= z.length / 2
    : zonePolygonContains({ x, y }, z.vertices);
}
export interface ZoneWork {
  remaining: number;
}
export class ZoneBudgetError extends Error {
  constructor() {
    super("zone-work-budget");
  }
}
function spend(work: ZoneWork | undefined, n: number) {
  if (work && (work.remaining -= n) < 0) throw new ZoneBudgetError();
}
export function zoneMembership(
  zones: readonly CompiledZone[],
  p: MapPoint,
  work?: ZoneWork,
): string[] {
  spend(
    work,
    zones.reduce((n, z) => n + Math.max(1, z.vertices.length), 0),
  );
  const inside = new Set<string>();
  for (const z of zones)
    if (z.ancestors.every((id) => inside.has(id)) && zoneContains(z, p))
      inside.add(z.id);
  return [...inside];
}
export interface ZoneChange {
  zoneId: string;
  entered: boolean;
  fraction: number;
}
export function zoneChanges(
  zones: readonly CompiledZone[],
  before: readonly string[],
  after: readonly string[],
  fraction = 1,
): ZoneChange[] {
  const levels = new Map(zones.map((z) => [z.id, z.level]));
  return [
    ...before
      .filter((id) => !after.includes(id))
      .sort(
        (a, b) =>
          (levels.get(b) ?? 99) - (levels.get(a) ?? 99) ||
          (a < b ? -1 : a > b ? 1 : 0),
      )
      .map((zoneId) => ({ zoneId, entered: false, fraction })),
    ...after
      .filter((id) => !before.includes(id))
      .sort(
        (a, b) =>
          (levels.get(a) ?? 0) - (levels.get(b) ?? 0) ||
          (a < b ? -1 : a > b ? 1 : 0),
      )
      .map((zoneId) => ({ zoneId, entered: true, fraction })),
  ];
}
/** Sweep compiled boundaries, then classify open intervals. Isolated tangencies do not enter. */
export function sweepZones(
  zones: readonly CompiledZone[],
  from: MapPoint,
  to: MapPoint,
  initial = zoneMembership(zones, from),
  work?: ZoneWork,
) {
  const cuts = [0, 1],
    dx = to.x - from.x,
    dy = to.y - from.y,
    dh = to.height - from.height;
  const push = (t: number) => {
    if (t > 0 && t < 1 && Number.isFinite(t)) cuts.push(t);
  };
  for (const z of zones) {
    spend(work, Math.max(1, z.vertices.length));
    const bb = z.bounds;
    if (
      bb &&
      (Math.max(from.x, to.x) < z.x + bb.minX ||
        Math.min(from.x, to.x) > z.x + bb.maxX ||
        Math.max(from.y, to.y) < z.y + bb.minY ||
        Math.min(from.y, to.y) > z.y + bb.maxY)
    )
      continue;
    const x = from.x - z.x,
      y = from.y - z.y,
      h = from.height - z.height;
    if (z.shape === "ellipsoid") {
      const a =
          ((2 * dx) / z.width) ** 2 +
          ((2 * dy) / z.length) ** 2 +
          ((2 * dh) / z.depth) ** 2,
        b =
          8 *
          ((x * dx) / z.width ** 2 +
            (y * dy) / z.length ** 2 +
            (h * dh) / z.depth ** 2),
        c =
          ((2 * x) / z.width) ** 2 +
          ((2 * y) / z.length) ** 2 +
          ((2 * h) / z.depth) ** 2 -
          1,
        disc = b * b - 4 * a * c;
      if (a > 0 && disc >= 0) {
        push((-b - Math.sqrt(disc)) / (2 * a));
        push((-b + Math.sqrt(disc)) / (2 * a));
      }
    } else {
      if (dh) {
        push((-z.depth / 2 - h) / dh);
        push((z.depth / 2 - h) / dh);
      }
      if (z.shape === "box") {
        if (dx) {
          push((-z.width / 2 - x) / dx);
          push((z.width / 2 - x) / dx);
        }
        if (dy) {
          push((-z.length / 2 - y) / dy);
          push((z.length / 2 - y) / dy);
        }
      } else
        for (let i = 0; i < z.vertices.length; i++) {
          const a = z.vertices[i],
            b = z.vertices[(i + 1) % z.vertices.length],
            ex = b.x - a.x,
            ey = b.y - a.y,
            den = dx * ey - dy * ex;
          if (Math.abs(den) > 1e-16) {
            const t = ((a.x - x) * ey - (a.y - y) * ex) / den,
              u = ((a.x - x) * dy - (a.y - y) * dx) / den;
            if (u >= 0 && u <= 1) push(t);
          }
        }
    }
  }
  cuts.sort((a, b) => a - b);
  const unique = cuts.filter((t, i) => !i || t !== cuts[i - 1]);
  let active = [...initial];
  const changes: ZoneChange[] = [];
  const at = (t: number) => ({
    x: from.x + dx * t,
    y: from.y + dy * t,
    height: from.height + dh * t,
  });
  for (let i = 0; i < unique.length - 1; i++) {
    const next = zoneMembership(
      zones,
      at((unique[i] + unique[i + 1]) / 2),
      work,
    );
    changes.push(...zoneChanges(zones, active, next, unique[i]));
    active = next;
  }
  const final = zoneMembership(zones, to, work);
  changes.push(...zoneChanges(zones, active, final, 1));
  return { active: final, changes };
}
