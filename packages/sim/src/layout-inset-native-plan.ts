import corner from "@sidereal/content/ship-tileset-corner-spec.v1.json";
import internal from "@sidereal/content/ship-tileset-internal-spec.v1.json";
import union from "@sidereal/content/ship-tileset-union-junction-spec.v1.json";
import type { Point } from "@sidereal/content/ship-layout";
import type { LayoutWall } from "./layout-compiler";

type Family =
  "convex-r004" | "internal-r000" | "union-r001" | "wayfarer-rebuild-r001";
export interface AdditionalInsetNativeShape {
  family: "wayfarer-rebuild-r001";
  id: "internal-span-0.125";
  polygon: Point[];
  length: 0.125;
}
interface Placement {
  key: string;
  family: Family;
  profileId: string;
  quarterHeight: 1 | 2 | 3 | 4;
  originUnits: [number, number, number];
  quarterTurns: number;
  /** Derived visual-only orientation; never an authority/collision grant. */
  yawRadians?: number;
}
interface Shape {
  family: Family;
  id: string;
  polygon: Point[];
  length?: number;
}
const baseShapes: Shape[] = [
  ...corner.profiles.map((p) => ({
    family: "convex-r004" as const,
    id: p.id,
    polygon: p.reservationPolygonM as Point[],
    length: "lengthM" in p ? p.lengthM : undefined,
  })),
  ...internal.shapes.map((p) => ({
    family: "internal-r000" as const,
    id: p.id,
    polygon: p.reservationPolygonM as Point[],
    length: "lengthM" in p ? p.lengthM : undefined,
  })),
  ...union.shapes.map((p) => ({
    family: "union-r001" as const,
    id: p.id,
    polygon: p.reservationPolygonM as Point[],
    length: "lengthM" in p ? p.lengthM : undefined,
  })),
];
const key = (p: Point) => p.join(",");
const rotate = ([x, y]: Point, q: number): Point =>
  (
    [
      [x, y],
      [-y, x],
      [-x, -y],
      [y, -x],
    ] as Point[]
  )[q];
const direction = (a: Point, b: Point): Point => [
  Math.sign(b[0] - a[0]),
  Math.sign(b[1] - a[1]),
];
const angle = ([x, y]: Point) => (x === 1 ? 0 : y === 1 ? 1 : x === -1 ? 2 : 3);
const on = (p: Point, a: Point, b: Point) =>
  (a[0] === b[0] ? p[0] === a[0] : p[1] === a[1]) &&
  p[0] >= Math.min(a[0], b[0]) &&
  p[0] <= Math.max(a[0], b[0]) &&
  p[1] >= Math.min(a[1], b[1]) &&
  p[1] <= Math.max(a[1], b[1]);
