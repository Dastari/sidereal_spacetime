import {
  compileStructure,
  structuralPartitionSupported,
  type CompiledStructure,
} from "./layout-structure";
import {
  LAYOUT_COMPILER,
  LAYOUT_LIMITS as L,
  transformPoint,
  type LayoutDocument,
  type Point,
  type FloorTile,
} from "../../content/src/ship-layout";
import {
  area2,
  canonicalPolygon,
  comparePoint,
  compareText,
  cross,
  inside,
  lineKey,
  onSegment,
  pointKey,
  positiveOverlap,
  properCross,
  samePoint,
  segmentKey,
  cacheFingerprint,
} from "./layout-geometry";
import { readLayout } from "./layout-validation";
export interface LayoutDiagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  ids: string[];
  message: string;
}
export interface LayoutEdge {
  key: string;
  deckId: string;
  a: Point;
  b: Point;
  tileIds: string[];
}
export interface LayoutLoop {
  deckId: string;
  kind: "exterior" | "hole";
  points: Point[];
  declarationId: string | null;
}
export interface LayoutWall {
  key: string;
  deckId: string;
  a: Point;
  b: Point;
  source: "perimeter" | "partition";
  anchorId: string;
}
export interface CompiledRoom {
  id: string;
  tileIds: string[];
  area: number;
  regionId: string;
}
export interface CompiledLayout {
  structure?: CompiledStructure;
  compiler: string;
  fingerprint: string;
  valid: boolean;
  tiles: FloorTile[];
  edges: LayoutEdge[];
  loops: LayoutLoop[];
  walls: LayoutWall[];
  roof: { tileId: string; deckId: string; vertices: Point[] }[];
  rooms: CompiledRoom[];
  portals: { id: string; roomIds: string[]; kind: string }[];
  routeComponents: { channel: string; nodeIds: string[] }[];
  diagnostics: LayoutDiagnostic[];
  area: number;
  bounds: { min: Point; max: Point };
  components: number;
}
class Groups {
  parents = new Map<string, string>();
  root(a: string): string {
    const p = this.parents.get(a);
    if (!p) {
      this.parents.set(a, a);
      return a;
    }
    if (p === a) return a;
    const r = this.root(p);
    this.parents.set(a, r);
    return r;
  }
  join(a: string, b: string) {
    a = this.root(a);
    b = this.root(b);
    if (a !== b)
      this.parents.set(
        compareText(a, b) < 0 ? b : a,
        compareText(a, b) < 0 ? a : b,
      );
  }
}
/** Pure deterministic design compiler. Time measurements deliberately stay outside its output. */
export function compileLayout(input: unknown): CompiledLayout {
  const out: CompiledLayout = {
    compiler: LAYOUT_COMPILER,
    fingerprint: "",
    valid: false,
    tiles: [],
    edges: [],
    loops: [],
    walls: [],
    roof: [],
    rooms: [],
    portals: [],
    routeComponents: [],
    diagnostics: [],
    area: 0,
    bounds: { min: [0, 0], max: [0, 0] },
    components: 0,
  };
  const diagnostic = (
    code: string,
    ids: string[],
    message: string,
    severity: LayoutDiagnostic["severity"] = "error",
  ) =>
    out.diagnostics.push({
      code,
      ids: [...ids].sort(compareText),
      message,
      severity,
    });
  const finish = () => {
    out.diagnostics.sort(
      (a, b) =>
        compareText(a.code, b.code) ||
        compareText(a.ids.join(","), b.ids.join(",")),
    );
    out.valid = !out.diagnostics.some((d) => d.severity === "error");
    return out;
  };
  let doc: LayoutDocument;
  try {
    doc = readLayout(input);
  } catch (e) {
    diagnostic("admission", [], String(e));
    return finish();
  }
  const sorted = <T extends { id: string }>(a: T[]) =>
    [...a].sort((a, b) => compareText(a.id, b.id));
  const normalized = {
    ...doc,
    ...(doc.assembly
      ? { assembly: { ...doc.assembly, parts: sorted(doc.assembly.parts) } }
      : {}),
    decks: sorted(doc.decks).map((d) => ({ ...d, holes: sorted(d.holes) })),
    tiles: sorted(doc.tiles).map((t) => ({
      id: t.id,
      deckId: t.deckId,
      shape: t.shape,
      revision: t.revision,
      vertices: canonicalPolygon(t.vertices),
      material: t.material,
    })),
    partitions: sorted(doc.partitions),
    openings: sorted(doc.openings),
    rooms: sorted(doc.rooms),
    nodes: sorted(doc.nodes),
    routes: sorted(doc.routes),
    fittings: sorted(doc.fittings),
    dependencies: [...doc.dependencies].sort((a, b) => compareText(a.id, b.id)),
  };
  out.fingerprint = cacheFingerprint(normalized);
  for (const t of normalized.tiles) {
    const p = t.vertices,
      n = p.length;
    let invalid = new Set(p.map(pointKey)).size !== n || area2(p) === 0;
    for (let i = 0; i < n; i++) {
      if (cross(p[i], p[(i + 1) % n], p[(i + 2) % n]) <= 0) invalid = true;
      for (let j = i + 1; j < n; j++)
        if (properCross(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]))
          invalid = true;
    }
    const parallel = (a: Point, b: Point, c: Point, d: Point) =>
      (b[0] - a[0]) * (d[1] - c[1]) === (b[1] - a[1]) * (d[0] - c[0]);
    if (
      t.shape === "rectangle" &&
      (n !== 4 ||
        p.some((a, i) => {
          const b = p[(i + 1) % n];
          return a[0] !== b[0] && a[1] !== b[1];
        }))
    )
      invalid = true;
    if (
      t.shape === "triangle" &&
      (n !== 3 ||
        !p.some((a, i) => a[0] === p[(i + 1) % n][0]) ||
        !p.some((a, i) => a[1] === p[(i + 1) % n][1]) ||
        !p.some((a, i) => {
          const b = p[(i + 1) % n],
            c = p[(i + 2) % n];
          return (
            (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) === 0
          );
        }))
    )
      invalid = true;
    if (
      t.shape === "trapezoid" &&
      (n !== 4 ||
        !(parallel(p[0], p[1], p[2], p[3]) || parallel(p[1], p[2], p[3], p[0])))
    )
      invalid = true;
    if (invalid)
      diagnostic(
        "polygon",
        [t.id],
        "Use a nonzero convex catalog polygon without repeated or crossing edges; named rectangles, right triangles and trapezoids retain their shape constraints.",
      );
    else
      out.tiles.push(
        doc.structure?.tileStyles[t.id]?.material
          ? { ...t, material: doc.structure.tileStyles[t.id].material! }
          : t,
      );
  }
  if (out.tiles.length !== doc.tiles.length) return finish();
  const all = out.tiles.flatMap((t) => t.vertices);
  if (all.length)
    out.bounds = {
      min: [
        Math.min(...all.map((p) => p[0])),
        Math.min(...all.map((p) => p[1])),
      ],
      max: [
        Math.max(...all.map((p) => p[0])),
        Math.max(...all.map((p) => p[1])),
      ],
    };
  if (out.bounds.max.some((n, i) => n - out.bounds.min[i] > L.span)) {
    diagnostic("span", [], "Floorplan exceeds the 256 m horizontal span.");
    return finish();
  }
  out.area = out.tiles.reduce((a, t) => a + area2(t.vertices) / 2048, 0);
  for (const deck of normalized.decks) {
    const tiles = out.tiles.filter((t) => t.deckId === deck.id),
      groups = new Groups();
    const boxes = tiles
      .map((t) => ({
        t,
        minX: Math.min(...t.vertices.map((p) => p[0])),
        maxX: Math.max(...t.vertices.map((p) => p[0])),
        minY: Math.min(...t.vertices.map((p) => p[1])),
        maxY: Math.max(...t.vertices.map((p) => p[1])),
      }))
      .sort((a, b) => a.minX - b.minX || compareText(a.t.id, b.t.id));
    let overlap = false;
    for (let i = 0; i < boxes.length; i++)
      for (
        let j = i + 1;
        j < boxes.length && boxes[j].minX < boxes[i].maxX;
        j++
      ) {
        const a = boxes[i],
          b = boxes[j];
        if (
          a.minY < b.maxY &&
          a.maxY > b.minY &&
          positiveOverlap(a.t.vertices, b.t.vertices)
        ) {
          diagnostic(
            "overlap",
            [a.t.id, b.t.id],
            "Positive-area floor overlap. Move or replace the selected tile.",
          );
          overlap = true;
        }
        if (out.diagnostics.length > 256) {
          diagnostic(
            "diagnostic-budget",
            [],
            "Too many overlaps; validation stopped.",
          );
          return finish();
        }
      }
    if (overlap) continue;
    const lines = new Map<string, { a: Point; b: Point; id: string }[]>();
    for (const t of tiles) {
      groups.root(t.id);
      for (let i = 0; i < t.vertices.length; i++) {
        const a = t.vertices[i],
          b = t.vertices[(i + 1) % t.vertices.length],
          key = lineKey(a, b),
          list = lines.get(key) ?? [];
        list.push({ a, b, id: t.id });
        lines.set(key, list);
      }
    }
    const boundary: { a: Point; b: Point; key: string }[] = [];
    for (const [, segments] of [...lines.entries()].sort(([a], [b]) =>
      compareText(a, b),
    )) {
      const points = [
        ...new Map(
          segments.flatMap((s) => [s.a, s.b]).map((p) => [pointKey(p), p]),
        ).values(),
      ].sort(comparePoint);
      const endpointIndices = new Map(points.map((p, i) => [pointKey(p), i]));
      const incidences = new Map<
        string,
        { a: Point; b: Point; id: string }[]
      >();
      for (const s of segments) {
        const ia = endpointIndices.get(pointKey(s.a))!,
          ib = endpointIndices.get(pointKey(s.b))!;
        const cuts = points.slice(Math.min(ia, ib), Math.max(ia, ib) + 1);
        if (comparePoint(s.a, s.b) > 0) cuts.reverse();
        for (let i = 1; i < cuts.length; i++) {
          const a = cuts[i - 1],
            b = cuts[i],
            key = segmentKey(a, b),
            list = incidences.get(key) ?? [];
          list.push({ a, b, id: s.id });
          incidences.set(key, list);
        }
      }
      for (const [key, list] of incidences) {
        if (out.edges.length >= L.edges) {
          diagnostic(
            "edge-budget",
            [],
            "Normalized structural edge budget exceeded.",
          );
          return finish();
        }
        const first = list[0],
          ids = list.map((s) => s.id).sort(compareText);
        out.edges.push({
          key: `${deck.id}:${key}`,
          deckId: deck.id,
          a: comparePoint(first.a, first.b) < 0 ? first.a : first.b,
          b: comparePoint(first.a, first.b) < 0 ? first.b : first.a,
          tileIds: ids,
        });
        if (list.length === 1) boundary.push({ ...first, key });
        else if (
          list.length === 2 &&
          samePoint(first.a, list[1].b) &&
          samePoint(first.b, list[1].a)
        )
          groups.join(ids[0], ids[1]);
        else
          diagnostic(
            "non-manifold",
            ids,
            "Repeated same-side or more than two incident floor faces.",
          );
      }
    }
    const componentCount = new Set(tiles.map((t) => groups.root(t.id))).size;
    out.components += componentCount;
    if (componentCount > 1)
      diagnostic(
        "islands",
        [deck.id],
        `${componentCount} disconnected floor islands; connect them along an edge.`,
      );
    const outgoing = new Map<string, typeof boundary>(),
      incoming = new Map<string, number>();
    for (const e of boundary) {
      const k = pointKey(e.a),
        list = outgoing.get(k) ?? [];
      list.push(e);
      outgoing.set(k, list);
      incoming.set(pointKey(e.b), (incoming.get(pointKey(e.b)) ?? 0) + 1);
    }
    let manifold = true;
    for (const [p, list] of outgoing)
      if (list.length !== 1 || incoming.get(p) !== 1) {
        diagnostic(
          "point-contact",
          [deck.id],
          `Ambiguous boundary at ${p}; point contact is not a structural connection.`,
        );
        manifold = false;
      }
    if (!manifold) continue;
    const remaining = new Map(boundary.map((e) => [e.key, e]));
    while (remaining.size) {
      const start = [...remaining.values()].sort(
        (a, b) => comparePoint(a.a, b.a) || comparePoint(a.b, b.b),
      )[0];
      let e = start;
      const points: Point[] = [];
      do {
        points.push(e.a);
        remaining.delete(e.key);
        e = outgoing.get(pointKey(e.b))![0];
      } while (e !== start && points.length <= boundary.length);
      const kind = area2(points) > 0 ? "exterior" : "hole",
        holes =
          kind === "hole"
            ? deck.holes.filter((h) => inside(h.seed, points, false))
            : [];
      if (kind === "hole" && holes.length !== 1)
        diagnostic(
          "unclassified-hole",
          [deck.id],
          "Every void needs exactly one explicit hole seed.",
        );
      out.loops.push({
        deckId: deck.id,
        kind,
        points,
        declarationId: holes[0]?.id ?? null,
      });
    }
    for (const h of deck.holes)
      if (!out.loops.some((l) => l.declarationId === h.id))
        diagnostic(
          "hole-seed",
          [h.id],
          "Hole seed does not identify a unique empty enclosed void.",
        );
    for (const e of boundary)
      out.walls.push({
        key: `perimeter:${deck.id}:${e.key}`,
        deckId: deck.id,
        a: e.a,
        b: e.b,
        source: "perimeter",
        anchorId: `${deck.id}:${e.key}`,
      });
    if (deck.roof)
      for (const t of tiles)
        out.roof.push({ tileId: t.id, deckId: deck.id, vertices: t.vertices });
  }
  out.edges.sort((a, b) => compareText(a.key, b.key));
  if (out.diagnostics.some((d) => d.severity === "error")) return finish();
  const partitionEdges = new Map<string, Set<string>>(),
    occupiedEdges = new Map<string, string>();
  for (const p of normalized.partitions) {
    const matches = out.edges.filter(
      (e) =>
        e.deckId === p.deckId &&
        e.tileIds.length === 2 &&
        onSegment(e.a, p.a, p.b) &&
        onSegment(e.b, p.a, p.b),
    );
    const length = (a: Point, b: Point) =>
      Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    if (
      doc.structure
        ? !structuralPartitionSupported(doc, out, p)
        : samePoint(p.a, p.b) ||
          matches.reduce((s, e) => s + length(e.a, e.b), 0) !== length(p.a, p.b)
    ) {
      diagnostic(
        "partition-anchor",
        [p.id],
        "Partition must follow a continuous chain of shared tile edges.",
      );
      continue;
    }
    partitionEdges.set(p.id, new Set(matches.map((e) => e.key)));
    for (const e of matches) {
      const old = occupiedEdges.get(e.key);
      if (old)
        diagnostic(
          "duplicate-partition",
          [p.id, old],
          "Two partitions occupy the same structural span.",
        );
      occupiedEdges.set(e.key, p.id);
    }
  }
  const validOpenings = new Set<string>();
  for (const o of doc.structure ? [] : normalized.openings) {
    const p = doc.partitions.find(
      (p) => p.id === o.partitionId && p.deckId === o.deckId,
    );
    if (
      !p ||
      !partitionEdges.has(p.id) ||
      !onSegment(o.a, p.a, p.b) ||
      !onSegment(o.b, p.a, p.b) ||
      samePoint(o.a, o.b)
    ) {
      diagnostic(
        "opening-anchor",
        [o.id],
        "Opening must reserve a nonzero span in a valid partition.",
      );
      continue;
    }
    if (o.a[0] !== o.b[0] && o.a[1] !== o.b[1]) {
      diagnostic(
        "opening-adapter",
        [o.id],
        "Diagonal opening adapter is unavailable; use an axis-aligned partition.",
      );
      continue;
    }
    if (Math.abs(o.a[0] - o.b[0]) + Math.abs(o.a[1] - o.b[1]) < 24) {
      diagnostic(
        "opening-width",
        [o.id],
        "Opening must be at least 0.75 m wide for the draft actor clearance.",
      );
      continue;
    }
    const others = doc.openings.filter(
      (q) => q.id < o.id && q.partitionId === o.partitionId,
    );
    if (
      others.some((q) => {
        const axis = o.a[0] === o.b[0] ? 1 : 0;
        return (
          Math.max(
            Math.min(o.a[axis], o.b[axis]),
            Math.min(q.a[axis], q.b[axis]),
          ) <
          Math.min(
            Math.max(o.a[axis], o.b[axis]),
            Math.max(q.a[axis], q.b[axis]),
          )
        );
      })
    ) {
      diagnostic("opening-overlap", [o.id], "Opening reservations overlap.");
      continue;
    }
    const horizontal = o.a[1] === o.b[1],
      a = o.a,
      b = o.b,
      c = o.clearance;
    const box: Point[] = horizontal
      ? [
          [Math.min(a[0], b[0]), a[1] - c],
          [Math.max(a[0], b[0]), a[1] - c],
          [Math.max(a[0], b[0]), a[1] + c],
          [Math.min(a[0], b[0]), a[1] + c],
        ]
      : [
          [a[0] - c, Math.min(a[1], b[1])],
          [a[0] + c, Math.min(a[1], b[1])],
          [a[0] + c, Math.max(a[1], b[1])],
          [a[0] - c, Math.max(a[1], b[1])],
        ];
    const walls = out.walls.filter((w) => w.deckId === o.deckId);
    if (
      box.some(
        (pt) =>
          !out.tiles.some(
            (t) => t.deckId === o.deckId && inside(pt, t.vertices),
          ),
      ) ||
      walls.some((w) =>
        box.some((a, i) => properCross(a, box[(i + 1) % 4], w.a, w.b)),
      ) ||
      doc.partitions.some(
        (q) =>
          q.id !== p.id &&
          q.deckId === o.deckId &&
          (inside(q.a, box, false) ||
            inside(q.b, box, false) ||
            box.some((a, i) => properCross(a, box[(i + 1) % 4], q.a, q.b))),
      ) ||
      doc.fittings.some(
        (f) => f.deckId === o.deckId && positiveOverlap(box, fittingPolygon(f)),
      )
    )
      diagnostic(
        "opening-clearance",
        [o.id],
        "Door sweep or approach zone is blocked or unsupported.",
      );
    else validOpenings.add(o.id);
    if (o.kind === "airlock")
      diagnostic(
        "airlock-unimplemented",
        [o.id],
        "Airlock interlock, paired chamber and pressure behavior are not implemented.",
        "warning",
      );
  }
  if (doc.structure) {
    out.structure = compileStructure(doc, out);
    out.diagnostics.push(...out.structure.diagnostics);
    for (const o of out.structure.openings)
      if (
        !out.structure.diagnostics.some(
          (d) => d.severity === "error" && d.ids.includes(o.id),
        )
      )
        validOpenings.add(o.id);
    // Exterior apertures split the generated boundary; the wall itself stays derived.
    out.walls = out.walls.flatMap((w) => {
      const openings = doc.openings.filter(
        (o) =>
          validOpenings.has(o.id) &&
          o.deckId === w.deckId &&
          (o.partitionId === w.anchorId ||
            (w.source === "perimeter" &&
              out.structure!.openings.some(
                (q) => q.id === o.id && q.exterior,
              ) &&
              cross(w.a, w.b, o.a) === 0 &&
              cross(w.a, w.b, o.b) === 0)),
      );
      if (!openings.length) return [w];
      const points = [
        w.a,
        w.b,
        ...openings
          .flatMap((o) => [o.a, o.b])
          .filter((p) => onSegment(p, w.a, w.b)),
      ].sort(comparePoint);
      return points.slice(1).flatMap((b, i) => {
        const a = points[i],
          mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return samePoint(a, b) || openings.some((o) => onSegment(mid, o.a, o.b))
          ? []
          : [{ ...w, key: `${w.key}:${segmentKey(a, b)}`, a, b }];
      });
    });
  }
  for (const p of normalized.partitions) {
    if (!partitionEdges.has(p.id)) continue;
    const cuts = [
      p.a,
      p.b,
      ...doc.openings
        .filter((o) => o.partitionId === p.id && validOpenings.has(o.id))
        .flatMap((o) => [o.a, o.b]),
    ].sort(comparePoint);
    const unique = [...new Map(cuts.map((p) => [pointKey(p), p])).values()];
    for (let i = 1; i < unique.length; i++) {
      const a = unique[i - 1],
        b = unique[i],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (
        !doc.openings.some(
          (o) =>
            o.partitionId === p.id &&
            validOpenings.has(o.id) &&
            onSegment(mid, o.a, o.b),
        )
      )
        out.walls.push({
          key: `partition:${p.id}:${segmentKey(a, b)}`,
          deckId: p.deckId,
          a,
          b,
          source: "partition",
          anchorId: p.id,
        });
    }
  }
  const regions = new Groups();
  out.tiles.forEach((t) => regions.root(t.id));
  for (const e of out.edges)
    if (e.tileIds.length === 2 && !occupiedEdges.has(e.key))
      regions.join(e.tileIds[0], e.tileIds[1]);
  for (const r of normalized.rooms) {
    const t = out.tiles.find(
      (t) => t.deckId === r.deckId && inside(r.seed, t.vertices, false),
    );
    if (!t) {
      diagnostic(
        "room-seed",
        [r.id],
        "Place the room seed inside a floor tile, away from edges.",
      );
      continue;
    }
    const regionId = regions.root(t.id),
      members = out.tiles.filter((t) => regions.root(t.id) === regionId);
    out.rooms.push({
      id: r.id,
      regionId,
      tileIds: members.map((t) => t.id),
      area: members.reduce((a, t) => a + area2(t.vertices) / 2048, 0),
    });
    if (
      r.boundaryIds.some(
        (id) =>
          !doc.partitions.some((p) => p.id === id && p.deckId === r.deckId),
      )
    )
      diagnostic(
        "room-boundary",
        [r.id],
        "Room references a missing partition.",
      );
  }
  for (const r of out.rooms) {
    const aliases = out.rooms.filter(
      (q) => q.regionId === r.regionId && q.id < r.id,
    );
    if (aliases.length)
      diagnostic(
        "room-open-connection",
        [r.id, ...aliases.map((q) => q.id)],
        "Named areas share an unpartitioned region; labels do not make a seal.",
        "warning",
      );
  }
  for (const o of normalized.openings)
    if (validOpenings.has(o.id)) {
      const members = out.edges.filter(
        (e) =>
          partitionEdges.get(o.partitionId)?.has(e.key) &&
          (onSegment(o.a, e.a, e.b) ||
            onSegment(o.b, e.a, e.b) ||
            onSegment(e.a, o.a, o.b)),
      );
      const roots = new Set(
        members.flatMap((e) => e.tileIds.map((id) => regions.root(id))),
      );
      out.portals.push({
        id: o.id,
        kind: o.kind,
        roomIds: out.rooms
          .filter((r) => roots.has(r.regionId))
          .map((r) => r.id),
      });
    }
  const network = new Groups();
  for (const n of normalized.nodes) network.root(n.id);
  for (const r of normalized.routes) {
    const a = doc.nodes.find((n) => n.id === r.from),
      b = doc.nodes.find((n) => n.id === r.to);
    if (
      !a ||
      !b ||
      a.deckId !== r.deckId ||
      b.deckId !== r.deckId ||
      a.channel !== r.channel ||
      b.channel !== r.channel ||
      a.medium !== b.medium ||
      a.direction === "in" ||
      b.direction === "out" ||
      !samePoint(r.path[0], a.point) ||
      !samePoint(r.path.at(-1)!, b.point)
    ) {
      diagnostic(
        "route-endpoint",
        [r.id],
        "Connect compatible typed endpoints in the same deck with correct direction and medium.",
      );
      continue;
    }
    let supported = true;
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1],
        b = r.path[i];
      if (
        samePoint(a, b) ||
        !segmentSupported(
          a,
          b,
          out.tiles.filter((t) => t.deckId === r.deckId),
        )
      ) {
        diagnostic(
          "route-support",
          [r.id],
          "Every route segment must have continuous floor support.",
        );
        supported = false;
        break;
      }
      if (
        doc.partitions.some(
          (p) =>
            p.deckId === r.deckId &&
            p.seal === "design-sealed" &&
            properCross(a, b, p.a, p.b),
        )
      )
        diagnostic(
          "route-penetration",
          [r.id],
          "Pressure-wall crossing requires an approved sealed feedthrough.",
        );
    }
    if (supported) network.join(a.id, b.id);
  }
  const components = new Map<string, string[]>();
  for (const n of normalized.nodes) {
    const root = network.root(n.id),
      list = components.get(root) ?? [];
    list.push(n.id);
    components.set(root, list);
  }
  out.routeComponents = [...components.values()]
    .map((nodeIds) => ({
      channel: doc.nodes.find((n) => n.id === nodeIds[0])!.channel,
      nodeIds,
    }))
    .sort((a, b) => compareText(a.nodeIds[0], b.nodeIds[0]));
  for (const f of normalized.fittings) {
    const poly = fittingPolygon(f);
    if (
      poly.some(
        (p) =>
          !out.tiles.some(
            (t) => t.deckId === f.deckId && inside(p, t.vertices),
          ),
      ) ||
      out.walls.some(
        (w) =>
          w.deckId === f.deckId &&
          (inside(w.a, poly, false) ||
            inside(w.b, poly, false) ||
            poly.some((a, i) => properCross(a, poly[(i + 1) % 4], w.a, w.b))),
      )
    )
      diagnostic(
        "fitting-support",
        [f.id],
        "Fitting footprint is unsupported or intersects a structural wall.",
      );
    for (const other of normalized.fittings)
      if (
        other.id < f.id &&
        other.deckId === f.deckId &&
        positiveOverlap(poly, fittingPolygon(other))
      )
        diagnostic(
          "fitting-overlap",
          [f.id, other.id],
          "Fitting footprints overlap.",
        );
    diagnostic(
      "mount-unverified",
      [f.id],
      "Visual reference placement only; approved mount, mass and service definitions are not available.",
      "warning",
    );
  }
  if (doc.legacy?.unresolved.length)
    diagnostic(
      "legacy-unresolved",
      [],
      `${doc.legacy.unresolved.length} preserved visual placements require deliberate topology mapping.`,
      "warning",
    );
  diagnostic(
    "visual-adapters",
    [],
    "Enclosure and roof are draft proxies. Approved polygon floor/wall/corner Blender adapters are not yet assigned.",
    "warning",
  );
  out.walls.sort((a, b) => compareText(a.key, b.key));
  out.loops.sort(
    (a, b) =>
      compareText(a.deckId, b.deckId) || comparePoint(a.points[0], b.points[0]),
  );
  return finish();
}
export function fittingPolygon(f: LayoutDocument["fittings"][number]): Point[] {
  return (
    [[0, 0], [f.footprint[0], 0], f.footprint, [0, f.footprint[1]]] as Point[]
  ).map((p) => {
    const q = transformPoint(p, f.quarterTurns, f.reflected);
    return [q[0] + f.position[0], q[1] + f.position[1]];
  });
}
/** Exact segment support: convex clipping intervals represented as rational pairs. */
export function segmentSupported(
  a: Point,
  b: Point,
  tiles: FloorTile[],
): boolean {
  type Ratio = [number, number];
  const cmp = (a: Ratio, b: Ratio) =>
    BigInt(a[0]) * BigInt(b[1]) - BigInt(b[0]) * BigInt(a[1]);
  const intervals: { lo: Ratio; hi: Ratio }[] = [];
  for (const t of tiles) {
    let lo: Ratio = [0, 1],
      hi: Ratio = [1, 1],
      valid = true;
    for (let i = 0; i < t.vertices.length; i++) {
      const p = t.vertices[i],
        q = t.vertices[(i + 1) % t.vertices.length],
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
      const r: Ratio = delta > 0 ? [-ca, delta] : [ca, -delta];
      if (delta > 0 && cmp(r, lo) > 0) lo = r;
      if (delta < 0 && cmp(r, hi) < 0) hi = r;
      if (cmp(lo, hi) > 0) {
        valid = false;
        break;
      }
    }
    if (valid) intervals.push({ lo, hi });
  }
  intervals.sort((a, b) => Number(cmp(a.lo, b.lo)));
  let end: Ratio = [0, 1];
  for (const i of intervals) {
    if (cmp(i.lo, end) > 0) return false;
    if (cmp(i.hi, end) > 0) end = i.hi;
    if (cmp(end, [1, 1]) >= 0) return true;
  }
  return false;
}
