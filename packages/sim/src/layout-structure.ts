import { matchNativeFloorTile } from "./layout-native-floor";
import type {
  HullEnvelope,
  FloorStyle,
} from "@sidereal/content/layout-structure";
import type {
  LayoutDocument,
  Opening,
  Point,
} from "@sidereal/content/ship-layout";
import {
  compileLayout,
  segmentSupported,
  fittingPolygon,
  type CompiledLayout,
  type LayoutDiagnostic,
} from "./layout-compiler";
import {
  canonicalPolygon,
  comparePoint,
  compareText,
  cross,
  inside,
  onSegment,
  pointKey,
  positiveOverlap,
  properCross,
  samePoint,
  segmentKey,
} from "./layout-geometry";
import { readLayoutStructure } from "./layout-structure-admission";

export interface StructuralWallSpan {
  id: string;
  deckId: string;
  a: Point;
  b: Point;
  source: "perimeter" | "partition";
  anchorId: string;
  /** Perimeter is generated from floor union and cannot be individually removed. */
  deletable: boolean;
  faces: { left?: string; right?: string };
}
export interface StructuralJunction {
  id: string;
  deckId: string;
  point: Point;
  kind: "end" | "straight" | "corner" | "tee" | "cross" | "multi";
  wallIds: string[];
  exteriorTieIn: boolean;
  /** No native adapter or pressure proof is inferred from topology. */
  nativeAdapter: null;
}
export interface CompiledStructure {
  walls: StructuralWallSpan[];
  junctions: StructuralJunction[];
  openings: {
    id: string;
    wallId: string;
    width: number;
    exterior: boolean;
    sealingIntent: boolean;
    sweep: Point[];
  }[];
  diagnostics: LayoutDiagnostic[];
}
const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const middle = (a: Point, b: Point): Point => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];
const onLattice = (p: Point, grid: number) =>
  p.every((n) => Number.isInteger(n / grid));
/** Interior cardinal graph edges may use the selected structural subdivision; diagonal
 * edges must match actual polygon interfaces. No wall through a tile centre is inferred. */
export function structuralPartitionSupported(
  doc: LayoutDocument,
  topology: Pick<CompiledLayout, "edges" | "tiles">,
  p: LayoutDocument["partitions"][number],
): boolean {
  const grid = doc.structure?.grid;
  if (
    !grid ||
    samePoint(p.a, p.b) ||
    !onLattice(p.a, grid) ||
    !onLattice(p.b, grid)
  )
    return false;
  const tiles = topology.tiles.filter((t) => t.deckId === p.deckId);
  if (!segmentSupported(p.a, p.b, tiles)) return false;
  if (p.a[0] !== p.b[0] && p.a[1] !== p.b[1]) {
    const edges = topology.edges.filter(
      (e) =>
        e.deckId === p.deckId &&
        e.tileIds.length === 2 &&
        onSegment(e.a, p.a, p.b) &&
        onSegment(e.b, p.a, p.b),
    );
    if (
      Math.abs(
        edges.reduce((sum, e) => sum + length(e.a, e.b), 0) - length(p.a, p.b),
      ) > 1e-8
    )
      return false;
  }
  // Every open subspan needs usable floor on both sides; boundary-coincident walls
  // are always derived perimeter, never a duplicate editable partition.
  const cuts = [
    p.a,
    p.b,
    ...tiles.flatMap((t) => t.vertices).filter((v) => onSegment(v, p.a, p.b)),
  ].sort(comparePoint);
  const dx = p.b[0] - p.a[0],
    dy = p.b[1] - p.a[1],
    n = Math.hypot(dx, dy);
  for (let i = 1; i < cuts.length; i++) {
    if (samePoint(cuts[i - 1], cuts[i])) continue;
    const m = middle(cuts[i - 1], cuts[i]);
    if (
      ![-1, 1].every((s) =>
        tiles.some((t) =>
          inside(
            [m[0] - (s * dy) / n / 1024, m[1] + (s * dx) / n / 1024],
            t.vertices,
          ),
        ),
      )
    )
      return false;
  }
  return true;
}

