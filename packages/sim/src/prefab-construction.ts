/**
 * Prefab ships through the existing construction authority.
 *
 * A prefab (`ShipPrefabDocumentV1`) is published by wrapping it in the ordinary
 * `ConstructionDocument`: the walking `LayoutDocument` (floors, partitions, door openings,
 * rooms) and its native floor bindings are DERIVED from the prefab, and the prefab itself
 * travels under the `prefab` key. Admission re-derives the layout and rejects any document
 * whose layout or floors differ, so the walkable deck can never drift from the grammar data.
 *
 * Frames: the prefab plan is +X fore / +Y port (metres). The layout (and ship-local game
 * frame) is x = starboard, y = fore, in integer 1/32 m units, centred on `prefabOrigin`:
 *   gx = -(py - oy) * 32,  gy = (px - ox) * 32.
 */
import {
  CONSTRUCTION_COMPILER,
  CONSTRUCTION_SCHEMA,
  type ConstructionDocument,
} from "@sidereal/content/construction";
import { G, type Pt } from "@sidereal/content/construction-grammar";
import {
  SHIP_PREFAB_SCHEMA,
  canonicalShipPrefabJson,
  deriveInterior,
  prefabOrigin,
  readShipPrefab,
  validateShipPrefab,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  LAYOUT_COMPILER,
  LAYOUT_SCHEMA,
  SHAPE_REVISION,
  type FloorTile,
  type LayoutDocument,
  type LayoutRoom,
  type Opening,
  type Partition,
  type Point,
} from "@sidereal/content/ship-layout";
import { bindConstructionLayout } from "./construction-layout";
import {
  canOccupyDeck,
  compileDeckCollision,
  resolveDeckCollision,
  sweepDeckCircle,
  type DeckCollisionFrame,
} from "./construction-collision";
import { prefabDeckObstacles } from "./prefab-deck-objects";
import { stableStringify } from "./layout-geometry";

export const PREFAB_CONSTRUCTION_REVISION = "prefab-construction-1" as const;
export const PREFAB_DECK_ID = "deck-0";
const U = 32; // layout units per metre

export interface PrefabConstructionBinding {
  schema: typeof SHIP_PREFAB_SCHEMA;
  revision: typeof PREFAB_CONSTRUCTION_REVISION;
  /** Component catalog revision the prefab was validated against. */
  catalog: string;
  document: ShipPrefabDocumentV1;
}

export type PrefabConstructionDocument = ConstructionDocument & {
  prefab: PrefabConstructionBinding;
};

export function isPrefabConstruction(
  doc: unknown,
): doc is PrefabConstructionDocument {
  return (
    !!doc &&
    typeof doc === "object" &&
    "prefab" in doc &&
    !!(doc as { prefab?: unknown }).prefab
  );
}

/** Prefab plan metres -> layout units (ship-local game frame). */
export function prefabToLayout(doc: ShipPrefabDocumentV1): (p: Pt) => Point {
  const [ox, oy] = prefabOrigin(doc);
  return ([px, py]) => {
    const gx = -(py - oy) * U;
    const gy = (px - ox) * U;
    if (!Number.isInteger(gx) || !Number.isInteger(gy))
      throw Error("Prefab geometry leaves the 1/32 m lattice");
    return [gx + 0, gy + 0];
  };
}

/** Prefab plan metres -> ship-local game metres (x starboard, y fore), for stations and actuators. */
export function prefabToShipMetres(
  doc: ShipPrefabDocumentV1,
): (p: Pt) => [number, number] {
  const [ox, oy] = prefabOrigin(doc);
  return ([px, py]) => [-(py - oy) + 0, px - ox + 0];
}

