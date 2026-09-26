/**
 * Owner requirement: "whatever you produce, the shipyard should be able to produce."
 *
 * Every developer prefab is rebuilt from the "New ship" document using only what the
 * editor's UI calls: the plan tools' gesture functions (`tool-actions.ts`: cursor snapping,
 * the live placement gate that turns the ghost red, then the document command) and the
 * panel commands (`commands.ts`: Ship panel, Volumes list, Inspector id/height fields).
 * The rebuilt document must equal the template exactly, ids included.
 */
import { describe, expect, it } from "vitest";
import {
  BLUEPRINT_SIZE_CLASS_IDS,
  EDGE_TYPE_IDS,
  FACE_NORMALS,
  G,
  HEIGHT_CLASS_IDS,
  NORMAL_VECTOR,
  ROOM_TYPE_IDS,
  SHAPE_TILE_IDS,
  placedTileSize,
  type Pt,
  type QuarterTurn,
} from "@sidereal/content/construction-grammar";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  EMBLEM_IDS,
  SHIP_THEME_IDS,
  blankShipPrefab,
  canonicalShipPrefabJson,
  readShipPrefab,
  validateShipPrefab,
  type PrefabMount,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  addVolume,
  removeSelection,
  renameElement,
  updateMarkings,
  updateMeta,
  updateMount,
  updateVolume,
  type CommandResult,
  type PrefabSelection,
} from "./commands";
import { labelFilter, markingFilter } from "./fields";
import { SKYLIGHT_SIZES, type ToolState } from "./keymap";
import { mountExtent, mountModes } from "./snapping";
import { edgePlace, mountPlace, paintStroke, roomDrag, roomToolLabel, skylightPlace } from "./tool-actions";

type Doc = ShipPrefabDocumentV1;
const catalog = defaultPrefabComponentCatalog();

function tools(doc: Doc, patch: Partial<ToolState> = {}): ToolState {
  return {
    tool: "select",
    volume: doc.volumes[0]?.id ?? "",
    shape: "square",
    rot: 0,
    reflected: false,
    roomType: "quarters",
    roomLabel: "",
    edgeType: "door.standard",
    component: null,
    mountMode: "top",
    facing: "fore",
    skylight: [2, 2],
    symmetry: false,
    centreline: 0,
    ...patch,
  };
}

/** Apply one UI action; it must succeed and change the document. */
function act(doc: Doc, what: string, r: CommandResult | Doc): { doc: Doc; select?: PrefabSelection } {
  const res: CommandResult = "schema" in r ? { doc: r } : r;
  if (res.error) throw Error(`${what}: refused: ${res.error}`);
  if (res.doc === doc) throw Error(`${what}: no change`);
  return { doc: res.doc, select: res.select };
}

/** Inspector "Id" field. */
function rename(doc: Doc, sel: PrefabSelection | undefined, id: string, what: string): Doc {
  if (!sel || sel.kind === "tile") throw Error(`${what}: nothing selected to rename`);
  if (sel.id === id) return doc;
  return act(doc, `${what} rename to ${id}`, renameElement(doc, sel, id)).doc;
}

const outward = (m: PrefabMount, d = 0.3): Pt => {
  const [nx, ny] = NORMAL_VECTOR[m.normal!];
  return [m.at[0] + nx * d, m.at[1] + ny * d];
};

