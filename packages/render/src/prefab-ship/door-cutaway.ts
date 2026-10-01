/** Closed, indexed display derivatives. Source leaf geometry and animation stay untouched. */
import type { GlbGeometry, GlbPrimitive } from "./glb-library";

type P = [number, number, number];
type Vertex = { p: P; n: P; uv?: number[]; uv2?: number[]; tangent?: number[] };
export type DoorLeafCutResult =
  | { ok: true; geometry: GlbGeometry; capTriangles: number }
  | { ok: false; reason: string };

const EPS = 1e-7;
const key = (p: P) => p.map((v) => Math.round(v / EPS)).join(",");
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const cross2 = (a: P, b: P, c: P) =>
  (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
const area = (loop: P[]) =>
  loop.reduce((s, p, i) => {
    const q = loop[(i + 1) % loop.length];
    return s + p[0] * q[2] - q[0] * p[2];
  }, 0) / 2;

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}

/** Positional welding validates solid topology, without welding authored UV/normal seams. */
function topology(triangles: P[][]) {
  const edges = new Map<string, { a: string; b: string; triangle: number }[]>();
  const points = new Map<string, P>();
  triangles.forEach((ps, triangle) => {
    const keys = ps.map((p) => key(p));
    require(new Set(keys).size === 3, "Degenerate positional triangle");
    const ab = ps[1].map((v, i) => v - ps[0][i]),
      ac = ps[2].map((v, i) => v - ps[0][i]);
    require(Math.hypot(
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ) > 1e-12, "Zero-area triangle");
    keys.forEach((k, i) => points.set(k, ps[i]));
    for (let i = 0; i < 3; i++) {
      const a = keys[i],
        b = keys[(i + 1) % 3],
        k = edgeKey(a, b);
      const list = edges.get(k) ?? [];
      list.push({ a, b, triangle });
      edges.set(k, list);
    }
  });
  return { edges, points };
}

function components(triangles: P[][]): number[][] {
  const { edges } = topology(triangles);
  const adjacent: number[][] = triangles.map(() => []);
  for (const list of edges.values()) {
    require(list.length === 2, "Source solid is open or nonmanifold");
    require(list[0].a === list[1].b &&
      list[0].b === list[1].a, "Source winding mismatch");
    adjacent[list[0].triangle].push(list[1].triangle);
    adjacent[list[1].triangle].push(list[0].triangle);
  }
  const visited = new Set<number>(),
    result: number[][] = [];
  for (let start = 0; start < triangles.length; start++) {
    if (visited.has(start)) continue;
    const group = [start];
    visited.add(start);
    for (let i = 0; i < group.length; i++)
      for (const n of adjacent[group[i]])
        if (!visited.has(n)) {
          visited.add(n);
          group.push(n);
        }
    const origin = triangles[start][0];
    const volume =
      group.reduce((sum, index) => {
        const [a, b, c] = triangles[index].map((p) =>
          p.map((v, i) => v - origin[i]),
        );
        return (
          sum +
          a[0] * (b[1] * c[2] - b[2] * c[1]) +
          a[1] * (b[2] * c[0] - b[0] * c[2]) +
          a[2] * (b[0] * c[1] - b[1] * c[0])
        );
      }, 0) / 6;
    require(volume > 1e-12, "Source solid is inverted or has zero volume");
    result.push(group);
  }
  return result;
}

