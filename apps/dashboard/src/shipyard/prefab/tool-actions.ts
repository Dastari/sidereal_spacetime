/**
 * What each plan tool does with a pointer gesture, as pure functions. The SVG plan calls
 * these from its pointer handlers and the authorability test calls the very same functions,
 * so "the editor can author it" is checked against the real tool path: cursor snapping,
 * the live placement gate (the red ghost) and the document command.
 */
import { G, type Pt, type ShapeTilePlacement } from "@sidereal/content/construction-grammar";
import type { PrefabComponentCatalog, PrefabMount, ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { addMount, addRoom, addSkylight, eraseTiles, paintTiles, placeEdge, type CommandResult } from "./commands";
import { geometriesOf } from "./derive";
import type { ToolState } from "./keymap";
import {
  checkEdge,
  checkMount,
  checkRoom,
  checkSkylight,
  edgeCells,
  roomRectFromDrag,
  skylightCandidate,
  snapEdge,
  snapMount,
  tileCandidate,
  type PlacementCheck,
} from "./snapping";
import { sameEdge } from "./symmetry";

type Doc = ShipPrefabDocumentV1;

/** Symmetry centreline when symmetry is on. */
export const mirrorOf = (tools: Pick<ToolState, "symmetry" | "centreline">) => (tools.symmetry ? tools.centreline : null);

// ------------------------------------------------------------------ hull paint and erase
/** Tiles a paint stroke through these cursor points would place (one per distinct anchor). */
export function strokeTiles(tools: Pick<ToolState, "shape" | "rot" | "reflected">, points: readonly Pt[]): ShapeTilePlacement[] {
  const seen = new Set<string>();
  const out: ShapeTilePlacement[] = [];
  for (const p of points) {
    const t = tileCandidate(p, tools.shape, tools.rot, tools.reflected);
    const k = `${t.x},${t.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function paintStroke(doc: Doc, tools: ToolState, points: readonly Pt[]): CommandResult {
  return paintTiles(doc, tools.volume, strokeTiles(tools, points), mirrorOf(tools));
}

export function eraseStroke(doc: Doc, tools: ToolState, points: readonly Pt[]): Doc {
  return eraseTiles(doc, tools.volume, points, mirrorOf(tools));
}

// ------------------------------------------------------------------ rooms
/** Room label the room tool writes: the typed label, else the type, in grammar characters. */
export function roomToolLabel(tools: Pick<ToolState, "roomLabel" | "roomType">): string {
  return (tools.roomLabel || tools.roomType).toUpperCase().replace(/[^A-Z0-9 ._/'&-]/g, "").slice(0, 32) || "ROOM";
}

export function roomDrag(doc: Doc, tools: ToolState, a: Pt, b: Pt): CommandResult {
  const rect = roomRectFromDrag(a, b);
  const check = checkRoom(doc, rect, tools.roomType);
  if (!check.ok) return { doc, error: check.reason };
  return addRoom(doc, { label: roomToolLabel(tools), type: tools.roomType, rect }, mirrorOf(tools));
}

// ------------------------------------------------------------------ edges
/** Drags shorter than this count as a click on the unit edge under the cursor. */
const CLICK = 0.3;

/**
 * The lattice segment an edge gesture selects. Doors always span the 2 m module centred on
 * the lattice point nearest the release point. Other edge types take the unit edge under a
 * click, or every unit edge a straight drag passes over along the dominant axis.
 */
export function edgeGesture(tools: Pick<ToolState, "edgeType">, a: Pt, b: Pt = a): { a: [number, number]; b: [number, number] } {
  if (edgeCells(tools.edgeType) === 2) return snapEdge(b, 2);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (Math.hypot(dx, dy) < CLICK) return snapEdge(a, 1);
  if (Math.abs(dx) >= Math.abs(dy)) {
    const y = Math.round(a[1]);
    const x0 = Math.floor(Math.min(a[0], b[0]));
    const x1 = Math.max(x0 + 1, Math.ceil(Math.max(a[0], b[0])));
    return { a: [x0, y], b: [x1, y] };
  }
  const x = Math.round(a[0]);
  const y0 = Math.floor(Math.min(a[1], b[1]));
  const y1 = Math.max(y0 + 1, Math.ceil(Math.max(a[1], b[1])));
  return { a: [x, y0], b: [x, y1] };
}

export interface EdgePreview {
  seg: { a: [number, number]; b: [number, number] };
  /** The same edge and type already exists: the gesture removes it. */
  removes: boolean;
  check: PlacementCheck;
}

export function edgePreview(doc: Doc, catalog: PrefabComponentCatalog, tools: ToolState, a: Pt, b?: Pt): EdgePreview {
  const seg = edgeGesture(tools, a, b);
  const removes = doc.edges.some((e) => e.type === tools.edgeType && sameEdge(e, seg));
  return { seg, removes, check: removes ? { ok: true } : checkEdge(doc, catalog, seg.a, seg.b, tools.edgeType) };
}

export function edgePlace(doc: Doc, catalog: PrefabComponentCatalog, tools: ToolState, a: Pt, b?: Pt): CommandResult & { label: string } {
  const { seg, removes, check } = edgePreview(doc, catalog, tools, a, b);
  const label = removes ? "Remove edge" : `Place ${G.edgeTypes[tools.edgeType].label.toLowerCase()}`;
  if (!check.ok) return { doc, error: check.reason, label };
  return { ...placeEdge(doc, { ...seg, type: tools.edgeType }, mirrorOf(tools)), label };
}

// ------------------------------------------------------------------ mounts
export interface MountPreview {
  candidate: Omit<PrefabMount, "id"> | null;
  check: PlacementCheck & { mirrored?: PrefabMount };
}

export function mountPreview(doc: Doc, catalog: PrefabComponentCatalog, tools: ToolState, p: Pt): MountPreview {
  const spec = tools.component ? catalog.get(tools.component) : undefined;
  if (!spec) return { candidate: null, check: { ok: false, reason: "Pick a component from the palette" } };
  const candidate = snapMount(doc, geometriesOf(doc), spec, tools.mountMode, p, tools.facing);
  if (!candidate)
    return { candidate, check: { ok: false, reason: tools.mountMode === "edge" ? "Edge mounts need a walkable deck hull" : "No hull face to mount on" } };
  return { candidate, check: checkMount(doc, catalog, geometriesOf(doc), { id: "ghost", ...candidate }, mirrorOf(tools)) };
}

export function mountPlace(doc: Doc, catalog: PrefabComponentCatalog, tools: ToolState, p: Pt): CommandResult {
  const { candidate, check } = mountPreview(doc, catalog, tools, p);
  if (!candidate || !check.ok) return { doc, error: check.reason };
  return addMount(doc, candidate, catalog, mirrorOf(tools));
}

// ------------------------------------------------------------------ skylights
export function skylightPlace(doc: Doc, catalog: PrefabComponentCatalog, tools: ToolState, p: Pt): CommandResult {
  const c = skylightCandidate(p, tools.skylight);
  const check = checkSkylight(doc, geometriesOf(doc), c.at, c.size, catalog);
  if (!check.ok) return { doc, error: check.reason };
  return addSkylight(doc, c, mirrorOf(tools));
}