function rebuild(t: Doc): Doc {
  // Library "New ship" form: name, id, size class, theme.
  let doc = blankShipPrefab(t.id, t.name, t.sizeClass, t.theme);
  // Clear the starter hull and bridge (Inspector Delete).
  for (const r of doc.rooms) doc = act(doc, "delete starter room", removeSelection(doc, { kind: "room", id: r.id })).doc;
  for (const v of doc.volumes) doc = act(doc, "delete starter volume", removeSelection(doc, { kind: "volume", id: v.id })).doc;

  // Ship panel.
  expect(labelFilter(t.name)).toBe(t.name);
  for (const k of ["description", "faction", "role"] as const) if (doc[k] !== t[k]) doc = act(doc, `ship ${k}`, updateMeta(doc, { [k]: t[k] })).doc;
  if (doc.revision !== t.revision) doc = act(doc, "revision", updateMeta(doc, { revision: t.revision })).doc;
  expect(doc.decks).toEqual(t.decks);

  // Volumes list: + Hull / + Plate, Height class, Roof spine, Logo cassettes, Face style, Id.
  for (const v of t.volumes) {
    const added = act(doc, `add ${v.kind} volume`, addVolume(doc, v.kind === "plate" ? { kind: "plate", height: "wing" } : { kind: "hull", height: "pod" }));
    doc = added.doc;
    let id = (added.select as { id: string }).id;
    const current = () => doc.volumes.find((x) => x.id === id)!;
    if (current().height !== v.height) {
      expect(G.heightClasses[v.height].kinds, `${t.id} ${v.id} height offered for ${v.kind}`).toContain(v.kind);
      doc = act(doc, `${v.id} height`, updateVolume(doc, id, { height: v.height })).doc;
    }
    if (v.spine !== undefined) {
      expect(v.kind).toBe("hull");
      if (v.spine === false) doc = updateVolume(doc, id, { spine: true }); // checkbox on, then off
      doc = act(doc, `${v.id} spine`, updateVolume(doc, id, { spine: v.spine })).doc;
    }
    if (v.logo !== undefined) {
      expect(v.kind).toBe("hull");
      if (current().logo === undefined && v.logo === (v.height === "deck")) doc = updateVolume(doc, id, { logo: !v.logo });
      doc = act(doc, `${v.id} logo`, updateVolume(doc, id, { logo: v.logo })).doc;
    }
    if (v.faceStyle !== undefined) {
      expect(v.faceStyle, "the Face style select writes 'default' as no key").not.toBe("default");
      doc = act(doc, `${v.id} face style`, updateVolume(doc, id, { faceStyle: v.faceStyle })).doc;
    }
    doc = rename(doc, { kind: "volume", id }, v.id, `volume ${id}`);
    id = v.id;
    // Hull paint: pick shape, R / F for turn and mirror, click the cell.
    for (const [i, tile] of v.tiles.entries()) {
      const [w, h] = placedTileSize(tile);
      const tl = tools(doc, { tool: "hull", volume: id, shape: tile.shape, rot: tile.rot, reflected: tile.reflected });
      doc = act(doc, `${v.id} tile ${i}`, paintStroke(doc, tl, [[tile.x + w / 2, tile.y + h / 2]])).doc;
      expect(current().tiles[i]).toEqual(tile);
    }
  }

  // Room tool: type, label, drag from the first cell to the last.
  for (const r of t.rooms) {
    expect(roomToolLabel({ roomLabel: r.label, roomType: r.type })).toBe(r.label);
    const tl = tools(doc, { tool: "room", roomType: r.type, roomLabel: r.label });
    const res = act(doc, `room ${r.id}`, roomDrag(doc, tl, [r.rect[0] + 0.5, r.rect[1] + 0.5], [r.rect[2] - 0.5, r.rect[3] - 0.5]));
    doc = rename(res.doc, res.select, r.id, `room ${r.id}`);
  }

  // Edge tool: doors are clicked at their centre; other edges are dragged along their run.
  for (const e of t.edges) {
    const tl = tools(doc, { tool: "edge", edgeType: e.type });
    const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    const dir: Pt = [(e.b[0] - e.a[0]) / len, (e.b[1] - e.a[1]) / len];
    let res;
    if (G.edgeTypes[e.type].door) {
      const mid: Pt = [(e.a[0] + e.b[0]) / 2 + dir[0] * 0.3, (e.a[1] + e.b[1]) / 2 + dir[1] * 0.3];
      res = edgePlace(doc, catalog, tl, mid, mid);
    } else {
      const a: Pt = [e.a[0] + dir[0] * 0.1, e.a[1] + dir[1] * 0.1];
      const b: Pt = [e.b[0] - dir[0] * 0.1, e.b[1] - dir[1] * 0.1];
      res = len === 1 ? edgePlace(doc, catalog, tl, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) : edgePlace(doc, catalog, tl, a, b);
    }
    const placed = act(doc, `edge ${e.id}`, res);
    doc = rename(placed.doc, placed.select, e.id, `edge ${e.id}`);
    expect(doc.edges[doc.edges.length - 1]).toEqual(e);
  }

  // Mount tool: pick the component, hardpoint mode and facing, click the anchor.
  for (const m of t.mounts) {
    const spec = catalog.get(m.component)!;
    expect(spec, `${t.id} ${m.id} component in the palette`).toBeTruthy();
    expect(mountModes(spec), `${t.id} ${m.id} hardpoint mode offered`).toContain(m.attach);
    const facing = m.normal ?? "fore";
    const tl = tools(doc, { tool: "mount", component: m.component, mountMode: m.attach, facing });
    let p: Pt;
    if (m.attach === "top" || m.attach === "interior") {
      const [ex, ey] = mountExtent(spec, m.attach, facing);
      p = [m.at[0] + ex / 2, m.at[1] + ey / 2];
    } else p = outward(m);
    const placed = act(doc, `mount ${m.id}`, mountPlace(doc, catalog, tl, p));
    doc = rename(placed.doc, placed.select, m.id, `mount ${m.id}`);
    if (m.z !== undefined) doc = act(doc, `${m.id} bottom height`, updateMount(doc, m.id, { z: m.z })).doc;
    expect(doc.mounts[doc.mounts.length - 1]).toEqual(m);
  }

  // Skylight tool: size (R swaps), click the centre.
  for (const s of t.skylights) {
    expect(SKYLIGHT_SIZES.map((x) => x.join())).toContain(s.size.join());
    const tl = tools(doc, { tool: "skylight", skylight: [s.size[0], s.size[1]] });
    const placed = act(doc, `skylight ${s.id}`, skylightPlace(doc, catalog, tl, [s.at[0] + s.size[0] / 2, s.at[1] + s.size[1] / 2]));
    doc = rename(placed.doc, placed.select, s.id, `skylight ${s.id}`);
  }

  // Markings.
  expect(markingFilter(16)(t.markings.name)).toBe(t.markings.name);
  expect(markingFilter(10)(t.markings.number)).toBe(t.markings.number);
  doc = updateMarkings(doc, t.markings);
  return doc;
}

