/** Candidate-only union boundary of supported, cell-local manufactured solids.
 * Coordinates remain integer global cells. Damage has no spanning replacement sheet. */
import {
  visualCellKey,
  type VisualVolume,
} from "@sidereal/sim/ship-visual-compiler";
import type { VisualCell } from "@sidereal/sim/ship-visual-compiler";

type P = [number, number, number];
export interface FacetPolygon {
  cell: VisualCell;
  points: P[];
  normal: P;
  plane?: string;
  unchangedRaw?: boolean;
}
const dot = (a: readonly number[], p: readonly number[]) =>
  a.reduce((n, v, i) => n + v * p[i], 0);
const same = (a: VisualCell["facet"], b: VisualCell["facet"]) =>
  a?.id === b?.id && a?.d === b?.d && a?.a.join(",") === b?.a.join(",");
const clean = (points: P[]) =>
  points.filter(
    (p, i) => !points.slice(0, i).some((q) => q.every((v, a) => v === p[a])),
  );
/** Sutherland clipping; qualified integer signed45 planes intersect only lattice corners. */
function clip(points: P[], a: readonly number[], d: number, keep = 1): P[] {
  const out: P[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    const x = (dot(a, p) - d) * keep,
      y = (dot(a, q) - d) * keep;
    if (x <= 1e-9) out.push(p);
    if ((x < -1e-9 && y > 1e-9) || (x > 1e-9 && y < -1e-9)) {
      const t = x / (x - y);
      out.push(p.map((v, j) => Math.round(v + t * (q[j] - v))) as P);
    }
  }
  return clean(out);
}
function square(c: VisualCell, axis: number, side: number): P[] {
  const u = (axis + 1) % 3,
    v = (axis + 2) % 3,
    p = [c.x, c.y, c.z];
  p[axis] += side > 0 ? 1 : 0;
  const corners = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  if (side < 0) corners.reverse();
  return corners.map(([U, V]) => {
    const q = [...p];
    q[u] += U;
    q[v] += V;
    return q as P;
  });
}
export function sampledFacetBoundary(cells: VisualVolume): {
  special: Set<string>;
  polygons: FacetPolygon[];
} {
  // Released/default volumes have no descriptor: no array copy, sort or cell meshes.
  let hasFacet = false;
  for (const c of cells.values())
    if (c.facet) {
      hasFacet = true;
      break;
    }
  if (!hasFacet) return { special: new Set(), polygons: [] };
  const qualified = new Map<string, VisualCell>();
  for (const [key, c] of [...cells].sort(
    (a, b) => a[1].z - b[1].z || a[1].y - b[1].y || a[1].x - b[1].x,
  ))
    if (c.facet && c.facetFaces) {
      const p = [c.x + 0.5, c.y + 0.5, c.z + 0.5];
      if (dot(c.facet.a, p) > c.facet.d + 1e-9)
        throw Error("Facet centre outside cell support");
      // Interior cells do not need clipping; exactly the intersected boundary course does.
      const max = dot(c.facet.a, p) + 1;
      if (max <= c.facet.d + 1e-9) continue;
      for (let z = -1; z <= 1; z++)
        for (let y = -1; y <= 1; y++)
          for (let x = -1; x <= 1; x++) {
            const n = cells.get(visualCellKey(c.x + x, c.y + y, c.z + z));
            if (n?.facet && !same(c.facet, n.facet))
              throw Error("Facet patches require raw Chebyshev guard");
          }
      qualified.set(key, c);
    }
  const special = new Set(qualified.keys());
  for (const c of qualified.values())
    for (let axis = 0; axis < 3; axis++)
      for (const side of [-1, 1]) {
        const p = [c.x, c.y, c.z];
        p[axis] += side;
        const key = visualCellKey(...(p as P));
        if (cells.has(key)) special.add(key);
      }
  const polygons: FacetPolygon[] = [];
  for (const key of special) {
    const c = cells.get(key)!,
      own = qualified.get(key)?.facet;
    const planePoints: P[] = [];
    for (let axis = 0; axis < 3; axis++)
      for (const side of [-1, 1]) {
        let points = square(c, axis, side);
        if (own) {
          points = clip(points, own.a, own.d);
          for (const p of points)
            if (Math.abs(dot(own.a, p) - own.d) < 1e-9) planePoints.push(p);
        }
        const q = [c.x, c.y, c.z];
        q[axis] += side;
        const neighbour = cells.get(visualCellKey(...(q as P)));
        if (neighbour) {
          const other = qualified.get(visualCellKey(...(q as P)))?.facet;
          if (!other) continue;
          // Exact retained square minus neighbor coverage; its axis normal is hard.
          points = clip(points, other.a, other.d, -1);
        }
        if (points.length < 3) continue;
        // A plane-touching line has zero area and is not an exposed interface.
        const u = (axis + 1) % 3,
          v = (axis + 2) % 3;
        const area = points.reduce(
          (n, p, i) =>
            n +
            p[u] * points[(i + 1) % points.length][v] -
            p[v] * points[(i + 1) % points.length][u],
          0,
        );
        if (Math.abs(area) < 1e-9) continue;
        const normal: P = [0, 0, 0];
        normal[axis] = side;
        polygons.push({
          cell: c,
          points,
          normal,
          ...(!own &&
          !neighbour &&
          (c.facetNeighbourFaces ?? 0) & (1 << (axis * 2 + (side > 0 ? 1 : 0)))
            ? { unchangedRaw: true }
            : {}),
        });
      }
    if (own) {
      const points = clean(planePoints);
      if (points.length >= 3) {
        const normal = own.a.map((v) => v / Math.SQRT2) as P;
        const u = own.a.findIndex((v) => v !== 0),
          v = own.a.findIndex((v) => v === 0);
        const centre = points.reduce(
          (p, q) => p.map((n, a) => n + q[a] / points.length) as P,
          [0, 0, 0],
        );
        points.sort(
          (a, b) =>
            Math.atan2(a[v] - centre[v], a[u] - centre[u]) -
            Math.atan2(b[v] - centre[v], b[u] - centre[u]),
        );
        const A = points[0],
          B = points[1],
          C = points[2];
        const cross = [
          (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]),
          (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]),
          (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]),
        ];
        if (dot(cross, normal) < 0) points.reverse();
        polygons.push({
          cell: c,
          points,
          normal,
          plane: `${own.id}:${own.a.join(",")}:${own.d}`,
        });
      }
    }
  }
  // Coalesce only complete unit rectangles. The greedy coverage map is the
  // current-cell support proof: removed cells and material/patch ends stop it.
  const rectangular = new Map<string, Map<string, FacetPolygon>>();
  const result: FacetPolygon[] = [];
  for (const face of polygons) {
    if (!face.plane || face.points.length !== 4) {
      result.push(face);
      continue;
    }
    const a = face.cell.facet!.a,
      u = a.findIndex((v) => v !== 0),
      v = a.findIndex((v) => v === 0);
    const U = Math.min(...face.points.map((p) => p[u])),
      V = Math.min(...face.points.map((p) => p[v]));
    const key = `${face.plane}:${face.cell.family}:${face.cell.role}:${face.cell.slot}:${face.cell.surfaceRole ?? ""}`;
    let map = rectangular.get(key);
    if (!map) rectangular.set(key, (map = new Map()));
    if (map.has(`${U},${V}`))
      throw Error("Duplicate manufactured facet support");
    map.set(`${U},${V}`, face);
  }
  for (const map of rectangular.values())
    for (const [key, face] of [...map].sort((a, b) => {
      const A = a[0].split(",").map(Number),
        B = b[0].split(",").map(Number);
      return A[1] - B[1] || A[0] - B[0];
    })) {
      if (!map.has(key)) continue;
      const [U, V] = key.split(",").map(Number);
      let w = 1,
        h = 1;
      while (map.has(`${U + w},${V}`)) w++;
      outer: while (true) {
        for (let x = 0; x < w; x++)
          if (!map.has(`${U + x},${V + h}`)) break outer;
        h++;
      }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) map.delete(`${U + x},${V + y}`);
      const { a, d } = face.cell.facet!,
        u = a.findIndex((v) => v !== 0),
        v = a.findIndex((v) => v === 0),
        other = [0, 1, 2].find((i) => i !== u && i !== v)!;
      let points = [
        [U, V],
        [U + w, V],
        [U + w, V + h],
        [U, V + h],
      ].map(([x, y]) => {
        const p: P = [0, 0, 0];
        p[u] = x;
        p[v] = y;
        p[other] = (d - a[u] * x) / a[other];
        return p;
      });
      const A = points[0],
        B = points[1],
        C = points[2];
      const cross = [
        (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]),
        (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]),
        (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]),
      ];
      if (dot(cross, face.normal) < 0) points = points.reverse();
      result.push({ ...face, points });
    }
  return { special, polygons: result };
}