function intersect(
  a: Vertex,
  b: Vertex,
  y: number,
  points: Map<string, P>,
): Vertex {
  const t = (y - a.p[1]) / (b.p[1] - a.p[1]);
  const lerp = (u: readonly number[], v: readonly number[]) =>
    u.map((x, i) => x + (v[i] - x) * t);
  const k = edgeKey(key(a.p), key(b.p));
  let p = points.get(k);
  if (!p) {
    p = lerp(a.p, b.p).map(Math.fround) as P;
    p[1] = y;
    points.set(k, p);
  }
  const n = lerp(a.n, b.n) as P,
    length = Math.hypot(...n);
  require(length > 1e-12, "Opposed normals at cut intersection");
  for (let i = 0; i < 3; i++) n[i] /= length;
  if (a.tangent && b.tangent)
    require(a.tangent[3] === b.tangent[3], "Incompatible tangent handedness");
  return {
    p,
    n,
    ...(a.uv && b.uv ? { uv: lerp(a.uv, b.uv) } : {}),
    ...(a.uv2 && b.uv2 ? { uv2: lerp(a.uv2, b.uv2) } : {}),
    ...(a.tangent && b.tangent ? { tangent: lerp(a.tangent, b.tangent) } : {}),
  };
}

function inside(p: P, loop: P[]) {
  let value = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i],
      b = loop[j];
    if (
      a[2] > p[2] !== b[2] > p[2] &&
      p[0] < ((b[0] - a[0]) * (p[2] - a[2])) / (b[2] - a[2]) + a[0]
    )
      value = !value;
  }
  return value;
}

function touches(a: P, b: P, c: P, d: P) {
  const on = (p: P, q: P, r: P) =>
    Math.abs(cross2(p, q, r)) < 1e-12 &&
    r[0] >= Math.min(p[0], q[0]) - EPS &&
    r[0] <= Math.max(p[0], q[0]) + EPS &&
    r[2] >= Math.min(p[2], q[2]) - EPS &&
    r[2] <= Math.max(p[2], q[2]) + EPS;
  return (
    (cross2(a, b, c) * cross2(a, b, d) < 0 &&
      cross2(c, d, a) * cross2(c, d, b) < 0) ||
    on(a, b, c) ||
    on(a, b, d) ||
    on(c, d, a) ||
    on(c, d, b)
  );
}

/** Ear clipping retains every contour edge, including collinear source-triangle intersections. */
function triangulate(loop: P[]): P[][] {
  require(area(loop) < -1e-12, "Cut contour winding is not outward +Y");
  const points = [...loop],
    result: P[][] = [];
  while (points.length > 3) {
    let ear = -1,
      largest = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      const size = -cross2(a, b, c);
      const tolerance =
        EPS *
        Math.max(
          Math.hypot(b[0] - a[0], b[2] - a[2]),
          Math.hypot(c[0] - b[0], c[2] - b[2]),
          Math.hypot(a[0] - c[0], a[2] - c[2]),
        );
      if (size <= tolerance) continue;
      const blocked = points.some(
        (p) =>
          p !== a &&
          p !== b &&
          p !== c &&
          cross2(a, b, p) <= 1e-12 &&
          cross2(b, c, p) <= 1e-12 &&
          cross2(c, a, p) <= 1e-12,
      );
      if (blocked) continue;
      if (size > largest) {
        largest = size;
        ear = i;
      }
    }
    require(ear >= 0, "Unsupported or degenerate cut polygon");
    result.push([
      points[(ear + points.length - 1) % points.length],
      points[ear],
      points[(ear + 1) % points.length],
    ]);
    points.splice(ear, 1);
  }
  require(cross2(points[0], points[1], points[2]) <
    -1e-12, "Degenerate final cut triangle");
  result.push(points);
  return result;
}

