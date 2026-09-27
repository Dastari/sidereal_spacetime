import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import {
  compileLayout,
  type CompiledLayout,
  type LayoutDiagnostic,
} from "@sidereal/sim/layout-compiler";
import { area2, cross, inside } from "@sidereal/sim/layout-geometry";

/** A semantic draft enclosure check, never measured pressure or native seal proof. */
export type PressurePreviewStatus =
  "enclosed-design" | "vented-design" | "incomplete";
export interface PressurePreviewArea {
  id: string;
  deckId: string;
  tileIds: string[];
  roomIds: string[];
  roomNames: string[];
  areaM2: number;
  status: PressurePreviewStatus;
  reasons: string[];
}
export interface PressurePreview {
  valid: boolean;
  areas: PressurePreviewArea[];
  assumptions: string[];
  limitations: string[];
  diagnostics: LayoutDiagnostic[];
}

const ASSUMPTIONS = [
  "Design enclosure only: this preview does not report actual gas pressure or certify native wall seals.",
  "Doors and airlocks are assumed closed; passages and open dividers allow air between areas.",
  "Requested floor, roof and solid wall coverage are assumed continuous. Room names do not seal areas.",
];
const length = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Positive length collinear overlap, including a door spanning multiple tile edges. */
function overlap(a: Point, b: Point, c: Point, d: Point): number {
  if (cross(a, b, c) !== 0 || cross(a, b, d) !== 0) return 0;
  const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
  const span = Math.abs(b[axis] - a[axis]);
  if (!span) return 0;
  const lower = Math.max(
    Math.min(a[axis], b[axis]),
    Math.min(c[axis], d[axis]),
  );
  const upper = Math.min(
    Math.max(a[axis], b[axis]),
    Math.max(c[axis], d[axis]),
  );
  return (Math.max(0, upper - lower) / span) * length(a, b);
}

/** Reuses compiler-admitted edges, rather than room labels, as the topology source.
 * Optional compiled input must be the result for this exact current document.
 * Native pressure compilation requires independent validated seals and volume
 * contracts; this deliberately does not invent those contracts for a draft. */