function inside(p: Point, polygon: readonly Point[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}

/** Nominal orthogonal geometry proof only. No GLB, pressure or collision grant. */
interface InsetNativeBoundaryInput {
  walls: readonly LayoutWall[];
  deckId: string;
  elevationUnits: number;
  floorThicknessUnits: number;
  floorPolygons: readonly Point[][];
  allowDiagonalVisuals?: boolean;
  /** Exact audited rebuild filler only; caller must also pin its delivery. */
  additionalShapes?: readonly AdditionalInsetNativeShape[];
}
interface InsetNativeBoundaryResult {
  placements: Placement[];
  issues: { key: string; message: string }[];
  physicalQualification: "unqualified";
}
export function planInsetNativeBoundary(
  input: Omit<InsetNativeBoundaryInput, "additionalShapes"> & {
    additionalShapes?: undefined;
  },
): Omit<InsetNativeBoundaryResult, "placements"> & {
  placements: (Omit<Placement, "family"> & {
    family: "convex-r004" | "internal-r000" | "union-r001";
  })[];
};
export function planInsetNativeBoundary(
  input: InsetNativeBoundaryInput,
): InsetNativeBoundaryResult;
export function planInsetNativeBoundary(input: InsetNativeBoundaryInput) {
  const issues: { key: string; message: string }[] = [];
  const placements: Placement[] = [];
  const fail = (k: string, message: string) => {
    if (issues.length < 128) issues.push({ key: k, message });
  };
  const result = () => ({
    placements: issues.length ? [] : placements,
    issues,
    physicalQualification: "unqualified" as const,
  });
  const walls = input.walls
    .filter((w) => w.deckId === input.deckId)
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key));
  if (
    walls.length > 1024 ||
    input.floorPolygons.length > 1024 ||
    !Number.isSafeInteger(input.elevationUnits) ||
    input.floorThicknessUnits !== 6
  ) {
    fail("input", "Unsupported datum or work budget");
    return result();
  }
  const extra = input.additionalShapes ?? [];
  if (
    extra.length > 1 ||
    extra.some(
      (s) =>
        s.family !== "wayfarer-rebuild-r001" ||
        s.id !== "internal-span-0.125" ||
        s.length !== 0.125 ||
        JSON.stringify(s.polygon) !==
          JSON.stringify([
            [0, -0.125],
            [0.125, -0.125],
            [0.125, 0.125],
            [0, 0.125],
          ]),
    ) ||
    (extra.length &&
      (input.allowDiagonalVisuals ||
        walls.some((w) => w.treatment?.heightUnits !== 96)))
  ) {
    fail(
      "additional-shapes",
      "Unsupported additional native profile, footprint or height",
    );
    return result();
  }
  const shapes: Shape[] = [...baseShapes, ...extra];
  for (const w of walls)
    if (
      !w.treatment ||
      w.treatment.floorThicknessUnits !== 6 ||
      ![24, 48, 72, 96].includes(w.treatment.heightUnits) ||
      !["auto", "vertical-hull", "bulkhead"].includes(w.treatment.intent) ||
      w.treatment.native ||
      (w.source === "partition" && w.treatment.reservationSide !== "center") ||
      ![...w.a, ...w.b].every(
        (n) => Number.isSafeInteger(n) && Math.abs(n) <= 8192,
      ) ||
      key(w.a) === key(w.b) ||
      (!input.allowDiagonalVisuals && w.a[0] !== w.b[0] && w.a[1] !== w.b[1])
    )
      fail(
        w.key,
        "Unsupported treatment, orientation, height, binding or internal reservation",
      );
  for (const p of input.floorPolygons)
    if (
      p.length < (input.allowDiagonalVisuals ? 3 : 4) ||
      p.length > 256 ||
      p.some(
        (a, i) =>
          !a.every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 8192) ||
          (!input.allowDiagonalVisuals &&
            a[0] !== p[(i + 1) % p.length][0] &&
            a[1] !== p[(i + 1) % p.length][1]),
      )
    )
      fail("floor", "Only bounded orthogonal floor polygons supported");
  if (issues.length) return result();
  if (
    input.allowDiagonalVisuals &&
    (walls.some((w) => w.a[0] !== w.b[0] && w.a[1] !== w.b[1]) ||
      input.floorPolygons.some((p) =>
        p.some(
          (a, i) =>
            a[0] !== p[(i + 1) % p.length][0] &&
            a[1] !== p[(i + 1) % p.length][1],
        ),
      ))
  )
    return planDiagonalVisuals(input, walls);
  type Edge = {
    a: Point;
    b: Point;
    wall: LayoutWall;
    provenance: string[];
    cutA: number;
    cutB: number;
  };
  let edges: Edge[] = [];
  for (const w of walls) {
    const points = new Map<string, Point>([
      [key(w.a), w.a],
      [key(w.b), w.b],
    ]);
    for (const v of walls) {
      for (const p of [v.a, v.b]) if (on(p, w.a, w.b)) points.set(key(p), p);
      if ((w.a[0] === w.b[0]) !== (v.a[0] === v.b[0])) {
        const p: Point =
          w.a[0] === w.b[0] ? [w.a[0], v.a[1]] : [v.a[0], w.a[1]];
        if (on(p, w.a, w.b) && on(p, v.a, v.b)) points.set(key(p), p);
      }
    }
    const d = direction(w.a, w.b);
    const pts = [...points.values()].sort(
      (a, b) => (a[0] - b[0]) * d[0] + (a[1] - b[1]) * d[1],
    );
    for (let i = 1; i < pts.length; i++)
      edges.push({
        a: pts[i - 1],
        b: pts[i],
        wall: w,
        provenance: [JSON.stringify([w.key, w.treatment!.overrideId])],
        cutA: 0,
        cutB: 0,
      });
    if (edges.length > 8192) {
      fail("budget", "Edge work budget exceeded");
      return result();
    }
  }
  type Arm = { edge: Edge; start: boolean; ray: Point };
  const nodes = () => {
    const n = new Map<string, { p: Point; arms: Arm[] }>();
    for (const e of edges)
      for (const start of [true, false]) {
        const p = start ? e.a : e.b;
        const node = n.get(key(p)) ?? { p, arms: [] };
        node.arms.push({
          edge: e,
          start,
          ray: direction(p, start ? e.b : e.a),
        });
        n.set(key(p), node);
      }
    return n;
  };
  // Remove tile seams, retaining source walls through a compatibility requirement.
  let changed = true;
  while (changed) {
    changed = false;
    for (const { arms } of nodes().values())
      if (arms.length === 2) {
        const [a, b] = arms;
        const x = a.edge.wall,
          y = b.edge.wall;
        if (a.ray[0] !== -b.ray[0] || a.ray[1] !== -b.ray[1]) continue;
        if (
          x.source !== y.source ||
          x.treatment!.intent !== y.treatment!.intent ||
          x.treatment!.heightUnits !== y.treatment!.heightUnits
        )
          continue;
        if (x.source === "perimeter" && a.start === b.start) continue;
        const first = a.start ? b : a,
          second = a.start ? a : b;
        const provenance = [
          ...new Set([...a.edge.provenance, ...b.edge.provenance]),
        ].sort();
        const merged = {
          a: first.start ? first.edge.b : first.edge.a,
          b: second.start ? second.edge.b : second.edge.a,
          wall: { ...first.edge.wall, key: provenance.join("+") },
          provenance,
          cutA: 0,
          cutB: 0,
        };
        edges = edges.filter((e) => e !== a.edge && e !== b.edge);
        edges.push(merged);
        changed = true;
        break;
      }
  }
  const graph = nodes();
  if (graph.size > 4096) {
    fail("budget", "Node budget exceeded");
    return result();
  }
  const polygons: Point[][] = [];
  const nodePolygons = new Map<string, number>();
  const add = (s: Shape, p: Point, q: number, h: number, k: string) => {
    if (placements.length >= 8192) {
      fail("budget", "Placement budget exceeded");
      return;
    }
    placements.push({
      key: k,
      family: s.family,
      profileId: s.id,
      quarterHeight: (h / 24) as 1 | 2 | 3 | 4,
      originUnits: [...p, input.elevationUnits + 6],
      quarterTurns: q,
    });
    polygons.push(
      s.polygon.map((v) => {
        const r = rotate([v[0] * 32, v[1] * 32], q);
        return [p[0] + r[0], p[1] + r[1]];
      }),
    );
  };
  for (const [k, node] of graph) {
    const arms = node.arms;
    const h = arms[0].edge.wall.treatment!.heightUnits;
    const intents = new Set(arms.map((a) => a.edge.wall.treatment!.intent));
    if (
      new Set(arms.map((a) => a.edge.wall.treatment!.heightUnits)).size !== 1 ||
      intents.size !== 1 ||
      new Set(arms.map((a) => key(a.ray))).size !== arms.length
    ) {
      fail(k, "Mixed junction heights/intents or duplicate rays");
      continue;
    }
    const perimeter = arms.filter((a) => a.edge.wall.source === "perimeter"),
      partitions = arms.filter((a) => a.edge.wall.source === "partition");
    let s: Shape | undefined,
      q = 0;
    let cuts: number[] = [];
    if (perimeter.length === 0) {
      if (arms.length === 1) {
        s = shapes.find((s) => s.id === "internal-end");
        q = angle(arms[0].ray);
      } else if (
        arms.length === 2 &&
        arms[0].ray[0] === -arms[1].ray[0] &&
        arms[0].ray[1] === -arms[1].ray[1]
      ) {
        fail(k, "Incompatible collinear treatment seam");
        continue;
      } else if (arms.length >= 2 && arms.length <= 4)
        s = shapes.find((s) => s.id === "internal-core");
      cuts = arms.map(() => 4);
    } else if (perimeter.length === 2) {
      const incoming = perimeter.find((a) => !a.start),
        outgoing = perimeter.find((a) => a.start);
      if (!incoming || !outgoing) {
        fail(k, "Invalid directed perimeter incidence");
        continue;
      }
      const d = outgoing.ray;
      const inward: Point = [-d[1], d[0]];
      if (
        partitions.length === 1 &&
        incoming.ray[0] === -d[0] &&
        incoming.ray[1] === -d[1] &&
        key(partitions[0].ray) === key(inward)
      ) {
        s = shapes.find((s) => s.id === "exterior-t");
        q = angle(d);
        cuts = arms.map((a) => (a.edge.wall.source === "perimeter" ? 4 : 12));
      } else if (
        partitions.length === 0 &&
        incoming.ray[0] * d[0] + incoming.ray[1] * d[1] === 0
      ) {
        const previous: Point = [-incoming.ray[0], -incoming.ray[1]];
        const convex = previous[0] * d[1] - previous[1] * d[0] > 0;
        if (convex) {
          const profile = corner.profiles.find(
            (p) =>
              "rays" in p &&
              p.rays!.every((r, i) =>
                arms.some(
                  (a) =>
                    key(a.ray) === key(r as Point) &&
                    key(
                      (a.start
                        ? [-a.ray[1], a.ray[0]]
                        : [a.ray[1], -a.ray[0]]) as Point,
                    ) === key(p.inwardNormals![i] as Point),
                ),
              ),
          );
          s = profile ? shapes.find((s) => s.id === profile.id) : undefined;
          cuts = arms.map(() => 8);
        } else {
          for (let z = 0; z < 4; z++)
            if (
              arms.every((a) =>
                [rotate([1, 0], z), rotate([0, 1], z)].some(
                  (r) => key(r) === key(a.ray),
                ),
              )
            )
              q = z;
          s = shapes.find((s) => s.id === "concave-90");
          cuts = arms.map(() => 4);
        }
      }
    }
    if (!s) {
      fail(k, "Unsupported junction or opening endpoint");
      continue;
    }
    nodePolygons.set(k, polygons.length);
    add(s, node.p, q, h, "node:" + k);
    arms.forEach((a, i) => {
      if (a.start) a.edge.cutA = cuts[i];
      else a.edge.cutB = cuts[i];
    });
  }
  if (issues.length) return result();
  let residualWork = 0;
  for (const e of edges) {
    const d = direction(e.a, e.b),
      remaining =
        Math.abs(e.b[0] - e.a[0]) + Math.abs(e.b[1] - e.a[1]) - e.cutA - e.cutB;
    if (remaining < 0 || remaining > 32768) {
      fail(e.wall.key, "Negative residual or span budget exceeded");
      continue;
    }
    const candidates = shapes
      .filter(
        (s) =>
          s.length !== undefined &&
          Number.isSafeInteger(s.length * 32) &&
          (e.wall.source === "perimeter"
            ? s.family === "convex-r004"
            : s.family !== "convex-r004"),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    residualWork += remaining * candidates.length;
    if (residualWork > 4_000_000) {
      fail("budget", "Residual solver budget exceeded");
      return result();
    }
    const counts = Array<number>(remaining + 1).fill(Infinity);
    const chosen: (Shape | undefined)[] = Array(remaining + 1);
    counts[0] = 0;
    for (let i = 1; i <= remaining; i++)
      for (const s of candidates) {
        const n = s.length! * 32;
        if (n <= i && counts[i - n] + 1 < counts[i]) {
          counts[i] = counts[i - n] + 1;
          chosen[i] = s;
        }
      }
    if (!Number.isFinite(counts[remaining])) {
      fail(e.wall.key, "No exact native residual composition");
      continue;
    }
    if (placements.length + counts[remaining] > 8192) {
      fail("budget", "Placement budget exceeded");
      return result();
    }
    const composition: Shape[] = [];
    for (let i = remaining; i > 0;) {
      const s = chosen[i]!;
      composition.push(s);
      i -= s.length! * 32;
    }
    composition.reverse();
    let offset = e.cutA;
    let previous = nodePolygons.get(key(e.a))!;
    const contacts: { a: number; b: number; offset: number }[] = [];
    for (const s of composition) {
      const next = polygons.length;
      contacts.push({ a: previous, b: next, offset });
      previous = next;
      add(
        s,
        [e.a[0] + d[0] * offset, e.a[1] + d[1] * offset],
        angle(d),
        e.wall.treatment!.heightUnits,
        "span:" + e.wall.key + ":" + offset,
      );
      offset += s.length! * 32;
    }
    contacts.push({ a: previous, b: nodePolygons.get(key(e.b))!, offset });
    for (const contact of contacts) {
      const center: Point = [
        e.a[0] + d[0] * contact.offset,
        e.a[1] + d[1] * contact.offset,
      ];
      const normal: Point = [-d[1], d[0]];
      const low = e.wall.source === "perimeter" ? 0 : -4;
      const a: Point = [
        center[0] + normal[0] * low,
        center[1] + normal[1] * low,
      ];
      const b: Point = [a[0] + normal[0] * 8, a[1] + normal[1] * 8];
      for (const index of [contact.a, contact.b]) {
        const polygon = polygons[index];
        const axis = a[0] === b[0] ? 1 : 0,
          other = 1 - axis;
        const lo = Math.min(a[axis], b[axis]),
          hi = Math.max(a[axis], b[axis]);
        const intervals = polygon
          .flatMap((p, i) => {
            const q = polygon[(i + 1) % polygon.length];
            return p[other] === a[other] && q[other] === a[other]
              ? [
                  [
                    Math.max(lo, Math.min(p[axis], q[axis])),
                    Math.min(hi, Math.max(p[axis], q[axis])),
                  ],
                ]
              : [];
          })
          .filter(([x, y]) => y > x)
          .sort((x, y) => x[0] - y[0]);
        let cursor = lo;
        for (const [x, y] of intervals) {
          if (x > cursor) break;
          cursor = Math.max(cursor, y);
        }
        if (cursor !== hi)
          fail(e.wall.key, "Full nominal native mating contact absent");
      }
    }
  }
  // Exact orthogonal arrangement: every open cell has at most one wall owner,
  // and every occupied wall cell is within floor union. Bound before O(cells*polygons).
  const all = [...polygons, ...input.floorPolygons],
    xs = [...new Set(all.flatMap((p) => p.map((v) => v[0])))].sort(
      (a, b) => a - b,
    ),
    ys = [...new Set(all.flatMap((p) => p.map((v) => v[1])))].sort(
      (a, b) => a - b,
    );
  if (xs.length * ys.length * all.length > 8_000_000) {
    fail("budget", "Nominal arrangement budget exceeded");
    return result();
  }
  for (let x = 1; x < xs.length; x++)
    for (let y = 1; y < ys.length; y++) {
      const p: Point = [(xs[x - 1] + xs[x]) / 2, (ys[y - 1] + ys[y]) / 2];
      const count = polygons.filter((poly) => inside(p, poly)).length;
      if (count > 1) {
        fail("overlap", "Native reservation polygons overlap");
        return result();
      }
      if (count && !input.floorPolygons.some((poly) => inside(p, poly))) {
        fail("support", "Native reservation leaves structural floor union");
        return result();
      }
    }
  placements.sort((a, b) => a.key.localeCompare(b.key));
  return result();
}