function caps(triangles: Vertex[][], y: number): P[][] {
  if (!triangles.length) return [];
  const { edges, points } = topology(triangles.map((t) => t.map((v) => v.p)));
  const outgoing = new Map<string, string>(),
    incoming = new Map<string, number>();
  for (const list of edges.values()) {
    if (list.length === 2) {
      require(list[0].a === list[1].b &&
        list[0].b === list[1].a, "Retained surface winding mismatch");
      continue;
    }
    require(list.length === 1, "Retained surface is nonmanifold");
    const { a, b } = list[0];
    require(points.get(a)![1] === y &&
      points.get(b)![1] === y, "Open edge outside cut plane");
    // Reverse retained boundary edges to obtain the cap's outward orientation.
    require(!outgoing.has(b), "Branching cut contour");
    outgoing.set(b, a);
    incoming.set(a, (incoming.get(a) ?? 0) + 1);
  }
  for (const k of outgoing.keys())
    require(incoming.get(k) === 1, "Open cut contour");
  const loops: P[][] = [];
  while (outgoing.size) {
    const start = outgoing.keys().next().value!;
    let current = start;
    const loop: P[] = [];
    do {
      loop.push(points.get(current)!);
      const next = outgoing.get(current);
      require(next !== undefined, "Incomplete cut loop");
      outgoing.delete(current);
      current = next;
      require(loop.length <= 256, "Cut contour budget exceeded");
    } while (current !== start);
    require(loop.length >= 3, "Degenerate cut loop");
    loops.push(loop);
  }
  for (let i = 0; i < loops.length; i++) {
    const a = loops[i];
    for (let u = 0; u < a.length; u++)
      for (let v = u + 1; v < a.length; v++) {
        if (v === u + 1 || (u === 0 && v === a.length - 1)) continue;
        require(!touches(
          a[u],
          a[(u + 1) % a.length],
          a[v],
          a[(v + 1) % a.length],
        ), "Self-intersecting cut contour");
      }
    for (let j = i + 1; j < loops.length; j++) {
      const b = loops[j];
      require(!inside(a[0], b) &&
        !inside(b[0], a), "Nested-hole cut section unsupported");
      for (let u = 0; u < a.length; u++)
        for (let v = 0; v < b.length; v++)
          require(!touches(
            a[u],
            a[(u + 1) % a.length],
            b[v],
            b[(v + 1) % b.length],
          ), "Touching or overlapping cut loops");
    }
  }
  return loops.flatMap(triangulate);
}

function bounds(positions: readonly P[]): GlbPrimitive["bounds"] {
  const b: GlbPrimitive["bounds"] = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];
  for (const p of positions)
    for (let a = 0; a < 3; a++) {
      b[a] = Math.min(b[a], p[a]);
      b[a + 3] = Math.max(b[a + 3], p[a]);
    }
  return b;
}