export function previewPressureAreas(
  doc: LayoutDocument,
  compiled: CompiledLayout = compileLayout(doc),
): PressurePreview {
  const result: PressurePreview = {
    valid: compiled.valid,
    areas: [],
    assumptions: [...ASSUMPTIONS],
    limitations: [],
    diagnostics: compiled.diagnostics.filter((d) => d.severity === "error"),
  };
  if (!compiled.valid || !compiled.tiles.length) return result;
  const boundaryTreatments =
    doc.structure?.schema === "sidereal.layout-structure.v2";
  if (boundaryTreatments) {
    result.assumptions = [
      "Boundary-treatment intent does not establish seal coverage or measured pressure. Room names remain informational.",
    ];
    result.limitations.push(
      "Boundary-treatment pressure topology requires qualified full 3D floor, roof, wall and opening adapters.",
    );
  }
  const decks = new Map(doc.decks.map((d) => [d.id, d]));
  const partitions = new Map(
    doc.decks.map((d) => [
      d.id,
      doc.partitions.filter((p) => p.deckId === d.id),
    ]),
  );
  const openings = new Map(
    doc.decks.map((d) => [d.id, doc.openings.filter((o) => o.deckId === d.id)]),
  );
  const parents = new Map(compiled.tiles.map((t) => [t.id, t.id]));
  function root(id: string): string {
    let r = id;
    while (parents.get(r) !== r) r = parents.get(r)!;
    while (id !== r) {
      const next = parents.get(id)!;
      parents.set(id, r);
      id = next;
    }
    return r;
  }
  const incompleteDecks = new Set<string>();
  // Structural authoring allows sub-grid walls through a large tile. This
  // tile-based preview must flag those instead of silently joining through them.
  for (const p of doc.partitions) {
    if (p.seal === "open-divider") continue;
    const supportedLength = compiled.edges
      .filter((e) => e.deckId === p.deckId && e.tileIds.length === 2)
      .reduce((sum, e) => sum + overlap(p.a, p.b, e.a, e.b), 0);
    if (Math.abs(supportedLength - length(p.a, p.b)) > 1e-7)
      incompleteDecks.add(p.deckId);
  }
  for (const edge of compiled.edges) {
    if (edge.tileIds.length !== 2) continue;
    const walls = (partitions.get(edge.deckId) ?? []).filter(
      (p) =>
        p.seal === "design-sealed" && overlap(edge.a, edge.b, p.a, p.b) > 0,
    );
    const covered = walls.reduce(
      (sum, p) => sum + overlap(edge.a, edge.b, p.a, p.b),
      0,
    );
    const passage = (openings.get(edge.deckId) ?? []).some(
      (o) =>
        o.kind === "passage" &&
        walls.some((p) => p.id === o.partitionId) &&
        overlap(edge.a, edge.b, o.a, o.b) > 0,
    );
    if (covered < length(edge.a, edge.b) - 1e-7 || passage) {
      const a = root(edge.tileIds[0]),
        b = root(edge.tileIds[1]);
      if (a !== b)
        parents.set(order(a, b) < 0 ? b : a, order(a, b) < 0 ? a : b);
    }
  }
  const groups = new Map<string, PressurePreviewArea>();
  const reasons = new Map<string, Set<string>>();
  for (const tile of compiled.tiles) {
    const id = root(tile.id);
    let group = groups.get(id);
    if (!group) {
      group = {
        id: `design-area:${tile.deckId}:${id}`,
        deckId: tile.deckId,
        tileIds: [],
        roomIds: [],
        roomNames: [],
        areaM2: 0,
        status: "enclosed-design",
        reasons: [],
      };
      groups.set(id, group);
      reasons.set(id, new Set());
    }
    group.tileIds.push(tile.id);
    group.areaM2 += Math.abs(area2(tile.vertices)) / 2048;
    if (!decks.get(tile.deckId)?.roof)
      reasons.get(id)!.add("Roof is not requested on this deck.");
  }
  for (const edge of compiled.edges) {
    if (edge.tileIds.length !== 1) continue;
    if (
      (openings.get(edge.deckId) ?? []).some(
        (o) => o.kind === "passage" && overlap(edge.a, edge.b, o.a, o.b) > 0,
      )
    )
      reasons
        .get(root(edge.tileIds[0]))!
        .add("An exterior passage is open to space.");
  }
  for (const room of doc.rooms) {
    const tile = compiled.tiles.find(
      (t) => t.deckId === room.deckId && inside(room.seed, t.vertices, false),
    );
    if (!tile) continue;
    const group = groups.get(root(tile.id))!;
    group.roomIds.push(room.id);
    group.roomNames.push(room.name);
  }
  for (const [id, group] of groups) {
    group.tileIds.sort(order);
    group.reasons = [...reasons.get(id)!];
    if (group.reasons.length) group.status = "vented-design";
    if (boundaryTreatments) {
      group.status = "incomplete";
      group.reasons.push(
        "Boundary treatments have not been qualified for pressure enclosure.",
      );
    }
    if (incompleteDecks.has(group.deckId)) {
      group.status = "incomplete";
      group.reasons.push(
        "A wall crosses a tile interior; sub-tile pressure regions are not yet evaluated.",
      );
    }
  }
  if (incompleteDecks.size)
    result.limitations.push(
      "Sub-tile wall divisions need finer pressure cells. Areas on those decks are incomplete.",
    );
  if (doc.decks.length > 1)
    result.limitations.push(
      "Decks are evaluated separately. This draft has no paired shaft, stair or elevator aperture data; cross-deck airflow is not evaluated.",
    );
  result.areas = [...groups.values()].sort((a, b) => order(a.id, b.id));
  return result;
}