const key = (a: Point, b: Point) => {
  const [p, q] =
    a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${p[0]},${p[1]}|${q[0]},${q[1]}`;
};

/** Derive the walkable layout (single deck at launch). Pure and deterministic. */
export function prefabLayout(
  doc: ShipPrefabDocumentV1,
  catalog?: PrefabComponentCatalog,
): LayoutDocument {
  const toL = prefabToLayout(doc);
  const interior = deriveInterior(doc, 0, catalog);
  const deckId = PREFAB_DECK_ID;
  // Floors: full cells only (partial hull-edge cells stay unwalkable), merged 2x2 per room.
  const full = interior.floors.filter((f) => !f.partial);
  const roomOf = new Map(
    full.map((f) => [`${f.cell[0]},${f.cell[1]}`, f.room]),
  );
  const used = new Set<string>();
  const tiles: FloorTile[] = [];
  const tileRoom = new Map<string, string>();
  const cells = [...full].sort(
    (a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1],
  );
  const cellPoly = (x: number, y: number, w: number, h: number): Point[] => {
    const corners: Pt[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
    return corners.map(toL);
  };
  for (const f of cells) {
    const [x, y] = f.cell;
    const k = `${x},${y}`;
    if (used.has(k)) continue;
    const block = [`${x + 1},${y}`, `${x},${y + 1}`, `${x + 1},${y + 1}`];
    const big = block.every((c) => roomOf.get(c) === f.room && !used.has(c));
    const id = `floor-${x}-${y}`;
    const size = big ? 2 : 1;
    for (let a = 0; a < size; a++)
      for (let b = 0; b < size; b++) used.add(`${x + a},${y + b}`);
    tiles.push({
      id,
      deckId,
      shape: "rectangle",
      revision: SHAPE_REVISION,
      vertices: cellPoly(x, y, size, size),
      material: `prefab.${f.kind}`,
    });
    tileRoom.set(id, f.room);
  }
  // Partitions: maximal collinear runs of interior walls and door spans (between two floor tiles).
  type Seg = {
    a: Pt;
    b: Pt;
    seal: Partition["seal"];
    door?: { id: string; kind: Opening["kind"] };
  };
  const segs: Seg[] = [];
  const walkable = new Set(full.map((f) => `${f.cell[0]},${f.cell[1]}`));
  const bothSidesFloor = (a: Pt, b: Pt) => {
    const horizontal = a[1] === b[1];
    const x = Math.min(a[0], b[0]);
    const y = Math.min(a[1], b[1]);
    return horizontal
      ? walkable.has(`${x},${y}`) && walkable.has(`${x},${y - 1}`)
      : walkable.has(`${x},${y}`) && walkable.has(`${x - 1},${y}`);
  };
  for (const w of interior.partitions) {
    if (!bothSidesFloor(w.a, w.b)) continue;
    segs.push({
      a: w.a,
      b: w.b,
      seal: w.type === "wall.half" ? "open-divider" : "design-sealed",
    });
  }
  for (const d of interior.doors) {
    if (d.exterior) continue;
    const L = Math.round(Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]));
    const dir: Pt = [(d.b[0] - d.a[0]) / L, (d.b[1] - d.a[1]) / L];
    for (let u = 0; u < L; u++) {
      const a: Pt = [d.a[0] + dir[0] * u, d.a[1] + dir[1] * u];
      const b: Pt = [a[0] + dir[0], a[1] + dir[1]];
      if (bothSidesFloor(a, b))
        segs.push({
          a,
          b,
          seal: "design-sealed",
          door: {
            id: d.id,
            kind: d.type === "door.airlock" ? "airlock" : "door",
          },
        });
    }
  }
  // Group unit segments into maximal straight runs on each lattice line.
  const lines = new Map<string, Seg[]>();
  for (const s of segs) {
    const horizontal = s.a[1] === s.b[1];
    const k = horizontal ? `h${s.a[1]}` : `v${s.a[0]}`;
    if (!lines.has(k)) lines.set(k, []);
    lines.get(k)!.push(s);
  }
  const partitions: Partition[] = [];
  const openings: Opening[] = [];
  for (const [lineKey, list] of [...lines.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const horizontal = lineKey.startsWith("h");
    const along = (p: Pt) => (horizontal ? p[0] : p[1]);
    list.sort(
      (m, n) =>
        Math.min(along(m.a), along(m.b)) - Math.min(along(n.a), along(n.b)),
    );
    let run: Seg[] = [];
    const flush = () => {
      if (!run.length) return;
      const lo = Math.min(...run.map((s) => Math.min(along(s.a), along(s.b))));
      const hi = Math.max(...run.map((s) => Math.max(along(s.a), along(s.b))));
      const fixed = horizontal ? run[0].a[1] : run[0].a[0];
      const A: Pt = horizontal ? [lo, fixed] : [fixed, lo];
      const B: Pt = horizontal ? [hi, fixed] : [fixed, hi];
      const id = `partition-${lineKey}-${lo}`;
      partitions.push({ id, deckId, a: toL(A), b: toL(B), seal: run[0].seal });
      const doors = new Map<
        string,
        { kind: Opening["kind"]; lo: number; hi: number }
      >();
      for (const s of run)
        if (s.door) {
          const d = doors.get(s.door.id) ?? {
            kind: s.door.kind,
            lo: Infinity,
            hi: -Infinity,
          };
          d.lo = Math.min(d.lo, along(s.a), along(s.b));
          d.hi = Math.max(d.hi, along(s.a), along(s.b));
          doors.set(s.door.id, d);
        }
      for (const [doorId, d] of [...doors.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const a: Pt = horizontal ? [d.lo, fixed] : [fixed, d.lo];
        const b: Pt = horizontal ? [d.hi, fixed] : [fixed, d.hi];
        // Keep a 0.25 m jamb inside each end of the 2 m module: 1.5 m clear opening.
        const pa = toL(a);
        const pb = toL(b);
        const inset = (p: Point, q: Point): [Point, Point] => {
          const dx = Math.sign(q[0] - p[0]) * 8;
          const dy = Math.sign(q[1] - p[1]) * 8;
          return [
            [p[0] + dx, p[1] + dy],
            [q[0] - dx, q[1] - dy],
          ];
        };
        const [oa, ob] = inset(pa, pb);
        // Passages until prefab door leaves have game-player door state; the sealed-door
        // intent stays in the prefab document for the pressure compiler.
        void d.kind;
        openings.push({
          id: `opening-${doorId}`,
          deckId,
          partitionId: id,
          a: oa,
          b: ob,
          kind: "passage",
          clearance: 16,
          sill: 0,
        });
      }
      run = [];
    };
    for (const s of list) {
      const prev = run[run.length - 1];
      const contiguous =
        prev &&
        Math.max(along(prev.a), along(prev.b)) ===
          Math.min(along(s.a), along(s.b)) &&
        prev.seal === s.seal;
      if (!contiguous) flush();
      run.push(s);
    }
    flush();
  }
  // Rooms: explicit tile areas, seed at the first tile's centre.
  const rooms: LayoutRoom[] = [];
  for (const r of doc.rooms) {
    const own = tiles
      .filter((t) => tileRoom.get(t.id) === r.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!own.length) continue;
    const v = own[0].vertices;
    const seed: Point = [
      Math.round(v.reduce((s, p) => s + p[0], 0) / v.length),
      Math.round(v.reduce((s, p) => s + p[1], 0) / v.length),
    ];
    rooms.push({
      id: `room-${r.id}`,
      deckId,
      name: r.label,
      type: r.type,
      seed,
      boundaryIds: [],
      tileIds: own.map((t) => t.id),
      access: "crew",
      floorTheme: G.roomTypes[r.type].floor,
      wallTheme: doc.theme,
    });
  }
  return {
    schema: LAYOUT_SCHEMA,
    compiler: LAYOUT_COMPILER,
    id: `prefab.${doc.id}`,
    name: doc.name,
    kind: "ship",
    dependencies: [{ id: "floor-shapes", revision: SHAPE_REVISION }],
    source: null,
    playableDeckId: deckId,
    decks: [
      {
        id: deckId,
        name: doc.decks[0]?.name ?? "Main deck",
        order: 0,
        elevation: 0,
        ceiling: 96,
        roof: true,
        holes: [],
      },
    ],
    tiles,
    partitions,
    openings,
    rooms,
    fittings: [],
    routes: [],
    nodes: [],
    appearance: {
      primary: "#9e9c99",
      accent: "#6b0c12",
      kit: `ship-kit/${doc.theme}`,
    },
    legacy: null,
  };
}

/** Wrap a prefab for the construction reducers (save draft -> publish blueprint -> spawn). */
export function prefabConstructionDocument(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): PrefabConstructionDocument {
  const prefab = readShipPrefab(JSON.parse(canonicalShipPrefabJson(doc)));
  const errors = validateShipPrefab(prefab, catalog).filter(
    (i) => i.severity === "error",
  );
  if (errors.length)
    throw Error(
      `Prefab ${prefab.id} is invalid: ${errors.map((e) => e.code).join(", ")}`,
    );
  const layout = prefabLayout(prefab, catalog);
  const bound = bindConstructionLayout(layout);
  if (bound.unmatched.length)
    throw Error(
      `Prefab floors without a native interface: ${bound.unmatched.join(", ")}`,
    );
  return {
    ...bound.document,
    schema: CONSTRUCTION_SCHEMA,
    compiler: CONSTRUCTION_COMPILER,
    prefab: {
      schema: SHIP_PREFAB_SCHEMA,
      revision: PREFAB_CONSTRUCTION_REVISION,
      catalog: catalog.revision,
      document: prefab,
    },
  };
}

/**
 * Admission check used by `readConstructionDraft`: the prefab parses strictly, is valid
 * against the named catalog revision, and the layout/floors equal their derivation.
 */
export function verifyPrefabConstruction(
  input: ConstructionDocument & { prefab?: unknown },
  catalog: PrefabComponentCatalog,
): ShipPrefabDocumentV1 {
  const binding = input.prefab as Record<string, unknown> | undefined;
  if (!binding || typeof binding !== "object" || Array.isArray(binding))
    throw Error("Invalid prefab binding");
  const keys = Object.keys(binding).sort().join(",");
  if (
    keys !== "catalog,document,revision,schema" ||
    binding.schema !== SHIP_PREFAB_SCHEMA ||
    binding.revision !== PREFAB_CONSTRUCTION_REVISION
  )
    throw Error("Unsupported prefab binding");
  if (binding.catalog !== catalog.revision)
    throw Error("Prefab component catalog revision mismatch");
  const expected = prefabConstructionDocument(
    readShipPrefab(binding.document),
    catalog,
  );
  const layoutOk =
    stableStringify(expected.layout) === stableStringify(input.layout);
  const floorsOk =
    stableStringify(expected.floors) === stableStringify(input.floors);
  const otherKeys = Object.keys(input).filter(
    (k) =>
      ![
        "schema",
        "compiler",
        "layout",
        "floorKit",
        "floors",
        "prefab",
      ].includes(k),
  );
  if (!layoutOk || !floorsOk || otherKeys.length)
    throw Error("Prefab layout differs from its grammar derivation");
  return expected.prefab.document;
}

/**
 * Invert a spawned instance's identity map (source id -> instance id) so admission can
 * compare the instance against its grammar derivation. The map must be injective and
 * cover every remapped id; `layout.source` returns to null as in the source document.
 */
export function restorePrefabSourceIdentities(
  doc: PrefabConstructionDocument,
  identities: unknown,
): PrefabConstructionDocument {
  if (
    !identities ||
    typeof identities !== "object" ||
    Array.isArray(identities)
  )
    throw Error("Invalid prefab identity map");
  const entries = Object.entries(identities as Record<string, unknown>);
  if (entries.length > 16384) throw Error("Prefab identity map exceeds budget");
  const back = new Map<string, string>();
  for (const [source, instance] of entries) {
    if (typeof instance !== "string" || back.has(instance))
      throw Error("Prefab identity map must be injective");
    back.set(instance, source);
  }
  const src = (id: string) => {
    const v = back.get(id);
    if (v === undefined)
      throw Error("Prefab instance id without a source identity");
    return v;
  };
  const { identities: _drop, ...binding } =
    doc.prefab as PrefabConstructionBinding & { identities?: unknown };
  const layout = doc.layout;
  if (layout.source === null)
    throw Error("Prefab identity map only applies to spawned instances");
  const restored: PrefabConstructionDocument = {
    ...doc,
    prefab: binding,
    layout: {
      ...layout,
      id: src(layout.id),
      source: null,
      playableDeckId: src(layout.playableDeckId),
      decks: layout.decks.map((d) => ({
        ...d,
        id: src(d.id),
        holes: d.holes.map((h) => ({ ...h, id: src(h.id) })),
      })),
      tiles: layout.tiles.map((t) => ({
        ...t,
        id: src(t.id),
        deckId: src(t.deckId),
      })),
      partitions: layout.partitions.map((p) => ({
        ...p,
        id: src(p.id),
        deckId: src(p.deckId),
      })),
      openings: layout.openings.map((o) => ({
        ...o,
        id: src(o.id),
        deckId: src(o.deckId),
        partitionId: src(o.partitionId),
      })),
      rooms: layout.rooms.map((r) => ({
        ...r,
        id: src(r.id),
        deckId: src(r.deckId),
        boundaryIds: r.boundaryIds.map(src),
        ...(r.tileIds ? { tileIds: r.tileIds.map(src) } : {}),
      })),
    },
    floors: doc.floors.map((f) => ({
      ...f,
      id: src(f.id),
      deckId: src(f.deckId),
    })),
  };
  if (
    layout.fittings.length ||
    layout.nodes.length ||
    layout.routes.length ||
    layout.assembly ||
    layout.structure
  )
    throw Error("Prefab instances carry no fittings, routes or assemblies");
  return restored;
}

/** Walking frame of a prefab's playable deck with its furniture/module obstacles (ship-local metres). */
export function prefabWalkFrame(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
): DeckCollisionFrame {
  return resolveDeckCollision(
    compileDeckCollision(prefabLayout(doc, catalog), PREFAB_DECK_ID, {
      shipId: `prefab.${doc.id}`,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: prefabDeckObstacles(doc, catalog),
    }),
    [],
  );
}

/**
 * Walking waypoints (ship-local game metres) from `from` to `to` around walls and furniture:
 * A* over a 0.025 m lattice of positions a slightly padded body can occupy, each step checked by
 * the authoritative swept-circle test, then string-pulled so every leg is a clear straight walk.
 * Used by smoke tests and future NPC/crew routing; presentation and authority unaffected.
 */
export function prefabWalkRoute(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  from: readonly [number, number],
  to: readonly [number, number],
  radiusM = 0.3,
): [number, number][] {
  const frame = prefabWalkFrame(doc, catalog);
  const pad = radiusM + 0.002;
  const step = 0.025;
  const loc = (p: readonly [number, number]) => ({
    shipId: frame.shipId,
    deckId: frame.deckId,
    position: [p[0], p[1]] as [number, number],
  });
  const clear = (
    a: readonly [number, number],
    b: readonly [number, number],
  ) => {
    if (!canOccupyDeck(frame, loc(a), radiusM)) return false;
    const r = sweepDeckCircle(
      frame,
      loc(a),
      [b[0] - a[0], b[1] - a[1]],
      radiusM,
    );
    return Math.hypot(r.position[0] - b[0], r.position[1] - b[1]) < 1e-6;
  };
  if (!canOccupyDeck(frame, loc(from), radiusM))
    throw Error("Route start is not a standing position");
  if (!canOccupyDeck(frame, loc(to), radiusM))
    throw Error("Route goal is not a standing position");
  if (clear(from, to)) return [[to[0], to[1]]];
  const xs = frame.floors.flat().map((p) => p[0]);
  const ys = frame.floors.flat().map((p) => p[1]);
  const x0 = Math.floor(Math.min(...xs) / step) * step;
  const y0 = Math.floor(Math.min(...ys) / step) * step;
  const nx = Math.ceil((Math.max(...xs) - x0) / step) + 1;
  const ny = Math.ceil((Math.max(...ys) - y0) / step) + 1;
  const at = (i: number): [number, number] => [
    x0 + (i % nx) * step,
    y0 + Math.floor(i / nx) * step,
  ];
  const free = new Map<number, boolean>();
  const isFree = (i: number) => {
    let f = free.get(i);
    if (f === undefined) {
      f = canOccupyDeck(frame, loc(at(i)), pad);
      free.set(i, f);
    }
    return f;
  };
  const nearest = (p: readonly [number, number]) => {
    const cx = Math.round((p[0] - x0) / step);
    const cy = Math.round((p[1] - y0) / step);
    let best: number | undefined;
    let bestD = Infinity;
    for (let dy = -16; dy <= 16; dy++)
      for (let dx = -16; dx <= 16; dx++) {
        const gx = cx + dx;
        const gy = cy + dy;
        if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) continue;
        const i = gy * nx + gx;
        const d = Math.hypot(at(i)[0] - p[0], at(i)[1] - p[1]);
        if (d < bestD && isFree(i) && clear(p, at(i))) {
          best = i;
          bestD = d;
        }
      }
    if (best === undefined)
      throw Error("Route endpoint has no clear lattice node");
    return best;
  };
  const start = nearest(from);
  const goal = nearest(to);
  const g = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  // Binary min-heap on f = g + h.
  const heap: { i: number; f: number }[] = [];
  const push = (e: { i: number; f: number }) => {
    heap.push(e);
    for (let c = heap.length - 1; c > 0;) {
      const p = (c - 1) >> 1;
      if (heap[p].f <= heap[c].f) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let p = 0; ;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]];
        p = m;
      }
    }
    return top;
  };
  push({ i: start, f: 0 });
  const done = new Set<number>();
  const h = (i: number) =>
    Math.hypot(at(i)[0] - at(goal)[0], at(i)[1] - at(goal)[1]);
  while (heap.length) {
    const { i } = pop();
    if (i === goal) break;
    if (done.has(i)) continue;
    done.add(i);
    const gx = i % nx;
    const gy = Math.floor(i / nx);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const ax = gx + dx;
      const ay = gy + dy;
      if (ax < 0 || ay < 0 || ax >= nx || ay >= ny) continue;
      const j = ay * nx + ax;
      if (done.has(j) || !isFree(j)) continue;
      if (dx && dy && (!isFree(gy * nx + ax) || !isFree(ay * nx + gx)))
        continue;
      const cost = (g.get(i) ?? 0) + Math.hypot(dx, dy) * step;
      if (cost >= (g.get(j) ?? Infinity)) continue;
      g.set(j, cost);
      prev.set(j, i);
      push({ i: j, f: cost + h(j) });
    }
  }
  if (!g.has(goal)) throw Error("No walkable route between the points");
  const path: [number, number][] = [];
  for (let i: number | undefined = goal; i !== undefined; i = prev.get(i))
    path.unshift(at(i));
  path.push([to[0], to[1]]);
  // String-pull: from each anchor, jump to the furthest point still reachable in a straight line.
  const out: [number, number][] = [];
  let cur: readonly [number, number] = from;
  let k = 0;
  while (k < path.length) {
    let far = k;
    for (let j = path.length - 1; j > k; j--)
      if (clear(cur, path[j])) {
        far = j;
        break;
      }
    out.push(path[far]);
    cur = path[far];
    k = far + 1;
  }
  return out.map(([x, y]) => [
    Math.round(x * 1e6) / 1e6 + 0,
    Math.round(y * 1e6) / 1e6 + 0,
  ]);
}
