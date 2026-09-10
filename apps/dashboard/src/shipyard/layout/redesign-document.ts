import {
  emptyLayout,
  type LayoutDocument,
} from "@sidereal/content/ship-layout";
import type { HullEnvelope } from "@sidereal/content/layout-structure";
import type { PartCatalog } from "@sidereal/content/assembly";
import { HULL_SIZE_CATALOG } from "@sidereal/content/hull-size-catalog";
import { readLayout } from "@sidereal/sim/layout-validation";
import {
  assertHullEnvelopeFits,
  setHullEnvelope,
} from "@sidereal/sim/layout-structure";
import { createWayfarerTemplateDraft } from "./wayfarer-template";

export interface RedesignProposal {
  mode: "edit" | "fork";
  document: LayoutDocument;
  removedIds: string[];
}
function freshId(id: string, original?: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    id === original
  )
    throw Error("A fresh local draft UUID is required for this redesign.");
}
function snapshotHull(doc: LayoutDocument, hull?: HullEnvelope) {
  if (hull) return structuredClone(hull);
  if (doc.structure) return structuredClone(doc.structure.hull);
  // Retain arbitrary imported floor extents rather than silently squeezing them
  // into a smaller preset. This is a design-bound snapshot, not a hull class.
  const points = doc.tiles.flatMap((t) => t.vertices),
    x = points.length ? Math.min(...points.map((p) => p[0])) : 0,
    y = points.length ? Math.min(...points.map((p) => p[1])) : 0,
    z = Math.min(...doc.decks.map((d) => d.elevation));
  return {
    id: "redesign-envelope",
    revision: "authoring-1",
    name: "Retained floorplan bounds",
    origin: [x, y, z] as [number, number, number],
    width: Math.max(
      64,
      (points.length ? Math.max(...points.map((p) => p[0])) : 64) - x,
    ),
    length: Math.max(
      64,
      (points.length ? Math.max(...points.map((p) => p[1])) : 64) - y,
    ),
    height: Math.max(32, ...doc.decks.map((d) => d.elevation + d.ceiling - z)),
  };
}
/** Empty means no inherited floor, walls, rooms, equipment or visual assembly. */
export function createBlankLayout(
  kind: LayoutDocument["kind"],
  name: string,
  hull: HullEnvelope,
  draftId: string,
  deckId: string,
): LayoutDocument {
  freshId(draftId);
  freshId(deckId);
  if (draftId === deckId)
    throw Error("Draft and deck identities must be distinct.");
  if (hull.height < 32)
    throw Error(
      "Selected hull height cannot hold the minimum 1m authoring deck.",
    );
  const d = emptyLayout(draftId, deckId, kind);
  d.name = name.trim() || "Untitled ship";
  d.decks[0].elevation = hull.origin[2];
  d.decks[0].ceiling = Math.min(96, hull.height);
  return setHullEnvelope(d, hull);
}
export function createBlankDesign(input: {
  id: string;
  deckId: string;
  hull: HullEnvelope;
  kind?: LayoutDocument["kind"];
  name?: string;
}) {
  return createBlankLayout(
    input.kind ?? "ship",
    input.name ?? "Untitled ship",
    input.hull,
    input.id,
    input.deckId,
  );
}
/** Keep authored floor shapes and IDs, never the old model's walls/equipment. */
function stripToFloorplan(
  doc: LayoutDocument,
  hull?: HullEnvelope,
): LayoutDocument {
  const next = structuredClone(doc);
  delete next.assembly;
  next.legacy = null;
  next.partitions = [];
  next.openings = [];
  next.rooms = [];
  next.fittings = [];
  next.nodes = [];
  next.routes = [];
  if (next.structure)
    next.structure = {
      ...next.structure,
      wallFaces: {},
      armor: [],
      tileStyles: {},
    };
  return setHullEnvelope(next, snapshotHull(next, hull));
}
export function floorplanOnlyCopy(
  doc: LayoutDocument,
  draftId: string,
  hull?: HullEnvelope,
): LayoutDocument {
  readLayout(doc);
  freshId(draftId, doc.id);
  const next = stripToFloorplan(doc, hull);
  next.id = draftId;
  next.source = null;
  next.name = `${doc.name.slice(0, 125)} · floorplan redesign`;
  return readLayout(next);
}
export function createWayfarerFloorplanDraft(
  template: unknown,
  draftId: string,
  hull?: HullEnvelope,
): LayoutDocument {
  const source = createWayfarerTemplateDraft(template, draftId),
    next = stripToFloorplan(source, hull ?? HULL_SIZE_CATALOG[0]);
  next.name = "Wayfarer · floorplan redesign";
  return readLayout(next);
}
function proposal(
  doc: LayoutDocument,
  next: LayoutDocument,
  removedIds: string[],
  forkId?: string,
): RedesignProposal {
  if (doc.source !== null) {
    if (!forkId)
      throw Error("A source-bound design must be forked before starting over.");
    freshId(forkId, doc.id);
    next.id = forkId;
    next.source = null;
    next.name = `${doc.name.slice(0, 135)} · redesign`;
    return { mode: "fork", document: readLayout(next), removedIds };
  }
  return { mode: "edit", document: readLayout(next), removedIds };
}
/** Same local identity/source makes this compatible with existing undo/recovery.
 * Source-bound designs deliberately require a separately preserved fork. */
