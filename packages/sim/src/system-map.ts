import {
  MAP_BACKGROUNDS,
  MAP_RESOURCES,
  type AsteroidField,
  type FieldAsteroid,
  type MapPoint,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
export const MAP_LIMITS = {
  bodies: 64,
  fields: 16,
  vertices: 64,
  perField: 2048,
  asteroids: 8192,
  jsonBytes: 128000,
  coordinate: 1e9,
};
const finite = (n: number, min: number, max: number, label: string) => {
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
    throw Error(`${label} must be between ${min} and ${max}`);
};
const id = (s: string) => {
  if (typeof s !== "string" || !/^[a-zA-Z0-9:_-]{1,100}$/.test(s))
    throw Error("Invalid map ID");
};
const name = (s: string) => {
  if (typeof s !== "string" || !s.trim() || s.length > 80)
    throw Error("Name must contain 1–80 characters");
};
const point = (p: MapPoint) => {
  for (const k of ["x", "y", "height"] as const)
    finite(p[k], -MAP_LIMITS.coordinate, MAP_LIMITS.coordinate, k);
};
type XY = { x: number; y: number };
const cross = (a: XY, b: XY, c: XY) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const between = (a: XY, b: XY, c: XY) =>
  cross(a, b, c) === 0 &&
  c.x >= Math.min(a.x, b.x) &&
  c.x <= Math.max(a.x, b.x) &&
  c.y >= Math.min(a.y, b.y) &&
  c.y <= Math.max(a.y, b.y);
function intersects(a: XY, b: XY, c: XY, d: XY) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    between(a, b, c) ||
    between(a, b, d) ||
    between(c, d, a) ||
    between(c, d, b)
  );
}
export function polygonArea(vertices: XY[]) {
  return (
    Math.abs(
      vertices.reduce((sum, a, i) => {
        const b = vertices[(i + 1) % vertices.length];
        return sum + a.x * b.y - b.x * a.y;
      }, 0),
    ) / 2
  );
}
export function insidePolygon(p: XY, vertices: XY[]) {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i],
      b = vertices[j];
    if (between(a, b, p)) return true;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function fieldBounds(f: AsteroidField) {
  return f.shape === "polygon"
    ? {
        minX: Math.min(...f.vertices.map((p) => p.x)),
        maxX: Math.max(...f.vertices.map((p) => p.x)),
        minY: Math.min(...f.vertices.map((p) => p.y)),
        maxY: Math.max(...f.vertices.map((p) => p.y)),
      }
    : {
        minX: -f.width / 2,
        maxX: f.width / 2,
        minY: -f.length / 2,
        maxY: f.length / 2,
      };
}
export function fieldVolume(f: AsteroidField) {
  return f.shape === "ellipsoid"
    ? (Math.PI / 6) * f.width * f.length * f.depth
    : f.shape === "box"
      ? f.width * f.length * f.depth
      : polygonArea(f.vertices) * f.depth;
}
export const fieldCount = (f: AsteroidField) =>
  Math.round((fieldVolume(f) / 1e9) * f.density);
