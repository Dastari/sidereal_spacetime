import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import { transformPoint } from "@sidereal/content/ship-layout";
import interfaces from "@sidereal/content/construction-boundary-interfaces.json";
import { compileLayout } from "./layout-compiler";
import { readLayout } from "./layout-validation";
import {
  area2,
  canonicalPolygon,
  comparePoint,
  compareText,
  cross,
  onSegment,
  positiveOverlap,
  properCross,
} from "./layout-geometry";

export const NATIVE_BOUNDARY_LIMITS = Object.freeze({
  tiles: 512,
  sourceSegments: 2048,
  intersections: 1_000_000,
  placements: 4096,
  openings: 128,
  obstacles: 512,
  obstacleVertices: 16,
  coordinateUnits: 8192,
});
export const NATIVE_BOUNDARY_KIT = Object.freeze({
  revision: "r001",
  sha256: "4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426",
  interfaceSha256:
    "33347b32b1675fee00d36046a05de37013fa32eca6e2a4d671464da3499972d9",
  floorTopUnits: 6,
  ceilingUnits: 96,
  nodeHalfWidthUnits: 2,
  swingRadiusM: 1.3119895197752154,
});
export type NativeBoundaryPart =
  | "wall-2m"
  | "wall-1m"
  | "join-straight"
  | "closure-end"
  | "closure-corner"
  | "closure-t"
  | "door-frame-2m"
  | "door-leaf";
export interface NativeBoundaryPlacement {
  /** Semantic allocation key, not an installed UUID or blueprint placement ID. */
  key: string;
  partId: NativeBoundaryPart;
  assetId: string;
  nodePrefix: string;
  originUnits: [number, number, number];
  quarterTurns: number;
  openingId?: string;
}
export interface NativeBoundaryObstacle {
  id: string;
  deckId: string;
  definitionId: string;
  /** Explicit adapter geometry, never guessed from an art AABB. Heights relative to deck origin. */
  polygonUnits: Point[];
  bottomUnits: number;
  topUnits: number;
}
export interface NativeBoundaryOptions {
  floorTopUnits: number;
  obstacles?: readonly NativeBoundaryObstacle[];
}
export interface NativeDoorReservation {
  openingId: string;
  frameStartUnits: Point;
  frameEndUnits: Point;
  quarterTurns: number;
  swingPolygonUnits: Point[];
  sweepBottomUnits: number;
  sweepTopUnits: number;
}
export interface NativeBoundaryPlan {
  deckId: string;
  layoutFingerprint: string;
  kit: typeof NATIVE_BOUNDARY_KIT;
  placements: NativeBoundaryPlacement[];
  doors: NativeDoorReservation[];
  acceptance: {
    geometryFit: true;
    pressureApproved: false;
    damageApproved: false;
    ownerArtApproved: false;
  };
}
export class NativeBoundaryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly ids: readonly string[] = [],
  ) {
    super(`Native boundaries [${code}]: ${message}`);
    this.name = "NativeBoundaryError";
  }
}
function requireFit(
  ok: unknown,
  code: string,
  message: string,
  ids: string[] = [],
): asserts ok {
  if (!ok) throw new NativeBoundaryError(code, message, ids);
}
interface Run {
  a: Point;
  b: Point;
  axis: 0 | 1;
}
interface Span extends Run {
  openingId?: string;
}
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const keyPoint = (p: Point) => JSON.stringify(p);
const plus = (a: Point, b: Point, k = 1): Point => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
];
const keySegment = (a: Point, b: Point) =>
  JSON.stringify(comparePoint(a, b) < 0 ? [a, b] : [b, a]);