describe("every developer prefab is authorable with the Shipyard tools", () => {
  it("covers all twelve templates", () => {
    expect(PREFAB_SHIPS.length).toBe(12);
  });
  for (const t of PREFAB_SHIPS)
    it(`rebuilds ${t.id} exactly`, () => {
      const doc = rebuild(t);
      expect(doc).toStrictEqual(t);
      expect(canonicalShipPrefabJson(readShipPrefab(doc))).toBe(canonicalShipPrefabJson(t));
      expect(validateShipPrefab(doc, catalog).filter((i) => i.severity === "error")).toEqual([]);
    });
});

describe("every grammar construct is reachable from the tools", () => {
  const deckDoc = () => {
    let doc = blankShipPrefab("test.m.cover", "Cover", "M");
    doc = act(doc, "grow deck", paintStroke(doc, tools(doc, { tool: "hull" }), Array.from({ length: 12 * 8 }, (_, i) => [8 + (i % 12) + 0.5, Math.floor(i / 12) + 0.5] as Pt))).doc;
    return doc;
  };

  it("paints all shape tiles in every turn and mirror", () => {
    let doc = blankShipPrefab("test.m.tiles", "Tiles", "M");
    const r = addVolume(doc, { kind: "plate", height: "wing" });
    doc = r.doc;
    const id = (r.select as { id: string }).id;
    let x = 20;
    for (const shape of SHAPE_TILE_IDS)
      for (const rot of [0, 1, 2, 3] as QuarterTurn[])
        for (const reflected of [false, true]) {
          const [w, h] = placedTileSize({ shape, rot });
          const tile = { x, y: 0, shape, rot, reflected };
          doc = act(doc, `${shape} ${rot} ${reflected}`, paintStroke(doc, tools(doc, { tool: "hull", volume: id, shape, rot, reflected }), [[x + w / 2, h / 2]])).doc;
          expect(doc.volumes.find((v) => v.id === id)!.tiles.at(-1)).toEqual(tile);
          x += w + 1;
        }
    expect(SHAPE_TILE_IDS.length).toBe(12);
  });

  it("offers every height class for its kinds, spine, logo and both face styles", () => {
    let doc = blankShipPrefab("test.m.volumes", "Volumes", "M");
    for (const h of HEIGHT_CLASS_IDS)
      for (const kind of G.heightClasses[h].kinds) {
        const r = addVolume(doc, { kind, height: kind === "plate" ? "wing" : "pod" });
        const id = (r.select as { id: string }).id;
        doc = updateVolume(r.doc, id, { height: h });
        expect(doc.volumes.find((v) => v.id === id)).toMatchObject({ kind, height: h });
      }
    const hull = doc.volumes.find((v) => v.kind === "hull")!.id;
    doc = updateVolume(doc, hull, { spine: true, logo: false, faceStyle: "windows" });
    expect(doc.volumes.find((v) => v.id === hull)).toMatchObject({ spine: true, logo: false, faceStyle: "windows" });
    expect(new Set(doc.volumes.map((v) => v.kind))).toEqual(new Set(["hull", "plate"]));
  });

  it("drags a room of every type", () => {
    let doc = deckDoc();
    doc = removeSelection(doc, { kind: "room", id: "bridge" });
    ROOM_TYPE_IDS.forEach((type, i) => {
      const x = 8 + (i % 6) * 2;
      const y = Math.floor(i / 6) * 2;
      const res = act(doc, type, roomDrag(doc, tools(doc, { tool: "room", roomType: type }), [x + 0.5, y + 0.5], [x + 1.5, y + 1.5]));
      doc = res.doc;
      expect(doc.rooms.at(-1)).toMatchObject({ type, label: type.toUpperCase(), rect: [x, y, x + 2, y + 2] });
    });
  });

  it("places every edge type on a room boundary", () => {
    let doc = deckDoc();
    doc = removeSelection(doc, { kind: "room", id: "bridge" });
    for (let i = 0; i < 4; i++) doc = act(doc, `room ${i}`, roomDrag(doc, tools(doc, { tool: "room", roomType: "quarters" }), [i * 5 + 0.5, 0.5], [i * 5 + 4.5, 3.5])).doc;
    EDGE_TYPE_IDS.forEach((type, i) => {
      // Shared walls at x = 5, 10, 15; rows 0..3 give room for a 2 m door or a 1 m edge.
      const x = 5 * (1 + (i % 3));
      const y = Math.floor(i / 3) + (G.edgeTypes[type].door ? 0 : 0);
      const tl = tools(doc, { tool: "edge", edgeType: type });
      const before = doc.edges.length;
      const p: Pt = G.edgeTypes[type].door ? [x, 1.3] : [x, y + 0.5];
      if (G.edgeTypes[type].door) doc = { ...doc, edges: doc.edges.filter((e) => e.a[0] !== x) };
      const res = act(doc, type, edgePlace(doc, catalog, tl, p));
      doc = res.doc;
      expect(doc.edges.length).toBeGreaterThanOrEqual(before - 3);
      expect(doc.edges.at(-1)!.type).toBe(type);
    });
  });

  it("offers every skylight size, face normal, interior facing, theme, size class and emblem", () => {
    expect(SKYLIGHT_SIZES.map((s) => s.join("x"))).toEqual(["2x2", "2x3", "3x2", "3x3"]);
    expect(FACE_NORMALS).toHaveLength(4);
    let doc = blankShipPrefab("test.s.meta", "Meta", "S");
    for (const theme of SHIP_THEME_IDS) doc = updateMeta(doc, { theme });
    for (const sizeClass of BLUEPRINT_SIZE_CLASS_IDS) doc = updateMeta(doc, { sizeClass });
    for (const emblem of EMBLEM_IDS) doc = updateMarkings(doc, { emblem });
    expect(doc).toMatchObject({ theme: SHIP_THEME_IDS.at(-1), sizeClass: BLUEPRINT_SIZE_CLASS_IDS.at(-1), markings: { emblem: EMBLEM_IDS.at(-1) } });
  });
});