/** Visual-only composition of delivered native profiles; no inferred new mesh. */
function planDiagonalVisuals(
  input: {
    elevationUnits: number;
    floorPolygons: readonly Point[][];
  },
  walls: readonly LayoutWall[],
) {
  // Arithmetic guard in lattice units (~0.3 nm), much smaller than the native
  // 1 um export allowance. It does not admit a different authored span length.
  const epsilon = 1e-8;
  const issues: { key: string; message: string }[] = [];
  const placements: Placement[] = [];
  const polygons: Point[][] = [];
  const fail = (key: string, message: string) => {
    if (issues.length < 128) issues.push({ key, message });
  };
  const result = () => ({
    placements: issues.length ? [] : placements,
    issues,
    physicalQualification: "unqualified" as const,
  });
  if (walls.length > 128 || input.floorPolygons.length > 128) {
    fail("budget", "Diagonal visual arrangement budget exceeded");
    return result();
  }
  if (walls.some((w) => w.source !== "perimeter")) {
    fail(
      "diagonal",
      "Diagonal visual perimeter with internal junctions is not qualified",
    );
    return result();
  }
  const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
  const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
  const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
  const unit = (a: Point): Point => {
    const n = Math.hypot(...a);
    return [a[0] / n, a[1] / n];
  };
  const same = (a: Point, b: Point) => Math.hypot(...sub(a, b)) <= epsilon;
  type Edge = {
    a: Point;
    b: Point;
    wall: LayoutWall;
    provenance: string[];
    cutA: number;
    cutB: number;
    nodeA?: number;
    nodeB?: number;
  };
  let edges: Edge[] = walls.map((w) => ({
    a: w.a,
    b: w.b,
    wall: w,
    provenance: [JSON.stringify([w.key, w.treatment!.overrideId])],
    cutA: 0,
    cutB: 0,
  }));
  // Compiler perimeter edges already exclude shared floor seams. Merge only
  // directed, compatible collinear intervals; never bridge a missing edge.
  for (;;) {
    let merged = false;
    for (const a of edges) {
      const outgoing = edges.filter((b) => key(a.b) === key(b.a));
      const incoming = edges.filter((b) => key(a.b) === key(b.b));
      if (outgoing.length !== 1 || incoming.length !== 1) continue;
      const b = outgoing[0];
      if (a === b || !same(unit(sub(a.b, a.a)), unit(sub(b.b, b.a)))) continue;
      if (
        a.wall.treatment!.heightUnits !== b.wall.treatment!.heightUnits ||
        a.wall.treatment!.intent !== b.wall.treatment!.intent
      )
        continue;
      edges = edges.filter((e) => e !== a && e !== b);
      edges.push({
        ...a,
        b: b.b,
        provenance: [...new Set([...a.provenance, ...b.provenance])].sort(),
      });
      merged = true;
      break;
    }
    if (!merged) break;
  }
  const add = (s: Shape, p: Point, yaw: number, h: number, k: string) => {
    if (placements.length >= 2048) {
      fail("budget", "Diagonal visual placement budget exceeded");
      return polygons.length;
    }
    const nearest = Math.round(yaw / (Math.PI / 2));
    const q = ((nearest % 4) + 4) % 4;
    const cardinal = Math.abs(yaw - (nearest * Math.PI) / 2) <= epsilon;
    const c = Math.cos(yaw),
      sn = Math.sin(yaw);
    const index = polygons.length;
    placements.push({
      key: k,
      family: s.family,
      profileId: s.id,
      quarterHeight: (h / 24) as 1 | 2 | 3 | 4,
      originUnits: [...p, input.elevationUnits + 6],
      quarterTurns: cardinal ? q : 0,
      yawRadians: cardinal ? (q * Math.PI) / 2 : yaw,
    });
    polygons.push(
      s.polygon.map((v) => {
        const r = cardinal
          ? rotate([v[0] * 32, v[1] * 32], q)
          : [(v[0] * c - v[1] * sn) * 32, (v[0] * sn + v[1] * c) * 32];
        return [p[0] + r[0], p[1] + r[1]];
      }),
    );
    return index;
  };
  for (const outgoing of edges) {
    const p = outgoing.a;
    const before = edges.filter((e) => key(e.b) === key(p));
    const after = edges.filter((e) => key(e.a) === key(p));
    if (before.length !== 1 || after.length !== 1) {
      fail(key(p), "Unsupported branching or open diagonal perimeter");
      continue;
    }
    const incoming = before[0];
    if (
      incoming.wall.treatment!.heightUnits !==
        outgoing.wall.treatment!.heightUnits ||
      incoming.wall.treatment!.intent !== outgoing.wall.treatment!.intent
    ) {
      fail(key(p), "Mixed diagonal junction heights or intents");
      continue;
    }
    const previous = unit(sub(incoming.b, incoming.a));
    const next = unit(sub(outgoing.b, outgoing.a));
    const rays: Point[] = [[-previous[0], -previous[1]], next];
    const normals: Point[] = [
      [-previous[1], previous[0]],
      [-next[1], next[0]],
    ];
    let selected: Shape | undefined,
      rotation = 0,
      cuts: number[] = [];
    if (cross(previous, next) > epsilon) {
      for (const profile of corner.profiles) {
        if (!("rays" in profile)) continue;
        for (let q = 0; q < 4; q++) {
          const indices = rays.map((ray, i) =>
            profile.rays!.findIndex(
              (r, j) =>
                same(rotate(r as Point, q), ray) &&
                same(rotate(profile.inwardNormals![j] as Point, q), normals[i]),
            ),
          );
          if (indices.some((i) => i < 0)) continue;
          selected = baseShapes.find((s) => s.id === profile.id);
          rotation = q;
          cuts = indices.map((i) => profile.cutbacksM![i] * 32);
          break;
        }
        if (selected) break;
      }
    } else if (Math.abs(dot(previous, next)) <= epsilon) {
      // Existing concave-90 native part covers cardinal concave joins only.
      for (let q = 0; q < 4; q++)
        if (
          rays.every((ray) =>
            [rotate([1, 0], q), rotate([0, 1], q)].some((r) => same(r, ray)),
          )
        ) {
          selected = baseShapes.find((s) => s.id === "concave-90");
          rotation = q;
          cuts = [4, 4];
        }
    }
    if (!selected) {
      fail(
        key(p),
        "No exact native diagonal corner or concave junction profile",
      );
      continue;
    }
    const index = add(
      selected,
      p,
      (rotation * Math.PI) / 2,
      outgoing.wall.treatment!.heightUnits,
      "node:" + key(p),
    );
    incoming.nodeB = index;
    outgoing.nodeA = index;
    incoming.cutB = cuts[0];
    outgoing.cutA = cuts[1];
  }
  if (issues.length) return result();
  const candidates = baseShapes
    .filter((s) => s.family === "convex-r004" && s.length !== undefined)
    .sort((a, b) => b.length! - a.length! || a.id.localeCompare(b.id));
  let work = 0;
  const compose = (remaining: number): Shape[] | undefined => {
    const memo = new Set<string>();
    const visit = (
      r: number,
      minimum: number,
      depth: number,
    ): Shape[] | undefined => {
      if (Math.abs(r) <= epsilon) return [];
      if (++work > 50_000 || depth >= 64) return undefined;
      const state = minimum + ":" + r;
      if (memo.has(state)) return undefined;
      memo.add(state);
      // Prefer a single exactly matching authored residual over decomposition.
      const exact = candidates.find(
        (s) => Math.abs(s.length! * 32 - r) <= epsilon,
      );
      if (exact) return [exact];
      for (let i = minimum; i < candidates.length; i++) {
        const n = candidates[i].length! * 32;
        if (n > r + epsilon) continue;
        const tail = visit(r - n, i, depth + 1);
        if (tail) return [candidates[i], ...tail];
      }
      return undefined;
    };
    return visit(remaining, 0, 0);
  };
  const coversContact = (polygon: Point[], start: Point, normal: Point) => {
    const intervals: number[][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = sub(polygon[i], start),
        b = sub(polygon[(i + 1) % polygon.length], start);
      if (
        Math.abs(cross(normal, a)) <= epsilon &&
        Math.abs(cross(normal, b)) <= epsilon
      )
        intervals.push([
          Math.min(dot(a, normal), dot(b, normal)),
          Math.max(dot(a, normal), dot(b, normal)),
        ]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [a, b] of intervals) {
      if (a > cursor + epsilon) break;
      cursor = Math.max(cursor, b);
    }
    return cursor >= 8 - epsilon;
  };
  for (const e of edges) {
    const d = unit(sub(e.b, e.a));
    const length = Math.hypot(...sub(e.b, e.a));
    const remaining = length - e.cutA - e.cutB;
    if (remaining < -epsilon || remaining > 32768) {
      fail(e.wall.key, "Negative diagonal residual or span budget exceeded");
      continue;
    }
    const composition = compose(remaining);
    if (!composition) {
      fail(
        e.wall.key,
        work > 50_000
          ? "Diagonal residual solver budget exceeded"
          : "No exact native diagonal residual composition",
      );
      continue;
    }
    let previous = e.nodeA!,
      offset = e.cutA;
    const normal: Point = [-d[1], d[0]];
    const contact = (a: number, b: number, at: number) => {
      const start: Point = [e.a[0] + d[0] * at, e.a[1] + d[1] * at];
      if (![a, b].every((i) => coversContact(polygons[i], start, normal)))
        fail(e.wall.key, "Full nominal diagonal mating contact absent");
    };
    for (const shape of composition) {
      const index = add(
        shape,
        [e.a[0] + d[0] * offset, e.a[1] + d[1] * offset],
        Math.atan2(d[1], d[0]),
        e.wall.treatment!.heightUnits,
        "span:" + e.provenance.join("+") + ":" + offset,
      );
      if (issues.length) return result();
      contact(previous, index, offset);
      previous = index;
      offset += shape.length! * 32;
    }
    contact(previous, e.nodeB!, offset);
  }
  if (issues.length) return result();
  // Sweep every planar arrangement cell, not a raster or vertex-only check.
  // Edge intersections split X slabs; within a slab all boundary ordering is
  // constant. Consecutive Y crossings therefore describe every open cell.
  const all = [...polygons, ...input.floorPolygons];
  const segments = all.flatMap((poly) =>
    poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length] })),
  );
  if (segments.length > 1024) {
    fail("budget", "Diagonal arrangement segment budget exceeded");
    return result();
  }
  const cuts = segments.flatMap((s) => [s.a[0], s.b[0]]);
  for (let i = 0; i < segments.length; i++)
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i],
        b = segments[j],
        u = sub(a.b, a.a),
        v = sub(b.b, b.a);
      const denominator = cross(u, v);
      if (Math.abs(denominator) <= epsilon) continue;
      const delta = sub(b.a, a.a),
        t = cross(delta, v) / denominator,
        s = cross(delta, u) / denominator;
      if (t > 0 && t < 1 && s > 0 && s < 1) cuts.push(a.a[0] + t * u[0]);
    }
  const sorted = (values: number[]) =>
    values
      .sort((a, b) => a - b)
      .filter((v, i, a) => i === 0 || v - a[i - 1] > epsilon);
  const xs = sorted(cuts);
  let arrangementWork = 0;
  for (let i = 1; i < xs.length; i++) {
    const x = (xs[i - 1] + xs[i]) / 2;
    const ys = sorted(
      segments.flatMap(({ a, b }) =>
        x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0])
          ? [a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]
          : [],
      ),
    );
    arrangementWork += ys.length * all.length;
    if (arrangementWork > 8_000_000) {
      fail("budget", "Diagonal arrangement work budget exceeded");
      return result();
    }
    for (let j = 1; j < ys.length; j++) {
      const p: Point = [x, (ys[j - 1] + ys[j]) / 2];
      const count = polygons.filter((poly) => inside(p, poly)).length;
      if (count > 1) {
        fail("overlap", "Native diagonal reservations overlap");
        return result();
      }
      if (count && !input.floorPolygons.some((poly) => inside(p, poly))) {
        fail(
          "support",
          "Native diagonal reservation leaves structural floor union",
        );
        return result();
      }
    }
  }
  placements.sort((a, b) => a.key.localeCompare(b.key));
  return result();
}