const rect = (a: Point, b: Point): Point[] => [
  [a[0], a[1]],
  [b[0], a[1]],
  [b[0], b[1]],
  [a[0], b[1]],
];
function run(a: Point, b: Point): Run {
  requireFit(
    a[0] === b[0] || a[1] === b[1],
    "DIAGONAL",
    "Only orthogonal native wall runs are supported",
  );
  requireFit(!same(a, b), "ZERO_SPAN", "A wall run needs length");
  return comparePoint(a, b) < 0
    ? { a, b, axis: a[0] === b[0] ? 1 : 0 }
    : { a: b, b: a, axis: a[0] === b[0] ? 1 : 0 };
}
function turns(a: Point, b: Point): number {
  return b[0] > a[0] ? 0 : b[1] > a[1] ? 1 : b[0] < a[0] ? 2 : 3;
}
function coalesce(raw: Run[]): Run[] {
  const groups = new Map<string, Run[]>();
  for (const r of raw) {
    const k = JSON.stringify([r.axis, r.a[1 - r.axis]]),
      list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const merged: Run[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => comparePoint(a.a, b.a) || comparePoint(a.b, b.b));
    let active: Run | undefined;
    for (const r of group) {
      if (active && r.a[r.axis] <= active.b[r.axis]) {
        if (r.b[r.axis] > active.b[r.axis]) active.b = [...r.b];
      } else {
        active = { ...r, a: [...r.a], b: [...r.b] };
        merged.push(active);
      }
    }
  }
  return merged.sort(
    (a, b) => comparePoint(a.a, b.a) || comparePoint(a.b, b.b),
  );
}
/** Convex floor clipping against an axis-aligned box. Validated floor interiors do
 * not overlap, so their intersection areas can be summed to prove union coverage. */