export function containsFieldPoint(f: AsteroidField, p: MapPoint) {
  const x = p.x - f.x,
    y = p.y - f.y,
    h = p.height - f.height;
  if (Math.abs(h) > f.depth / 2) return false;
  if (f.shape === "ellipsoid")
    return (
      ((2 * x) / f.width) ** 2 +
        ((2 * y) / f.length) ** 2 +
        ((2 * h) / f.depth) ** 2 <=
      1
    );
  if (f.shape === "polygon") return insidePolygon({ x, y }, f.vertices);
  return Math.abs(x) <= f.width / 2 && Math.abs(y) <= f.length / 2;
}
export function validateSystemMap(doc: SystemMapDocument) {
  if (!doc || doc.version !== 1) throw Error("Unsupported system map version");
  id(doc.id);
  name(doc.name);
  point(doc.center);
  finite(doc.radius, 1, 1e8, "System radius");
  for (const key of ["x", "y", "height"] as const)
    if (Math.abs(doc.center[key]) + doc.radius > MAP_LIMITS.coordinate)
      throw Error("System exceeds world coordinate bounds");
  if (!MAP_BACKGROUNDS.some((b) => b.id === doc.backgroundId))
    throw Error("Unknown space background");
  if (
    !Array.isArray(doc.bodies) ||
    doc.bodies.length > MAP_LIMITS.bodies ||
    !Array.isArray(doc.fields) ||
    doc.fields.length > MAP_LIMITS.fields
  )
    throw Error("System body or field budget exceeded");
  const ids = new Set<string>();
  const unique = (s: string) => {
    id(s);
    if (ids.has(s)) throw Error("Duplicate map ID");
    ids.add(s);
  };
  const contained = (p: MapPoint, r = 0) => {
    if (
      Math.hypot(
        p.x - doc.center.x,
        p.y - doc.center.y,
        p.height - doc.center.height,
      ) +
        r >
      doc.radius + 1e-7
    )
      throw Error("Body or field is outside the system sphere");
  };
  for (const b of doc.bodies) {
    unique(b.id);
    name(b.name);
    point(b);
    if (!["star", "planet", "moon"].includes(b.kind))
      throw Error("Only celestial bodies may be edited");
    finite(b.radius, 0.01, 1e7, "Body radius");
    contained(b, b.radius);
  }
  let count = 0;
  for (const f of doc.fields) {
    unique(f.id);
    name(f.name);
    point(f);
    if (!["ellipsoid", "box", "polygon"].includes(f.shape))
      throw Error("Unknown field shape");
    for (const k of ["width", "length", "depth"] as const)
      finite(f[k], 1, 1e8, k);
    finite(f.density, 0, 1e9, "Density");
    finite(f.seed, 0, 4294967295, "Seed");
    if (!Number.isInteger(f.seed)) throw Error("Seed must be an integer");
    finite(f.minRadius, 0.1, 1000, "Minimum asteroid radius");
    finite(f.maxRadius, f.minRadius, 1000, "Maximum asteroid radius");
    if (!Array.isArray(f.vertices) || f.vertices.length > MAP_LIMITS.vertices)
      throw Error("Vertex budget exceeded");
    if (f.shape === "polygon") {
      const v = f.vertices;
      if (v.length < 3) throw Error("Draw at least three vertices");
      for (const p of v) {
        finite(p.x, -1e8, 1e8, "Vertex X");
        finite(p.y, -1e8, 1e8, "Vertex Y");
      }
      for (let i = 0; i < v.length; i++) {
        const a = v[i],
          b = v[(i + 1) % v.length];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.01)
          throw Error("Polygon has repeated vertices");
        for (let j = i + 1; j < v.length; j++) {
          if (j === i + 1 || (i === 0 && j === v.length - 1)) continue;
          if (intersects(a, b, v[j], v[(j + 1) % v.length]))
            throw Error("Polygon edges intersect");
        }
      }
      const bb = fieldBounds(f);
      if (
        polygonArea(v) < 1 ||
        polygonArea(v) / ((bb.maxX - bb.minX) * (bb.maxY - bb.minY)) < 0.01
      )
        throw Error("Polygon is too thin for bounded population");
    }
    const bounds = fieldBounds(f);
    // Exact prism corners; ellipsoids use a conservative enclosing sphere.
    // A concave footprint's empty bounding-box corners are not part of its volume.
    if (f.shape === "ellipsoid")
      contained(f, Math.max(f.width, f.length, f.depth) / 2 + f.maxRadius);
    else {
      const corners =
        f.shape === "polygon"
          ? f.vertices
          : [
              { x: bounds.minX, y: bounds.minY },
              { x: bounds.maxX, y: bounds.minY },
              { x: bounds.maxX, y: bounds.maxY },
              { x: bounds.minX, y: bounds.maxY },
            ];
      for (const p of corners)
        for (const h of [-f.depth / 2, f.depth / 2])
          contained(
            { x: f.x + p.x, y: f.y + p.y, height: f.height + h },
            f.maxRadius,
          );
    }
    if (
      !Array.isArray(f.resources) ||
      f.resources.length > MAP_RESOURCES.length
    )
      throw Error("Resource budget exceeded");
    const resources = new Set<string>();
    for (const r of f.resources) {
      if (
        !MAP_RESOURCES.some((s) => s === r.resource) ||
        resources.has(r.resource)
      )
        throw Error("Unknown or duplicate resource");
      resources.add(r.resource);
      finite(r.chance, 0, 100, "Resource chance");
    }
    const n = fieldCount(f);
    if (n > MAP_LIMITS.perField)
      throw Error(
        `Field exceeds ${MAP_LIMITS.perField} asteroids; reduce density or volume`,
      );
    count += n;
  }
  if (count > MAP_LIMITS.asteroids)
    throw Error("System asteroid budget exceeded");
  return count;
}
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Call only after validation. Fixed bounded work; never silently underpopulate. */
export function generateField(f: AsteroidField): FieldAsteroid[] {
  const count = fieldCount(f);
  if (!Number.isSafeInteger(count) || count < 0 || count > MAP_LIMITS.perField)
    throw Error("Invalid population budget");
  const rng = random(f.seed),
    b = fieldBounds(f),
    result: FieldAsteroid[] = [];
  for (
    let attempt = 0;
    result.length < count && attempt < Math.max(1, count) * 1000;
    attempt++
  ) {
    const p = {
      x: f.x + b.minX + rng() * (b.maxX - b.minX),
      y: f.y + b.minY + rng() * (b.maxY - b.minY),
      height: f.height + (rng() - 0.5) * f.depth,
    };
    if (!containsFieldPoint(f, p)) continue;
    const index = result.length;
    result.push({
      ...p,
      id: `${f.id}:${index}`,
      fieldId: f.id,
      radius: f.minRadius + rng() * (f.maxRadius - f.minRadius),
      seed: Math.floor(rng() * 4294967296),
      resources: [...f.resources]
        .sort((a, b) => a.resource.localeCompare(b.resource))
        .filter((r) => rng() * 100 < r.chance)
        .map((r) => r.resource),
    });
  }
  if (result.length !== count)
    throw Error("Population sampling budget exhausted");
  return result;
}
export function readSystemMap(json: string) {
  if (json.length > MAP_LIMITS.jsonBytes) throw Error("Map document too large");
  let doc: SystemMapDocument;
  try {
    doc = JSON.parse(json);
  } catch {
    throw Error("Invalid map JSON");
  }
  validateSystemMap(doc);
  return doc;
}
