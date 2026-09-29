/**
 * What each plan tool does with a pointer gesture, as pure functions. The SVG plan calls
 * these from its pointer handlers and the authorability test calls the very same functions,
 * so "the editor can author it" is checked against the real tool path: cursor snapping,
 * the live placement gate (the red ghost) and the document command.
 */
import {
  G,
  ccw,
  type Pt,
  type ShapeTilePlacement,
} from "@sidereal/content/construction-grammar";
import {
  deckVolume,
  type PrefabComponentCatalog,
  type PrefabMount,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type { LogicFacing } from "@sidereal/content/ship-logic";
import {
  addLogicButton,
  addMount,
  addMountTile,
  addRoom,
  addSkylight,
  eraseTiles,
  paintTiles,
  placeEdge,
  checkLogicButton,
  snapLogicWallPoint,
  type CommandResult,
} from "./commands";
import { geometriesOf } from "./derive";
import type { ToolState } from "./keymap";
import {
  checkEdge,
  checkMount,
  checkMountTile,
  checkRoom,
  checkSkylight,
  edgeCells,
  mountTileCandidate,
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
export const mirrorOf = (tools: Pick<ToolState, "symmetry" | "centreline">) =>
  tools.symmetry ? tools.centreline : null;

// ------------------------------------------------------------------ hull paint and erase
/** Tiles a paint stroke through these cursor points would place (one per distinct anchor). */
export function strokeTiles(
  tools: Pick<ToolState, "shape" | "rot" | "reflected" | "bowStep" | "bowAxis">,
  points: readonly Pt[],
): ShapeTilePlacement[] {
  const seen = new Set<string>();
  const out: ShapeTilePlacement[] = [];
  for (const p of points) {
    const t = tileCandidate(p, tools.shape, tools.rot, tools.reflected);
    if (tools.bowStep !== undefined)
      t.bow = { step: tools.bowStep, axis: tools.bowAxis ?? 0 };
    const k = `${t.x},${t.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function paintStroke(
  doc: Doc,
  tools: ToolState,
  points: readonly Pt[],
): CommandResult {
  return paintTiles(
    doc,
    tools.volume,
    strokeTiles(tools, points),
    mirrorOf(tools),
  );
}

export function eraseStroke(
  doc: Doc,
  tools: ToolState,
  points: readonly Pt[],
): Doc {
  return eraseTiles(doc, tools.volume, points, mirrorOf(tools));
}

// ------------------------------------------------------------------ rooms
/** Room label the room tool writes: the typed label, else the type, in grammar characters. */
export function roomToolLabel(
  tools: Pick<ToolState, "roomLabel" | "roomType">,
): string {
  return (
    (tools.roomLabel || tools.roomType)
      .toUpperCase()
      .replace(/[^A-Z0-9 ._/'&-]/g, "")
      .slice(0, 32) || "ROOM"
  );
}

export function roomDrag(
  doc: Doc,
  tools: ToolState,
  a: Pt,
  b: Pt,
): CommandResult {
  const rect = roomRectFromDrag(a, b);
  const check = checkRoom(doc, rect, tools.roomType);
  if (!check.ok) return { doc, error: check.reason };
  return addRoom(
    doc,
    { label: roomToolLabel(tools), type: tools.roomType, rect },
    mirrorOf(tools),
  );
}

// ------------------------------------------------------------------ edges
/** Drags shorter than this count as a click on the unit edge under the cursor. */
const CLICK = 0.3;

/**
 * The lattice segment an edge gesture selects. Doors always span the 2 m module centred on
 * the lattice point nearest the release point. Other edge types take the unit edge under a
 * click, or every unit edge a straight drag passes over along the dominant axis.
 */
export function edgeGesture(
  tools: Pick<ToolState, "edgeType">,
  a: Pt,
  b: Pt = a,
): { a: [number, number]; b: [number, number] } {
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

/**
 * Canopy (exterior glass) gesture: both ends snap to the nearest deck hull outline vertices and the
 * run is ordered so it takes the shorter way counter-clockwise around the outline.
 */
export function canopyGesture(
  doc: Doc,
  a: Pt,
  b: Pt = a,
): { a: [number, number]; b: [number, number] } | null {
  const loop = deckVolume(doc)?.outline
    ? ccw(deckVolume(doc)!.outline!.outer)
    : null;
  if (!loop || loop.length < 3) return null;
  const nearest = (p: Pt) =>
    loop.reduce(
      (best, q, i) =>
        Math.hypot(q[0] - p[0], q[1] - p[1]) <
        Math.hypot(loop[best][0] - p[0], loop[best][1] - p[1])
          ? i
          : best,
      0,
    );
  let ia = nearest(a);
  let ib = nearest(b);
  if (ia === ib) ib = (ia + 1) % loop.length;
  const run = (i: number, j: number) => {
    let len = 0;
    for (let k = i; k !== j; k = (k + 1) % loop.length)
      len += Math.hypot(
        loop[(k + 1) % loop.length][0] - loop[k][0],
        loop[(k + 1) % loop.length][1] - loop[k][1],
      );
    return len;
  };
  if (run(ib, ia) < run(ia, ib)) [ia, ib] = [ib, ia];
  return { a: [loop[ia][0], loop[ia][1]], b: [loop[ib][0], loop[ib][1]] };
}

export function edgePreview(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  a: Pt,
  b?: Pt,
): EdgePreview {
  if (G.edgeTypes[tools.edgeType].exterior) {
    const seg = canopyGesture(doc, a, b);
    if (!seg)
      return {
        seg: { a: [0, 0], b: [0, 0] },
        removes: false,
        check: { ok: false, reason: "Canopy glass needs a walkable deck hull" },
      };
    const removes = doc.edges.some(
      (e) => e.type === tools.edgeType && sameEdge(e, seg),
    );
    return { seg, removes, check: { ok: true } };
  }
  const seg = edgeGesture(tools, a, b);
  const removes = doc.edges.some(
    (e) => e.type === tools.edgeType && sameEdge(e, seg),
  );
  return {
    seg,
    removes,
    check: removes
      ? { ok: true }
      : checkEdge(doc, catalog, seg.a, seg.b, tools.edgeType),
  };
}

export function edgePlace(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  a: Pt,
  b?: Pt,
): CommandResult & { label: string } {
  const { seg, removes, check } = edgePreview(doc, catalog, tools, a, b);
  const label = removes
    ? "Remove edge"
    : `Place ${G.edgeTypes[tools.edgeType].label.toLowerCase()}`;
  if (!check.ok) return { doc, error: check.reason, label };
  return {
    ...placeEdge(doc, { ...seg, type: tools.edgeType }, mirrorOf(tools)),
    label,
  };
}

// ------------------------------------------------------------------ mounts
export interface MountPreview {
  candidate: Omit<PrefabMount, "id"> | null;
  check: PlacementCheck & { mirrored?: PrefabMount };
}

export function mountPreview(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  p: Pt,
): MountPreview {
  const spec = tools.component ? catalog.get(tools.component) : undefined;
  if (!spec)
    return {
      candidate: null,
      check: { ok: false, reason: "Pick a component from the palette" },
    };
  const candidate = snapMount(
    doc,
    geometriesOf(doc),
    spec,
    tools.mountMode,
    p,
    tools.facing,
  );
  if (!candidate)
    return {
      candidate,
      check: {
        ok: false,
        reason:
          tools.mountMode === "edge"
            ? "Edge mounts need a walkable deck hull"
            : "No hull face to mount on",
      },
    };
  return {
    candidate,
    check: checkMount(
      doc,
      catalog,
      geometriesOf(doc),
      { id: "ghost", ...candidate },
      mirrorOf(tools),
    ),
  };
}

export function mountPlace(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  p: Pt,
): CommandResult {
  const { candidate, check } = mountPreview(doc, catalog, tools, p);
  if (!candidate || !check.ok) return { doc, error: check.reason };
  return addMount(doc, candidate, catalog, mirrorOf(tools));
}

// ------------------------------------------------------------------ roof mount tiles
export const toolTileKind = (tools: ToolState) => tools.tileKind ?? "fixed";
export const toolTileSize = (tools: ToolState) => tools.tileSize ?? "SM";

export function mountTilePreview(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  p: Pt,
) {
  const candidate = mountTileCandidate(
    p,
    toolTileKind(tools),
    toolTileSize(tools),
    tools.facing,
  );
  return {
    candidate,
    check: checkMountTile(doc, catalog, geometriesOf(doc), {
      id: "ghost",
      ...candidate,
    }),
  };
}

/** Mount-tile tool: click the roof to place a fixed or turret mount tile (R turns it). */
export function mountTilePlace(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  p: Pt,
): CommandResult {
  const { candidate, check } = mountTilePreview(doc, catalog, tools, p);
  if (!check.ok) return { doc, error: check.reason };
  return addMountTile(doc, candidate);
}

// ------------------------------------------------------------------ skylights
export function skylightPlace(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  tools: ToolState,
  p: Pt,
): CommandResult {
  const c = skylightCandidate(p, tools.skylight);
  const check = checkSkylight(doc, geometriesOf(doc), c.at, c.size, catalog);
  if (!check.ok) return { doc, error: check.reason };
  return addSkylight(doc, c, mirrorOf(tools));
}

// ------------------------------------------------------------------ ship logic: wall buttons
/**
 * Button tool: the wall line nearest the cursor (whole-metre lines in x or y) and the side of it
 * the cursor is on, which is the side the button faces (is pressed from).
 */
export function buttonGesture(p: Pt): {
  at: [number, number];
  normal: LogicFacing;
} {
  const dx = Math.abs(p[0] - Math.round(p[0]));
  const dy = Math.abs(p[1] - Math.round(p[1]));
  const normal: LogicFacing =
    dy <= dx
      ? p[1] >= Math.round(p[1])
        ? "port"
        : "starboard"
      : p[0] >= Math.round(p[0])
        ? "fore"
        : "aft";
  return { at: snapLogicWallPoint(p, normal), normal };
}

export function buttonPreview(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  p: Pt,
): { at: [number, number]; normal: LogicFacing; check: PlacementCheck } {
  const g = buttonGesture(p);
  return { ...g, check: checkLogicButton(doc, g.at, g.normal, catalog) };
}

export function buttonPlace(
  doc: Doc,
  catalog: PrefabComponentCatalog,
  p: Pt,
): CommandResult {
  const { at, normal, check } = buttonPreview(doc, catalog, p);
  if (!check.ok) return { doc, error: check.reason };
  return addLogicButton(doc, at, normal, catalog);
}