/** Door sweep corners may be irrational on a diagonal. Clip their edges against
 * convex native nominal polygons with bounded numeric intervals, without passing
 * fractional numbers to the integer-only rational support routine. */
function sweepSegmentSupported(
  a: Point,
  b: Point,
  tiles: CompiledLayout["tiles"],
): boolean {
  const intervals: { lo: number; hi: number }[] = [];
  for (const tile of tiles) {
    let lo = 0,
      hi = 1,
      valid = true;
    for (let i = 0; i < tile.vertices.length; i++) {
      const p = tile.vertices[i],
        q = tile.vertices[(i + 1) % tile.vertices.length],
        ca = cross(p, q, a),
        cb = cross(p, q, b),
        delta = cb - ca;
      if (delta === 0) {
        if (ca < 0) {
          valid = false;
          break;
        }
        continue;
      }
      const t = -ca / delta;
      if (delta > 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
      if (lo > hi) {
        valid = false;
        break;
      }
    }
    if (valid) intervals.push({ lo, hi });
  }
  intervals.sort((a, b) => a.lo - b.lo);
  let end = 0;
  for (const i of intervals) {
    if (i.lo > end + 1e-10) return false;
    end = Math.max(end, i.hi);
    if (end >= 1 - 1e-10) return true;
  }
  return false;
}
/** Slot centres on actual floor interfaces, or full 2m modules of an internal
 * cardinal wall on the selected subgrid. Junction clearance is checked separately. */
export function wallOpeningSlots(
  doc: LayoutDocument,
  topology: Pick<CompiledLayout, "edges" | "tiles" | "walls">,
  anchorId: string,
): Point[] {
  const p = doc.partitions.find((p) => p.id === anchorId),
    wall = p ?? topology.walls.find((w) => w.anchorId === anchorId);
  if (!wall) return [];
  const points = topology.edges
    .filter(
      (e) =>
        e.deckId === wall.deckId &&
        onSegment(e.a, wall.a, wall.b) &&
        onSegment(e.b, wall.a, wall.b),
    )
    .map((e) => middle(e.a, e.b));
  if (p && (p.a[0] === p.b[0] || p.a[1] === p.b[1])) {
    const axis = p.a[0] === p.b[0] ? 1 : 0,
      lo = Math.min(p.a[axis], p.b[axis]),
      hi = Math.max(p.a[axis], p.b[axis]);
    for (let start = Math.ceil(lo / 64) * 64; start + 64 <= hi; start += 64) {
      const slot: Point = [...p.a];
      slot[axis] = start + 32;
      points.push(slot);
    }
  }
  return [...new Map(points.map((p) => [pointKey(p), p])).values()].sort(
    comparePoint,
  );
}

/** A straight exterior run can span several floor edges. Their join is not a
 * corner and does not artificially cap door width to one 2m tile. */
function openingWallSpan(
  wall: StructuralWallSpan,
  walls: StructuralWallSpan[],
): StructuralWallSpan {
  if (wall.source !== "perimeter") return wall;
  let a = wall.a,
    b = wall.b,
    changed = true;
  while (changed) {
    changed = false;
    for (const w of walls) {
      if (
        w.source !== "perimeter" ||
        w.deckId !== wall.deckId ||
        cross(a, b, w.a) !== 0 ||
        cross(a, b, w.b) !== 0
      )
        continue;
      if (
        ![w.a, w.b].some((p) => onSegment(p, a, b)) &&
        ![a, b].some((p) => onSegment(p, w.a, w.b))
      )
        continue;
      const pts = [a, b, w.a, w.b].sort(comparePoint),
        lo = pts[0],
        hi = pts[3];
      const nextA = comparePoint(wall.a, wall.b) < 0 ? lo : hi,
        nextB = comparePoint(wall.a, wall.b) < 0 ? hi : lo;
      if (!samePoint(a, nextA) || !samePoint(b, nextB)) {
        a = nextA;
        b = nextB;
        changed = true;
      }
    }
  }
  return { ...wall, a, b };
}

/** Structural graph over the already validated exact floor union. Stable IDs derive
 * from source wall IDs and lattice coordinates, never room names or random UUIDs. */
export function compileStructure(
  doc: LayoutDocument,
  topology: Pick<CompiledLayout, "edges" | "tiles" | "walls">,
): CompiledStructure {
  const out: CompiledStructure = {
    walls: [],
    junctions: [],
    openings: [],
    diagnostics: [],
  };
  const config = doc.structure;
  if (!config) return out;
  const issue = (
    code: string,
    ids: string[],
    message: string,
    severity: LayoutDiagnostic["severity"] = "error",
  ) => out.diagnostics.push({ code, ids: [...ids].sort(), message, severity });
  const h = config.hull;
  for (const d of doc.decks) {
    if (
      d.elevation < h.origin[2] ||
      d.elevation + d.ceiling > h.origin[2] + h.height
    )
      issue(
        "hull-height",
        [d.id],
        "Deck floor/ceiling exceeds the selected hull height.",
      );
    for (const t of topology.tiles.filter((t) => t.deckId === d.id)) {
      if (
        t.vertices.some(
          (p) => p[0] < h.origin[0] || p[0] > h.origin[0] + h.width,
        )
      )
        issue("hull-width", [t.id], "Floor exceeds the selected hull width.");
      if (
        t.vertices.some(
          (p) => p[1] < h.origin[1] || p[1] > h.origin[1] + h.length,
        )
      )
        issue("hull-length", [t.id], "Floor exceeds the selected hull length.");
    }
  }
  for (const [i, d] of doc.decks.entries())
    for (const q of doc.decks.slice(i + 1))
      if (
        Math.max(d.elevation, q.elevation) <
        Math.min(d.elevation + d.ceiling, q.elevation + q.ceiling)
      )
        issue(
          "deck-height-overlap",
          [d.id, q.id],
          "Reserved deck height intervals overlap.",
        );
  const base: StructuralWallSpan[] = [
    ...topology.walls
      .filter((w) => w.source === "perimeter")
      .map((w) => ({
        id: w.key,
        deckId: w.deckId,
        a: w.a,
        b: w.b,
        source: w.source,
        anchorId: w.anchorId,
        deletable: false,
        faces: config.wallFaces[w.anchorId] ?? {},
      })),
    ...doc.partitions
      .filter((p) => structuralPartitionSupported(doc, topology, p))
      .map((p) => ({
        id: p.id,
        deckId: p.deckId,
        a: p.a,
        b: p.b,
        source: "partition" as const,
        anchorId: p.id,
        deletable: true,
        faces: config.wallFaces[p.id] ?? {},
      })),
  ];
  base.sort((a, b) => compareText(a.id, b.id));
  if ((base.length * (base.length - 1)) / 2 > 1048576) {
    issue(
      "wall-graph-budget",
      [],
      "Structural graph pair budget exceeded; split the authoring proposal.",
    );
    return out;
  }
  const cuts = new Map(base.map((w) => [w.id, [w.a, w.b]]));
  for (let i = 0; i < base.length; i++)
    for (let j = i + 1; j < base.length; j++) {
      const a = base[i],
        b = base[j];
      if (a.deckId !== b.deckId) continue;
      for (const p of [b.a, b.b])
        if (onSegment(p, a.a, a.b)) cuts.get(a.id)!.push(p);
      for (const p of [a.a, a.b])
        if (onSegment(p, b.a, b.b)) cuts.get(b.id)!.push(p);
      if (properCross(a.a, a.b, b.a, b.b)) {
        const dx = a.b[0] - a.a[0],
          dy = a.b[1] - a.a[1],
          ex = b.b[0] - b.a[0],
          ey = b.b[1] - b.a[1];
        const den = dx * ey - dy * ex,
          t = ((b.a[0] - a.a[0]) * ey - (b.a[1] - a.a[1]) * ex) / den;
        const p: Point = [a.a[0] + t * dx, a.a[1] + t * dy];
        if (!onLattice(p, config.grid))
          issue(
            "wall-junction-lattice",
            [a.anchorId, b.anchorId],
            "Wall crossing must lie on a structural lattice node.",
          );
        else {
          cuts.get(a.id)!.push(p);
          cuts.get(b.id)!.push(p);
        }
      }
      if (
        a.source === "partition" &&
        b.source === "partition" &&
        cross(a.a, a.b, b.a) === 0 &&
        cross(a.a, a.b, b.b) === 0
      ) {
        const axis = a.a[0] === a.b[0] ? 1 : 0;
        if (
          Math.max(
            Math.min(a.a[axis], a.b[axis]),
            Math.min(b.a[axis], b.b[axis]),
          ) <
          Math.min(
            Math.max(a.a[axis], a.b[axis]),
            Math.max(b.a[axis], b.b[axis]),
          )
        )
          issue(
            "duplicate-partition",
            [a.anchorId, b.anchorId],
            "Partitions overlap on the same wall line.",
          );
      }
    }
  for (const w of base) {
    const points = [
      ...new Map(cuts.get(w.id)!.map((p) => [pointKey(p), p])).values(),
    ].sort(comparePoint);
    if (comparePoint(w.a, w.b) > 0) points.reverse();
    for (let i = 1; i < points.length; i++)
      out.walls.push({
        ...w,
        id: `${w.id}:${segmentKey(points[i - 1], points[i])}`,
        a: points[i - 1],
        b: points[i],
      });
  }
  const nodes = new Map<
    string,
    { deckId: string; point: Point; walls: StructuralWallSpan[] }
  >();
  for (const w of out.walls)
    for (const p of [w.a, w.b]) {
      const key = `${w.deckId}:${pointKey(p)}`,
        n = nodes.get(key) ?? { deckId: w.deckId, point: p, walls: [] };
      n.walls.push(w);
      nodes.set(key, n);
    }
  for (const [id, n] of nodes) {
    const opposite = n.walls.map((w) => (samePoint(w.a, n.point) ? w.b : w.a)),
      count = opposite.length;
    const kind =
      count === 1
        ? "end"
        : count === 2
          ? cross(opposite[0], n.point, opposite[1]) === 0
            ? "straight"
            : "corner"
          : count === 3
            ? "tee"
            : count === 4
              ? "cross"
              : "multi";
    out.junctions.push({
      id,
      deckId: n.deckId,
      point: n.point,
      kind,
      wallIds: n.walls.map((w) => w.id).sort(),
      exteriorTieIn:
        n.walls.some((w) => w.source === "perimeter") &&
        n.walls.some((w) => w.source === "partition"),
      nativeAdapter: null,
    });
  }
  for (const id of Object.keys(config.wallFaces))
    if (!base.some((w) => w.anchorId === id))
      issue(
        "wall-face-anchor",
        [id],
        "Wall finish references a missing generated boundary or partition.",
      );
  for (const id of Object.keys(config.tileStyles))
    if (!doc.tiles.some((t) => t.id === id))
      issue(
        "floor-style-anchor",
        [id],
        "Floor style references a missing derived floor tile.",
      );
  for (const [id, style] of Object.entries(config.tileStyles)) {
    const tile = doc.tiles.find((t) => t.id === id),
      deck = tile && doc.decks.find((d) => d.id === tile.deckId);
    if (
      style.model &&
      tile &&
      deck &&
      !matchNativeFloorTile(tile, deck.elevation, style.model)
    )
      issue(
        "floor-model-interface",
        [id],
        "Selected floor model/revision has no pinned native interface matching this exact tile polygon and floor datum.",
      );
  }
  for (const o of doc.openings) {
    const anchor = base.find(
      (w) => w.anchorId === o.partitionId && w.deckId === o.deckId,
    );
    const wall = anchor ? openingWallSpan(anchor, base) : undefined;
    if (
      !wall ||
      samePoint(o.a, o.b) ||
      !onSegment(o.a, wall.a, wall.b) ||
      !onSegment(o.b, wall.a, wall.b)
    ) {
      issue(
        "opening-anchor",
        [o.id],
        "Opening must lie within its selected wall span.",
      );
      continue;
    }
    const center = middle(o.a, o.b),
      width = length(o.a, o.b),
      setback = o.setback ?? 4;
    // Slots come from real polygon tile interfaces, including diagonals. A wider
    // aperture may cross a collinear seam but never a corner/T/cross node.
    const slot = wallOpeningSlots(doc, topology, o.partitionId).some((p) =>
      samePoint(p, center),
    );
    if (!slot)
      issue(
        "opening-slot",
        [o.id],
        "Centre the opening on a floor-edge slot midpoint.",
      );
    if (width < 24)
      issue(
        "opening-width",
        [o.id],
        "Opening reserves less than the existing 0.75 m draft clearance.",
      );
    for (const j of out.junctions.filter(
      (j) =>
        j.deckId === o.deckId &&
        j.kind !== "straight" &&
        onSegment(j.point, wall.a, wall.b),
    ))
      if (
        onSegment(j.point, o.a, o.b) ||
        Math.min(length(j.point, o.a), length(j.point, o.b)) < setback
      )
        issue(
          "opening-setback",
          [o.id, j.id],
          "Door jamb reserve abuts a wall end, corner or junction.",
        );
    const dx = (o.b[0] - o.a[0]) / width,
      dy = (o.b[1] - o.a[1]) / width,
      c = o.clearance;
    const sweep = canonicalPolygon([
      [o.a[0] - dy * c, o.a[1] + dx * c],
      [o.b[0] - dy * c, o.b[1] + dx * c],
      [o.b[0] + dy * c, o.b[1] - dx * c],
      [o.a[0] + dy * c, o.a[1] - dx * c],
    ]);
    const blocked =
      base.some(
        (w) =>
          w.deckId === o.deckId &&
          w.anchorId !== wall.anchorId &&
          !(
            wall.source === "perimeter" &&
            w.source === "perimeter" &&
            cross(wall.a, wall.b, w.a) === 0 &&
            cross(wall.a, wall.b, w.b) === 0 &&
            onSegment(w.a, wall.a, wall.b) &&
            onSegment(w.b, wall.a, wall.b)
          ) &&
          (inside(w.a, sweep, false) ||
            inside(w.b, sweep, false) ||
            sweep.some((a, i) => properCross(a, sweep[(i + 1) % 4], w.a, w.b))),
      ) ||
      doc.fittings.some(
        (f) =>
          f.deckId === o.deckId && positiveOverlap(sweep, fittingPolygon(f)),
      );
    const tiles = topology.tiles.filter((t) => t.deckId === o.deckId);
    const supported =
      sweep.every((p, i) =>
        sweepSegmentSupported(p, sweep[(i + 1) % 4], tiles),
      ) &&
      !topology.walls.some(
        (w) =>
          w.source === "perimeter" &&
          w.deckId === o.deckId &&
          inside(middle(w.a, w.b), sweep, false),
      );
    if (blocked || (wall.source === "partition" && !supported))
      issue(
        "opening-clearance",
        [o.id],
        "Reserved approach/sweep intersects structure, equipment or unsupported floor.",
      );
    for (const q of doc.openings.filter(
      (q) =>
        q.id < o.id &&
        q.deckId === o.deckId &&
        (q.partitionId === o.partitionId ||
          (wall.source === "perimeter" &&
            cross(wall.a, wall.b, q.a) === 0 &&
            cross(wall.a, wall.b, q.b) === 0)),
    )) {
      const axis = o.a[0] === o.b[0] ? 1 : 0;
      const gap =
        Math.max(
          Math.min(o.a[axis], o.b[axis]),
          Math.min(q.a[axis], q.b[axis]),
        ) -
        Math.min(
          Math.max(o.a[axis], o.b[axis]),
          Math.max(q.a[axis], q.b[axis]),
        );
      if (
        gap <
        Math.max(setback, q.setback ?? 4) * Math.max(Math.abs(dx), Math.abs(dy))
      )
        issue(
          "opening-overlap",
          [o.id, q.id],
          "Opening spans or their jamb reservations overlap.",
        );
    }
    out.openings.push({
      id: o.id,
      wallId: wall.anchorId,
      width,
      exterior: wall.source === "perimeter",
      sealingIntent: o.kind !== "passage",
      sweep,
    });
    if (wall.source === "perimeter")
      issue(
        "exterior-landing-unqualified",
        [o.id],
        "External aperture requires a qualified exterior landing/boarding and native door interface before gameplay installation.",
        "warning",
      );
  }
  for (const a of config.armor) {
    const wall = base.find(
        (w) =>
          w.source === "perimeter" &&
          w.anchorId === a.boundaryId &&
          w.deckId === a.deckId,
      ),
      poly = canonicalPolygon(a.footprint);
    if (!wall || !poly.some((p) => onSegment(p, wall.a, wall.b)))
      issue(
        "armor-anchor",
        [a.id],
        "Armor reservation must contact its selected exterior boundary.",
      );
    if (
      poly.some(
        (p, i) =>
          cross(p, poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]) <=
          0,
      )
    )
      issue(
        "armor-polygon",
        [a.id],
        "Armor reservation must be a nonzero convex polygon.",
      );
    if (
      topology.tiles.some(
        (t) => t.deckId === a.deckId && positiveOverlap(poly, t.vertices),
      )
    )
      issue(
        "armor-interior",
        [a.id],
        "Exterior armor cannot consume the usable floor envelope.",
      );
    const deck = doc.decks.find((d) => d.id === a.deckId);
    if (
      !deck ||
      a.bottom < deck.elevation ||
      a.top > deck.elevation + deck.ceiling
    )
      issue(
        "armor-height",
        [a.id],
        "Armor mount exceeds its declared deck interval.",
      );
  }
  if (
    doc.partitions.some(
      (p) =>
        !topology.edges.some(
          (e) =>
            e.deckId === p.deckId &&
            onSegment(e.a, p.a, p.b) &&
            onSegment(e.b, p.a, p.b),
        ),
    )
  )
    issue(
      "subgrid-room-regions",
      [],
      "Room label regions currently follow whole floor tiles; subgrid wall junctions are compiled separately and do not assert a sealed volume.",
      "warning",
    );
  issue(
    "structural-native-adapters",
    [],
    "Generated junctions, two-sided panels, opening models and armor mounting offsets require exact native asset/envelope qualification; topology is not a pressure or collision proof.",
    "warning",
  );
  out.walls.sort((a, b) => compareText(a.id, b.id));
  out.junctions.sort((a, b) => compareText(a.id, b.id));
  out.openings.sort((a, b) => compareText(a.id, b.id));
  out.diagnostics.sort(
    (a, b) =>
      compareText(a.code, b.code) || compareText(a.ids.join(), b.ids.join()),
  );
  return out;
}