function coveredArea(poly: Point[], min: Point, max: Point): number {
  let points = poly;
  for (const axis of [0, 1] as const)
    for (const lower of [true, false]) {
      const limit = lower ? min[axis] : max[axis],
        next: Point[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        const ina = lower ? a[axis] >= limit : a[axis] <= limit,
          inb = lower ? b[axis] >= limit : b[axis] <= limit;
        if (ina) next.push(a);
        if (ina !== inb) {
          const t = (limit - a[axis]) / (b[axis] - a[axis]);
          next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      points = next;
    }
  return Math.abs(area2(points)) / 2;
}
function bounds(poly: Point[]): { min: Point; max: Point } {
  return {
    min: [
      Math.min(...poly.map((p) => p[0])),
      Math.min(...poly.map((p) => p[1])),
    ],
    max: [
      Math.max(...poly.map((p) => p[0])),
      Math.max(...poly.map((p) => p[1])),
    ],
  };
}
function wallPolygon(r: Run): Point[] {
  return r.axis === 0
    ? rect([r.a[0], r.a[1] - 2], [r.b[0], r.b[1] + 2])
    : rect([r.a[0] - 2, r.a[1]], [r.b[0] + 2, r.b[1]]);
}

/** Pure native placement proposal. No world IDs, collision authority, pressure seals,
 * damage approval or runtime mutation. Unsupported inputs throw explicit codes. */
export function planNativeBoundaries(
  input: LayoutDocument,
  deckId: string,
  options: NativeBoundaryOptions,
): NativeBoundaryPlan {
  let document: LayoutDocument;
  try {
    document = readLayout(input);
  } catch (e) {
    throw new NativeBoundaryError("LAYOUT", String(e));
  }
  requireFit(
    document.tiles.length <= NATIVE_BOUNDARY_LIMITS.tiles,
    "BUDGET",
    "Too many source tiles for bounded native planning",
  );
  requireFit(
    document.partitions.length <= NATIVE_BOUNDARY_LIMITS.sourceSegments,
    "BUDGET",
    "Too many source partitions",
  );
  requireFit(
    options?.floorTopUnits === 6,
    "FLOOR_DATUM",
    "Native r001 requires an explicit floor-top datum of 6 units",
  );
  const deck = document.decks.find((d) => d.id === deckId);
  requireFit(deck, "DECK", "Selected deck is unknown");
  requireFit(
    deck.ceiling === 96,
    "CEILING_DATUM",
    "Native r001 requires ceiling plane96, giving2.8125m standing clearance",
  );
  const compiled = compileLayout(document);
  requireFit(
    compiled.valid,
    "LAYOUT",
    compiled.diagnostics
      .filter((d) => d.severity === "error")
      .map((d) => `${d.code}: ${d.message}`)
      .join("; "),
  );
  const floors = compiled.tiles
    .filter((t) => t.deckId === deckId)
    .map((t) => t.vertices);
  requireFit(floors.length, "FLOOR", "Selected deck has no floor support");
  const partitions = document.partitions.filter((p) => p.deckId === deckId);
  requireFit(
    partitions.every((p) => p.seal === "design-sealed"),
    "DIVIDER",
    "Open dividers have no matching full-height structural kit adapter",
  );
  const raw = [
    ...compiled.walls.filter(
      (w) => w.deckId === deckId && w.source === "perimeter",
    ),
    ...partitions,
  ].map((w) => run(w.a, w.b));
  requireFit(
    raw.length <= NATIVE_BOUNDARY_LIMITS.sourceSegments,
    "BUDGET",
    "Too many source boundary segments",
  );
  const runs = coalesce(raw),
    cuts = runs.map(
      (r) =>
        new Map([
          [keyPoint(r.a), r.a],
          [keyPoint(r.b), r.b],
        ]),
    );
  let checks = 0;
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) {
      requireFit(
        ++checks <= NATIVE_BOUNDARY_LIMITS.intersections,
        "BUDGET",
        "Boundary intersection work limit exceeded",
      );
      if (runs[i].axis === runs[j].axis) continue;
      const h = runs[i].axis === 0 ? runs[i] : runs[j],
        v = runs[i].axis === 1 ? runs[i] : runs[j],
        p: Point = [v.a[0], h.a[1]];
      if (onSegment(p, h.a, h.b) && onSegment(p, v.a, v.b)) {
        cuts[i].set(keyPoint(p), p);
        cuts[j].set(keyPoint(p), p);
      }
    }
  const structuralCuts = cuts.map((c) => [...c.values()]);
  const doors: NativeDoorReservation[] = [],
    openings = document.openings
      .filter((o) => o.deckId === deckId)
      .sort((a, b) => compareText(a.id, b.id));
  requireFit(
    openings.length <= NATIVE_BOUNDARY_LIMITS.openings,
    "BUDGET",
    "Too many door openings",
  );
  for (const o of openings) {
    requireFit(
      o.kind === "door" && o.sill === 0,
      "OPENING_KIND",
      "Only interior doors with zero sill have a native adapter",
      [o.id],
    );
    const direction: Point = [
      Math.sign(o.b[0] - o.a[0]),
      Math.sign(o.b[1] - o.a[1]),
    ];
    requireFit(
      Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) === 40,
      "OPENING_WIDTH",
      "Native doorway aperture is exactly40 lattice units",
      [o.id],
    );
    const a = plus(o.a, direction, -12),
      b = plus(o.b, direction, 12),
      partition = partitions.find((p) => p.id === o.partitionId)!;
    requireFit(
      onSegment(a, partition.a, partition.b) &&
        onSegment(b, partition.a, partition.b),
      "FRAME_ANCHOR",
      "Centered2m frame requires12 units of jamb reservation beyond each opening endpoint",
      [o.id],
    );
    const r = run(a, b),
      index = runs.findIndex(
        (s) => onSegment(a, s.a, s.b) && onSegment(b, s.a, s.b),
      );
    requireFit(
      index >= 0,
      "FRAME_ANCHOR",
      "Frame is not contained in a structural run",
      [o.id],
    );
    requireFit(
      !structuralCuts[index].some(
        (p) => onSegment(p, a, b) && !same(p, a) && !same(p, b),
      ),
      "FRAME_JUNCTION",
      "Frame overlaps an existing junction",
      [o.id],
    );
    for (const prior of doors) {
      const q = run(prior.frameStartUnits, prior.frameEndUnits);
      requireFit(
        r.axis !== q.axis ||
          r.a[1 - r.axis] !== q.a[1 - q.axis] ||
          Math.min(r.b[r.axis], q.b[q.axis]) <=
            Math.max(r.a[r.axis], q.a[q.axis]),
        "FRAME_OVERLAP",
        "Multiple door frames reserve overlapping structural spans",
        [o.id, prior.openingId],
      );
    }
    cuts[index].set(keyPoint(a), a);
    cuts[index].set(keyPoint(b), b);
    const q = turns(a, b),
      source = interfaces.door.conservativeSweepAabbBlenderM;
    const polygon = rect(
      [source.min[0] * 32, source.min[1] * 32],
      [source.max[0] * 32, source.max[1] * 32],
    ).map((p) => plus(a, transformPoint(p, q)));
    doors.push({
      openingId: o.id,
      frameStartUnits: a,
      frameEndUnits: b,
      quarterTurns: q,
      swingPolygonUnits: polygon,
      sweepBottomUnits: source.min[2] * 32,
      sweepTopUnits: source.max[2] * 32,
    });
  }
  requireFit(
    interfaces.revision === "r001" &&
      interfaces.parts.every(
        (p) => p.native.sha256 === NATIVE_BOUNDARY_KIT.sha256,
      ) &&
      interfaces.datumsUnits.floorTop === 6 &&
      interfaces.datumsUnits.ceilingPlane === 96 &&
      interfaces.door.conservativeSwingRadiusM ===
        NATIVE_BOUNDARY_KIT.swingRadiusM,
    "KIT_PIN",
    "Native interface constants do not match the selected exact revision",
  );
  const placements: NativeBoundaryPlacement[] = [],
    spans: Span[] = [],
    nodes = new Map<string, { p: Point; directions: Set<number> }>();
  const place = (
    partId: NativeBoundaryPart,
    key: string,
    p: Point,
    quarterTurns: number,
    openingId?: string,
  ) => {
    requireFit(
      placements.length < NATIVE_BOUNDARY_LIMITS.placements,
      "BUDGET",
      "Native placement budget exceeded",
    );
    const part = interfaces.parts.find((p) => p.id === partId)!;
    placements.push({
      key,
      partId,
      assetId: part.assetUuid,
      nodePrefix: part.native.nodePrefix,
      originUnits: [p[0], p[1], deck.elevation],
      quarterTurns,
      ...(openingId ? { openingId } : {}),
    });
  };
  const addSpan = (a: Point, b: Point, openingId?: string) => {
    spans.push({ ...run(a, b), ...(openingId ? { openingId } : {}) });
    for (const [p, other] of [
      [a, b],
      [b, a],
    ]) {
      const k = keyPoint(p),
        n = nodes.get(k) ?? { p, directions: new Set<number>() };
      n.directions.add(turns(p, other));
      nodes.set(k, n);
    }
  };
  for (let i = 0; i < runs.length; i++) {
    const points = [...cuts[i].values()].sort(comparePoint),
      axis = runs[i].axis;
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1],
        b = points[j],
        matching = doors.filter(
          (d) =>
            onSegment(a, d.frameStartUnits, d.frameEndUnits) &&
            onSegment(b, d.frameStartUnits, d.frameEndUnits),
        );
      if (matching.length) {
        const d = matching[0];
        requireFit(
          matching.length === 1 && b[axis] - a[axis] === 64,
          "FRAME_SPLIT",
          "Frame cannot be split or owned by multiple doors",
        );
        for (const part of ["door-frame-2m", "door-leaf"] as const)
          place(
            part,
            JSON.stringify([deckId, part, d.openingId]),
            d.frameStartUnits,
            d.quarterTurns,
            d.openingId,
          );
        addSpan(a, b, d.openingId);
        continue;
      }
      requireFit(
        (b[axis] - a[axis]) % 32 === 0,
        "PARTIAL_SPAN",
        "Native runs require complete1m/2m modules; no stretching",
        [keySegment(a, b)],
      );
      let start = a;
      while (!same(start, b)) {
        const width = b[axis] - start[axis] >= 64 ? 64 : 32,
          end: Point = [...start];
        end[axis] += width;
        place(
          width === 64 ? "wall-2m" : "wall-1m",
          JSON.stringify([deckId, "wall", start, end]),
          start,
          axis,
        );
        addSpan(start, end);
        start = end;
      }
    }
  }
  for (const node of [...nodes.values()].sort((a, b) =>
    comparePoint(a.p, b.p),
  )) {
    const dirs = [...node.directions].sort(),
      count = dirs.length;
    requireFit(
      count >= 1 && count <= 3,
      "X_JUNCTION",
      "No native four-way/X junction adapter is supplied",
      [keyPoint(node.p)],
    );
    const patterns: [NativeBoundaryPart, number[]][] = [
      ["closure-end", [0]],
      ["join-straight", [0, 2]],
      ["closure-corner", [0, 1]],
      ["closure-t", [0, 1, 2]],
    ];
    let selected: { part: NativeBoundaryPart; q: number } | undefined;
    for (const [part, pattern] of patterns)
      for (let q = 0; q < 4; q++)
        if (
          pattern.length === count &&
          pattern.every((d) => node.directions.has((d + q) % 4))
        )
          selected ??= { part, q };
    requireFit(selected, "NODE", "Node directions have no native closure");
    place(
      selected.part,
      JSON.stringify([deckId, "node", node.p]),
      node.p,
      selected.q,
    );
  }
  const obstacles = options.obstacles ?? [];
  requireFit(
    obstacles.length <= NATIVE_BOUNDARY_LIMITS.obstacles,
    "BUDGET",
    "Too many explicit obstacles",
  );
  const ids = new Set<string>();
  for (const obstacle of obstacles) {
    requireFit(
      typeof obstacle.id === "string" &&
        obstacle.id.length > 0 &&
        obstacle.id.length <= 160 &&
        !ids.has(obstacle.id) &&
        typeof obstacle.definitionId === "string" &&
        obstacle.definitionId.length > 0 &&
        obstacle.definitionId.length <= 160 &&
        document.decks.some((d) => d.id === obstacle.deckId),
      "OBSTACLE",
      "Obstacle needs unique identity, explicit definition and known deck",
    );
    ids.add(obstacle.id);
    requireFit(
      obstacle.polygonUnits.length >= 3 &&
        obstacle.polygonUnits.length <=
          NATIVE_BOUNDARY_LIMITS.obstacleVertices &&
        obstacle.polygonUnits.every(
          (p) =>
            p.length === 2 &&
            p.every(
              (n) =>
                Number.isFinite(n) &&
                Math.abs(n) <= NATIVE_BOUNDARY_LIMITS.coordinateUnits,
            ),
        ) &&
        Number.isFinite(obstacle.bottomUnits) &&
        Number.isFinite(obstacle.topUnits) &&
        obstacle.topUnits > obstacle.bottomUnits &&
        Math.max(Math.abs(obstacle.topUnits), Math.abs(obstacle.bottomUnits)) <=
          NATIVE_BOUNDARY_LIMITS.coordinateUnits,
      "OBSTACLE",
      "Invalid obstacle footprint or height",
    );
    const polygon = canonicalPolygon(obstacle.polygonUnits);
    requireFit(
      polygon.every(
        (p, i) =>
          cross(
            p,
            polygon[(i + 1) % polygon.length],
            polygon[(i + 2) % polygon.length],
          ) > 0,
      ) && new Set(polygon.map(keyPoint)).size === polygon.length,
      "OBSTACLE",
      "Explicit obstacle must be strictly convex",
    );
    for (let i = 0; i < polygon.length; i++)
      for (let j = i + 1; j < polygon.length; j++)
        requireFit(
          !properCross(
            polygon[i],
            polygon[(i + 1) % polygon.length],
            polygon[j],
            polygon[(j + 1) % polygon.length],
          ),
          "OBSTACLE",
          "Explicit obstacle may not self-intersect",
        );
  }
  for (const fitting of document.fittings.filter((f) => f.deckId === deckId))
    requireFit(
      obstacles.some((o) => o.id === fitting.id && o.deckId === deckId),
      "UNBOUND_OBJECT",
      "Fitting requires explicit obstruction geometry",
      [fitting.id],
    );
  for (const part of document.assembly?.parts ?? [])
    requireFit(
      ids.has(part.id),
      "UNBOUND_OBJECT",
      "Visual assembly object requires explicit deck/obstruction adapter",
      [part.id],
    );
  for (const door of doors) {
    const { min, max } = bounds(door.swingPolygonUnits),
      targetArea = (max[0] - min[0]) * (max[1] - min[1]);
    const covered = floors.reduce(
      (total, p) => total + coveredArea(p, min, max),
      0,
    );
    requireFit(
      Math.abs(covered - targetArea) <= targetArea * 1e-9,
      "SWING_SUPPORT",
      "The full conservative door swing must have floor support",
      [door.openingId],
    );
    for (const span of spans)
      if (span.openingId !== door.openingId)
        requireFit(
          !positiveOverlap(door.swingPolygonUnits, wallPolygon(span)),
          "SWING_WALL",
          "Door swing intersects another structural span",
          [door.openingId, keySegment(span.a, span.b)],
        );
    for (const node of nodes.values())
      requireFit(
        !positiveOverlap(
          door.swingPolygonUnits,
          rect(plus(node.p, [-2, -2]), plus(node.p, [2, 2])),
        ),
        "SWING_NODE",
        "Door swing intersects a junction closure",
        [door.openingId, keyPoint(node.p)],
      );
    for (const obstacle of obstacles)
      if (
        obstacle.deckId === deckId &&
        obstacle.bottomUnits < door.sweepTopUnits &&
        obstacle.topUnits > door.sweepBottomUnits
      )
        requireFit(
          !positiveOverlap(door.swingPolygonUnits, obstacle.polygonUnits),
          "SWING_OBJECT",
          "Door swing intersects an explicit object clearance",
          [door.openingId, obstacle.id],
        );
    for (const prior of doors)
      if (compareText(prior.openingId, door.openingId) < 0)
        requireFit(
          !positiveOverlap(door.swingPolygonUnits, prior.swingPolygonUnits),
          "SWING_DOOR",
          "Conservative door swing reservations overlap",
          [door.openingId, prior.openingId],
        );
  }
  for (const obstacle of obstacles)
    if (
      obstacle.deckId === deckId &&
      obstacle.bottomUnits < 96 &&
      obstacle.topUnits > 6
    ) {
      for (const span of spans)
        requireFit(
          !positiveOverlap(obstacle.polygonUnits, wallPolygon(span)),
          "OBSTACLE_WALL",
          "Explicit object intersects nominal structural span or closed door",
          [obstacle.id, keySegment(span.a, span.b)],
        );
      for (const node of nodes.values())
        requireFit(
          !positiveOverlap(
            obstacle.polygonUnits,
            rect(plus(node.p, [-2, -2]), plus(node.p, [2, 2])),
          ),
          "OBSTACLE_NODE",
          "Explicit object intersects a native junction",
          [obstacle.id, keyPoint(node.p)],
        );
    }
  return {
    deckId,
    layoutFingerprint: compiled.fingerprint,
    kit: NATIVE_BOUNDARY_KIT,
    placements: placements.sort((a, b) => compareText(a.key, b.key)),
    doors,
    acceptance: {
      geometryFit: true,
      pressureApproved: false,
      damageApproved: false,
      ownerArtApproved: false,
    },
  };
}