/** An empty material primitive is omitted; callers must not substitute a box for that slot. */
export function clipDoorLeaf(
  geometry: GlbGeometry,
  localY: number,
): DoorLeafCutResult {
  try {
    require(Number.isFinite(localY), "Nonfinite cut height");
    require(geometry.primitives.length > 0 &&
      geometry.primitives.length <= 32, "Door primitive budget exceeded");
    const y = Math.fround(localY),
      primitives: GlbPrimitive[] = [];
    let capTriangles = 0,
      total = 0;
    for (const source of geometry.primitives) {
      require(!source.colors, "Colored leaf cutaway unsupported");
      const count = source.positions.length / 3;
      require(Number.isInteger(count) &&
        count > 0 &&
        count <= 32768, "Invalid source positions");
      require(source.normals.length === count * 3, "Invalid source normals");
      for (const [channel, width] of [
        [source.uvs, 2],
        [source.uvs2, 2],
        [source.tangents, 4],
      ] as const)
        require(!channel ||
          channel.length === count * width, "Invalid source channel length");
      for (const channel of [
        source.positions,
        source.normals,
        source.uvs,
        source.uvs2,
        source.tangents,
      ])
        require(!channel ||
          Array.from(channel).every(
            Number.isFinite,
          ), "Nonfinite source channel");
      require(source.indices.length > 0 &&
        source.indices.length % 3 === 0, "Invalid source indices");
      total += source.indices.length / 3;
      require(total <= 8192, "Door triangle budget exceeded");
      const vertices: Vertex[] = Array.from({ length: count }, (_, i) => ({
        p: Array.from(source.positions.subarray(i * 3, i * 3 + 3)) as P,
        n: Array.from(source.normals.subarray(i * 3, i * 3 + 3)) as P,
        ...(source.uvs
          ? { uv: [source.uvs[i * 2], source.uvs[i * 2 + 1]] }
          : {}),
        ...(source.uvs2
          ? { uv2: [source.uvs2[i * 2], source.uvs2[i * 2 + 1]] }
          : {}),
        ...(source.tangents
          ? {
              tangent: Array.from(
                { length: 4 },
                (_, k) => source.tangents![i * 4 + k],
              ),
            }
          : {}),
      }));
      const triangles: Vertex[][] = [];
      for (let i = 0; i < source.indices.length; i += 3) {
        const ix = Array.from(source.indices.subarray(i, i + 3));
        require(ix.every(
          (index) => Number.isInteger(index) && index >= 0 && index < count,
        ), "Out-of-range source index");
        triangles.push(ix.map((index) => vertices[index]));
      }
      const solids = components(triangles.map((t) => t.map((v) => v.p))),
        result: Vertex[][] = [];
      for (const solid of solids) {
        const retained: Vertex[][] = [],
          intersections = new Map<string, P>();
        for (const index of solid) {
          const input = triangles[index],
            polygon: Vertex[] = [];
          for (let i = 0; i < 3; i++) {
            const a = input[i],
              b = input[(i + 1) % 3];
            if (a.p[1] <= y) polygon.push(a);
            if ((a.p[1] < y && b.p[1] > y) || (a.p[1] > y && b.p[1] < y))
              polygon.push(intersect(a, b, y, intersections));
          }
          for (let i = 1; i + 1 < polygon.length; i++)
            retained.push([polygon[0], polygon[i], polygon[i + 1]]);
        }
        const cap = caps(retained, y);
        capTriangles += cap.length;
        for (const ps of cap)
          retained.push(
            ps.map((p) => ({
              p,
              n: [0, 1, 0],
              ...(source.uvs ? { uv: [p[0], p[2]] } : {}),
              ...(source.uvs2 ? { uv2: [p[0], p[2]] } : {}),
              ...(source.tangents ? { tangent: [1, 0, 0, -1] } : {}),
            })),
          );
        if (retained.length) components(retained.map((t) => t.map((v) => v.p)));
        result.push(...retained);
      }
      if (!result.length) continue;
      const vs = result.flat(),
        positions = Float32Array.from(vs.flatMap((v) => v.p));
      // Float32 output must itself stay closed, rather than only the intermediate double data.
      const ps = Array.from(
        { length: vs.length },
        (_, i) => Array.from(positions.subarray(i * 3, i * 3 + 3)) as P,
      );
      components(
        Array.from({ length: result.length }, (_, i) =>
          ps.slice(i * 3, i * 3 + 3),
        ),
      );
      primitives.push({
        material: source.material,
        positions,
        normals: Float32Array.from(vs.flatMap((v) => v.n)),
        indices: Uint32Array.from(vs.map((_, i) => i)),
        triangles: result.length,
        bounds: bounds(ps),
        ...(source.uvs
          ? { uvs: Float32Array.from(vs.flatMap((v) => v.uv!)) }
          : {}),
        ...(source.uvs2
          ? { uvs2: Float32Array.from(vs.flatMap((v) => v.uv2!)) }
          : {}),
        ...(source.tangents
          ? { tangents: Float32Array.from(vs.flatMap((v) => v.tangent!)) }
          : {}),
      });
    }
    require(primitives.length > 0, "Cut leaves no geometry");
    return {
      ok: true,
      geometry: {
        url: geometry.url,
        primitives,
        triangles: primitives.reduce((s, p) => s + p.triangles, 0),
        bounds: bounds(
          primitives.flatMap((p) =>
            Array.from(
              { length: p.positions.length / 3 },
              (_, i) => Array.from(p.positions.subarray(i * 3, i * 3 + 3)) as P,
            ),
          ),
        ),
      },
      capTriangles,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