function edit(
  doc: LayoutDocument,
  change: (next: LayoutDocument) => void,
): LayoutDocument {
  const next = structuredClone(doc);
  change(next);
  const result = compileLayout(next),
    errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length)
    throw new Error([...new Set(errors.map((d) => d.message))].join(" "));
  return next;
}
export function setHullEnvelope(
  doc: LayoutDocument,
  hull: HullEnvelope,
): LayoutDocument {
  return edit(doc, (next) => {
    next.structure = next.structure ?? {
      schema: "sidereal.layout-structure.v1",
      hull: structuredClone(hull),
      grid: 16,
      wallFaces: {},
      tileStyles: {},
      armor: [],
    };
    next.structure.hull = structuredClone(hull);
    readLayoutStructure(next.structure);
  });
}
export function setWallFace(
  doc: LayoutDocument,
  anchorId: string,
  side: "left" | "right",
  finish: string,
): LayoutDocument {
  return edit(doc, (next) => {
    if (!next.structure) throw new Error("Choose a hull envelope first.");
    next.structure.wallFaces = {
      ...next.structure.wallFaces,
      [anchorId]: { ...next.structure.wallFaces[anchorId], [side]: finish },
    };
  });
}
export function setFloorStyle(
  doc: LayoutDocument,
  tileId: string,
  style: FloorStyle,
): LayoutDocument {
  return edit(doc, (next) => {
    if (!next.structure) throw new Error("Choose a hull envelope first.");
    next.structure.tileStyles = {
      ...next.structure.tileStyles,
      [tileId]: structuredClone(style),
    };
  });
}
export interface OpeningProposal {
  id: string;
  deckId: string;
  partitionId: string;
  slot: Point;
  width: number;
  kind: Opening["kind"];
  clearance: number;
  sill: number;
  setback?: number;
}
export function proposeWallOpening(
  doc: LayoutDocument,
  input: OpeningProposal,
): LayoutDocument {
  if (!doc.structure) throw new Error("Choose a hull envelope first.");
  const topology = compileLayout(doc),
    wall = topology.structure?.walls.find(
      (w) =>
        w.anchorId === input.partitionId &&
        w.deckId === input.deckId &&
        onSegment(input.slot, w.a, w.b),
    );
  if (!wall || !Number.isSafeInteger(input.width) || input.width < 1)
    throw new Error("Choose a valid wall slot and positive integer width.");
  const dx = wall.b[0] - wall.a[0],
    dy = wall.b[1] - wall.a[1],
    span = Math.max(Math.abs(dx), Math.abs(dy));
  const a: Point = [
      input.slot[0] - ((dx / span) * input.width) / 2,
      input.slot[1] - ((dy / span) * input.width) / 2,
    ],
    b: Point = [
      input.slot[0] + ((dx / span) * input.width) / 2,
      input.slot[1] + ((dy / span) * input.width) / 2,
    ];
  if ([...a, ...b].some((n) => !Number.isSafeInteger(n)))
    throw new Error(
      "Door width must resolve to exact integer lattice endpoints on this slope.",
    );
  return edit(doc, (next) => {
    const opening: Opening = {
      id: input.id,
      deckId: input.deckId,
      partitionId: input.partitionId,
      a,
      b,
      kind: input.kind,
      clearance: input.clearance,
      sill: input.sill,
      setback: input.setback ?? 4,
    };
    next.openings = [
      ...next.openings.filter((o) => o.id !== input.id),
      opening,
    ];
  });
}

/** Immediate editing guard: only selected hull W/L/height limits, independent of
 * unrelated unresolved drafts, room diagnostics or stale finish anchors. */
export function assertHullEnvelopeFits(doc: LayoutDocument): void {
  if (!doc.structure) return;
  const h = readLayoutStructure(doc.structure).hull;
  for (const d of doc.decks)
    if (
      d.elevation < h.origin[2] ||
      d.elevation + d.ceiling > h.origin[2] + h.height
    )
      throw new Error("Deck floor/ceiling exceeds the selected hull height.");
  for (const t of doc.tiles) {
    if (
      t.vertices.some((p) => p[0] < h.origin[0] || p[0] > h.origin[0] + h.width)
    )
      throw new Error("Floor exceeds the selected hull width.");
    if (
      t.vertices.some(
        (p) => p[1] < h.origin[1] || p[1] > h.origin[1] + h.length,
      )
    )
      throw new Error("Floor exceeds the selected hull length.");
  }
}