export function clearLayoutProposal(
  doc: LayoutDocument,
  options: { forkId?: string; hull?: HullEnvelope } = {},
): RedesignProposal {
  readLayout(doc);
  const next = structuredClone(doc);
  const removedIds = [
    ...doc.tiles,
    ...doc.partitions,
    ...doc.openings,
    ...doc.rooms,
    ...doc.fittings,
    ...doc.nodes,
    ...doc.routes,
    ...(doc.assembly?.parts ?? []),
    ...doc.decks.flatMap((d) => d.holes),
    ...(doc.structure?.armor ?? []),
  ].map((x) => x.id);
  next.tiles = [];
  next.partitions = [];
  next.openings = [];
  next.rooms = [];
  next.fittings = [];
  next.nodes = [];
  next.routes = [];
  delete next.assembly;
  next.legacy = null;
  next.decks = next.decks.map((d) => ({ ...d, holes: [] }));
  next.structure = {
    schema: "sidereal.layout-structure.v1",
    hull: snapshotHull(doc, options.hull),
    grid: next.structure?.grid ?? 16,
    wallFaces: {},
    tileStyles: {},
    armor: [],
  };
  assertHullEnvelopeFits(next);
  return proposal(doc, next, removedIds, options.forkId);
}
/** Detach only classified retained native structure. Actual editable partitions,
 * rooms and equipment remain; unknown catalog entries reject instead of guessing. */
export function detachLegacyStructureProposal(
  doc: LayoutDocument,
  catalog: PartCatalog,
  options: { forkId?: string } = {},
): RedesignProposal {
  readLayout(doc);
  const next = structuredClone(doc),
    removedIds: string[] = [];
  if (doc.legacy?.placements.length)
    throw Error(
      "Unclassified legacy placements need a floorplan-only fork; their original bytes are preserved.",
    );
  if (next.assembly) {
    const definitions = new Map(catalog.assets.map((a) => [a.id, a]));
    next.assembly.parts = next.assembly.parts.filter((p) => {
      const asset = definitions.get(p.assetId);
      if (!asset)
        throw Error(
          "Retained object is missing from the catalog; use a floorplan-only fork instead.",
        );
      const remove = ["floor", "wall", "roof", "superstructure"].includes(
        asset.category,
      );
      if (remove) removedIds.push(p.id);
      return !remove;
    });
    const retained = new Set(next.assembly.parts.map((p) => p.assetId));
    next.assembly.revisions = Object.fromEntries(
      Object.entries(next.assembly.revisions).filter(([id]) =>
        retained.has(id),
      ),
    );
    if (!next.assembly.parts.length) delete next.assembly;
  }
  return proposal(doc, next, removedIds, options.forkId);
}
