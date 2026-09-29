/**
 * Select-tool picking on the plan: logic devices, mounts, storage fixtures, then edges, skylights,
 * rooms, tiles and volumes, respecting layer visibility. Pure; the canvas supplies the plan point.
 */
import { insideOutline, type Pt } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  fixtureSize,
  placeMount,
  placeMountTile,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
  type VolumeGeometry,
} from "@sidereal/content/ship-prefab";
import { tileIndexAt, type PrefabSelection } from "./commands";
import { logicAnchors, logicHit, type LogicAnchor } from "./logic-layout";

export interface PrefabLayers {
  hull: boolean;
  rooms: boolean;
  walls: boolean;
  mounts: boolean;
  sockets: boolean;
  /** Ship logic: buttons, door actuators, controllers and wires. */
  logic: boolean;
}
export const DEFAULT_LAYERS: PrefabLayers = {
  hull: true,
  rooms: true,
  walls: true,
  mounts: true,
  sockets: true,
  logic: true,
};

const inRect = (p: Pt, r: readonly number[], pad = 0) =>
  p[0] >= r[0] - pad &&
  p[0] <= r[2] + pad &&
  p[1] >= r[1] - pad &&
  p[1] <= r[3] + pad;

function segDistance(p: Pt, a: readonly number[], b: readonly number[]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * @param tolerance plan metres within which an edge counts as hit (the canvas passes a few pixels).
 * @param activeVolume in hull mode, tiles of this volume are picked before rooms.
 * @param logic plan anchors of the logic devices (`logicAnchors`); small markers win over mounts.
 */
export function hitTest(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  geoms: readonly VolumeGeometry[],
  p: Pt,
  layers: PrefabLayers,
  tolerance = 0.2,
  activeVolume?: string,
  logic?: ReadonlyMap<string, LogicAnchor>,
): PrefabSelection | null {
  if (layers.logic && logic) {
    const id = logicHit(logic, p, Math.min(tolerance, 0.1));
    if (id) return { kind: "logic", id };
  }
  if (layers.mounts) {
    // Smaller footprints win so a module inside a bigger one stays pickable.
    const hits = doc.mounts
      .filter((m) => m.tile === undefined)
      .map((m) => ({
        m,
        r: placeMount(m, catalog.get(m.component), geoms, doc).rect,
      }))
      .filter(({ r }) => inRect(p, r))
      .sort(
        (a, b) =>
          (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]) -
          (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]),
      );
    if (hits.length) return { kind: "mount", id: hits[0].m.id };
    // Roof mount tiles (their weapons and sensors are edited through the tile).
    for (const t of doc.mountTiles ?? [])
      if (inRect(p, placeMountTile(t, geoms).rect))
        return { kind: "mounttile", id: t.id };
  }
  if (layers.sockets)
    for (const f of doc.fixtures ?? []) {
      const [w, h] = fixtureSize(f);
      if (inRect(p, [f.at[0], f.at[1], f.at[0] + w, f.at[1] + h]))
        return { kind: "fixture", id: f.id };
    }
  if (layers.walls) {
    let best: { id: string; d: number } | null = null;
    for (const e of doc.edges) {
      const d = segDistance(p, e.a, e.b);
      if (d <= tolerance && (!best || d < best.d)) best = { id: e.id, d };
    }
    if (best) return { kind: "edge", id: best.id };
  }
  if (layers.hull)
    for (const s of doc.skylights)
      if (
        inRect(p, [s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]])
      )
        return { kind: "skylight", id: s.id };
  if (layers.hull && activeVolume) {
    const v = doc.volumes.find((x) => x.id === activeVolume);
    const i = v ? tileIndexAt(v, p[0], p[1]) : -1;
    if (v && i >= 0) return { kind: "tile", volume: v.id, index: i };
  }
  if (layers.rooms)
    for (const r of doc.rooms)
      if (inRect(p, r.rect)) return { kind: "room", id: r.id };
  if (layers.hull) {
    // Topmost volume first.
    for (const g of [...geoms].sort((a, b) => b.z[1] - a.z[1]))
      if (g.outline && insideOutline(g.outline, p[0], p[1]))
        return { kind: "volume", id: g.volume.id };
  }
  return null;
}

/** Plan-space centre of a selection or issue reference, for focusing the view. */
export function selectionCentre(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  geoms: readonly VolumeGeometry[],
  sel: PrefabSelection,
): Pt | null {
  switch (sel.kind) {
    case "logic":
      return (
        logicAnchors(
          doc,
          catalog,
          deriveInterior(doc, 0, catalog).doors,
          geoms,
        ).get(sel.id)?.at ?? null
      );
    case "volume": {
      const g = geoms.find((x) => x.volume.id === sel.id);
      return g
        ? [(g.bounds[0] + g.bounds[2]) / 2, (g.bounds[1] + g.bounds[3]) / 2]
        : null;
    }
    case "tile": {
      const t = doc.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
      return t ? [t.x + 0.5, t.y + 0.5] : null;
    }
    case "room": {
      const r = doc.rooms.find((x) => x.id === sel.id);
      return r
        ? [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2]
        : null;
    }
    case "edge": {
      const e = doc.edges.find((x) => x.id === sel.id);
      return e ? [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2] : null;
    }
    case "mount": {
      const m = doc.mounts.find((x) => x.id === sel.id);
      if (!m) return null;
      const r = placeMount(m, catalog.get(m.component), geoms, doc).rect;
      return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    }
    case "mounttile": {
      const t = doc.mountTiles?.find((x) => x.id === sel.id);
      return t ? placeMountTile(t, geoms).centre : null;
    }
    case "skylight": {
      const s = doc.skylights.find((x) => x.id === sel.id);
      return s ? [s.at[0] + s.size[0] / 2, s.at[1] + s.size[1] / 2] : null;
    }
    case "fixture": {
      const f = doc.fixtures?.find((x) => x.id === sel.id);
      if (!f) return null;
      const [w, h] = fixtureSize(f);
      return [f.at[0] + w / 2, f.at[1] + h / 2];
    }
  }
}
