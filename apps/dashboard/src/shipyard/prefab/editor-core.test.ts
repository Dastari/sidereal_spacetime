import { describe, expect, it } from "vitest";
import { placedTilePolygon, type ShapeTilePlacement } from "@sidereal/content/construction-grammar";
import { PREFAB_SHIPS, prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { blankShipPrefab, readShipPrefab, volumeGeometry, type ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { applyCommand, createHistory, HISTORY_LIMIT, redo, undo, undoLabel } from "./history";
import {
  addMount,
  addRoom,
  addSkylight,
  eraseTiles,
  nudgeSelection,
  paintTiles,
  placeEdge,
  removeSelection,
  rotateSelection,
  uniqueId,
  updateMeta,
} from "./commands";
import { defaultCentreline, mirrorEdge, mirrorMount, mirrorRoom, mirrorSkylight, mirrorTile } from "./symmetry";
import { checkEdge, checkMount, checkRoom, checkTile, mountModes, roomRectFromDrag, snapEdge, snapMount, tileCandidate } from "./snapping";
import { hitTest, DEFAULT_LAYERS } from "./hit-test";

const catalog = defaultPrefabComponentCatalog();
const crest = () => structuredClone(prefabById("fed.m.crest")!) as ShipPrefabDocumentV1;
const blank = () => blankShipPrefab("test.s.blank", "Blank", "S");
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const polyKey = (t: ShapeTilePlacement) =>
  placedTilePolygon(t)
    .map(([x, y]) => `${r6(x)},${r6(y)}`)
    .sort()
    .join(" ");

describe("history", () => {
  it("records immutable transitions and undoes/redoes them", () => {
    let h = createHistory(blank());
    const first = h.present;
    h = applyCommand(h, "Rename", updateMeta(h.present, { name: "Renamed" }));
    h = applyCommand(h, "Role", updateMeta(h.present, { role: "Courier" }));
    expect(undoLabel(h)).toBe("Role");
    h = undo(h);
    expect(h.present.role).toBe("");
    expect(h.present.name).toBe("Renamed");
    h = undo(h);
    expect(h.present).toBe(first);
    expect(first.name).toBe("Blank");
    h = redo(redo(h));
    expect(h.present.role).toBe("Courier");
  });
  it("ignores no-op commands and clears redo on a new edit", () => {
    let h = createHistory(blank());
    h = applyCommand(h, "Same", updateMeta(h.present, { name: "Blank" }));
    expect(h.past).toHaveLength(0);
    h = applyCommand(h, "A", updateMeta(h.present, { role: "A" }));
    h = undo(h);
    h = applyCommand(h, "B", updateMeta(h.present, { role: "B" }));
    expect(h.future).toHaveLength(0);
  });
  it("keeps at least 100 steps", () => {
    let h = createHistory(blank());
    for (let i = 0; i < 150; i++) h = applyCommand(h, `r${i}`, updateMeta(h.present, { revision: i + 2 }));
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
    for (let i = 0; i < 150; i++) h = undo(h);
    expect(h.present.revision).toBe(1);
  });
});

describe("commands", () => {
  it("rejects overlapping hull tiles and keeps the document admissible", () => {
    const doc = blank();
    const over = paintTiles(doc, "hull", [{ x: 0, y: 0, shape: "square", rot: 0, reflected: false }]);
    expect(over.doc).toBe(doc);
    expect(over.error).toMatch(/Overlaps/);
    const added = paintTiles(doc, "hull", [{ x: 8, y: 0, shape: "slope1", rot: 0, reflected: false }]);
    expect(added.doc.volumes[0].tiles).toHaveLength(33);
    expect(() => readShipPrefab(added.doc)).not.toThrow();
    const erased = eraseTiles(added.doc, "hull", [[8.2, 0.2]]);
    expect(erased.volumes[0].tiles).toHaveLength(32);
  });
  it("creates unique grammar ids", () => {
    expect(uniqueId(["room", "room-2"], "Room")).toBe("room-3");
    expect(uniqueId([], "  Bridge deck!")).toBe("bridge-deck-");
    expect(uniqueId([], "---")).toBe("item");
  });
  it("adds rooms, refuses overlaps, nudges and deletes", () => {
    const doc = blank();
    const clash = addRoom(doc, { label: "HOLD", type: "cargo", rect: [5, 0, 7, 2] });
    expect(clash.error).toMatch(/Overlaps room/);
    const ok = addRoom(doc, { label: "HOLD", type: "cargo", rect: [0, 0, 4, 4] });
    expect(ok.doc.rooms.map((r) => r.id)).toEqual(["bridge", "hold"]);
    const blocked = nudgeSelection(ok.doc, { kind: "room", id: "hold" }, 1, 0);
    expect(blocked.error).toMatch(/overlap/);
    const removed = removeSelection(ok.doc, { kind: "room", id: "hold" });
    expect(removed.rooms).toHaveLength(1);
  });
  it("places edges, replaces overlaps and toggles the same edge off", () => {
    const doc = addRoom(blank(), { label: "HOLD", type: "cargo", rect: [0, 0, 4, 4] }).doc;
    const door = placeEdge(doc, { a: [4, 1], b: [4, 3], type: "door.standard" });
    expect(door.doc.edges).toHaveLength(1);
    const glazed = placeEdge(door.doc, { a: [4, 2], b: [4, 3], type: "wall.glazed" });
    expect(glazed.doc.edges.map((e) => e.type)).toEqual(["wall.glazed"]);
    const toggled = placeEdge(glazed.doc, { a: [4, 2], b: [4, 3], type: "wall.glazed" });
    expect(toggled.doc.edges).toHaveLength(0);
  });
  it("rotates interior module facing and refuses face mounts", () => {
    const doc = crest();
    const helm = doc.mounts.find((m) => m.attach === "interior")!;
    const turned = rotateSelection(doc, { kind: "mount", id: helm.id });
    expect(turned.doc.mounts.find((m) => m.id === helm.id)!.normal).not.toBe(helm.normal);
    const face = doc.mounts.find((m) => m.attach === "face")!;
    expect(rotateSelection(doc, { kind: "mount", id: face.id }).error).toBeTruthy();
  });
});

describe("symmetry", () => {
  it("defaults the centreline to the hull's middle", () => {
    expect(defaultCentreline(crest())).toBe(5);
    expect(defaultCentreline(blank())).toBe(2);
  });
  it("mirrors every shape tile to the reflected polygon", () => {
    for (const shape of ["square", "slope1", "slope2", "slope3", "slope4", "arc2", "arc3c"] as const)
      for (const rot of [0, 1, 2, 3] as const)
        for (const reflected of [false, true]) {
          const t: ShapeTilePlacement = { x: 3, y: 1, shape, rot, reflected };
          const m = mirrorTile(t, 5);
          const want = placedTilePolygon(t)
            .map(([x, y]) => `${r6(x)},${r6(10 - y)}`)
            .sort()
            .join(" ");
          expect(polyKey(m)).toBe(want);
          expect(mirrorTile(m, 5)).toMatchObject({ x: t.x, y: t.y });
        }
  });
  it("mirrors rooms, edges, skylights and mounts across y = c", () => {
    expect(mirrorRoom({ rect: [4, 0, 9, 4] }, 5).rect).toEqual([4, 6, 9, 10]);
    expect(mirrorEdge({ a: [4, 2], b: [6, 2] }, 5)).toEqual({ a: [4, 8], b: [6, 8] });
    expect(mirrorSkylight({ id: "s", at: [7, 2], size: [2, 3] }, 3).at).toEqual([7, 1]);
    const spec = catalog.get("ion-drive.md")!;
    expect(mirrorMount({ id: "e", component: spec.id, attach: "face", normal: "aft", at: [0, 1.5] }, spec, 3)).toMatchObject({ at: [0, 4.5], normal: "aft" });
    expect(mirrorMount({ id: "g", component: "side-cannon.sm", attach: "face", normal: "port", at: [6.5, 6] }, catalog.get("side-cannon.sm"), 3)).toMatchObject({
      at: [6.5, 0],
      normal: "starboard",
    });
    const bunk = catalog.get("crew-bunk.sm")!;
    const m = mirrorMount({ id: "b", component: bunk.id, attach: "interior", normal: "port", at: [3.5, 4] }, bunk, 3);
    expect(m.normal).toBe("starboard");
    // 2x1 bunk facing port/starboard is 1 m along Y: row [4, 5] mirrors to [1, 2].
    expect(m.at).toEqual([3.5, 1]);
  });
  it("paints and erases symmetric tile pairs, once on the centreline", () => {
    const doc = blank();
    const pair = paintTiles(doc, "hull", [{ x: 2, y: 4, shape: "slope1", rot: 0, reflected: false }], 2);
    expect(pair.doc.volumes[0].tiles).toHaveLength(34);
    const mirrored = pair.doc.volumes[0].tiles[33];
    expect(mirrored.y).toBe(-1);
    const erased = eraseTiles(pair.doc, "hull", [[2.2, 4.2]], 2);
    expect(erased.volumes[0].tiles).toHaveLength(32);
    const onLine = paintTiles(blankShipPrefab("x", "X", "S"), "hull", [{ x: 9, y: 1, shape: "square", rot: 0, reflected: false }], 1.5);
    expect(onLine.doc.volumes[0].tiles).toHaveLength(33);
  });
  it("adds mirrored rooms, edges, mounts and skylights", () => {
    const doc = blank();
    expect(addRoom(doc, { label: "PORT", type: "quarters", rect: [0, 2, 4, 4] }, 2).doc.rooms.map((r) => r.rect)).toEqual([
      [4, 0, 8, 4],
      [0, 2, 4, 4],
      [0, 0, 4, 2],
    ]);
    expect(placeEdge(doc, { a: [1, 3], b: [1, 4], type: "wall.half" }, 2).doc.edges).toHaveLength(2);
    expect(addMount(doc, { component: "radiator.sm", attach: "top", at: [1, 3] }, catalog, 2).doc.mounts.map((m) => m.at)).toEqual([
      [1, 3],
      [1, 0],
    ]);
    expect(addSkylight(doc, { at: [1, 0], size: [2, 2] }, 2).doc.skylights).toHaveLength(2);
    expect(addSkylight(doc, { at: [1, 1], size: [2, 2] }, 2).doc.skylights).toHaveLength(1);
  });
});

describe("snapping", () => {
  it("snaps the cursor to the nearest lattice edge; doors take two cells", () => {
    expect(snapEdge([3.4, 2.1], 1)).toEqual({ a: [3, 2], b: [4, 2] });
    expect(snapEdge([2.95, 5.6], 1)).toEqual({ a: [3, 5], b: [3, 6] });
    expect(snapEdge([3.4, 2.1], 2)).toEqual({ a: [2, 2], b: [4, 2] });
    expect(snapEdge([7.1, 3.2], 2)).toEqual({ a: [7, 2], b: [7, 4] });
  });
  it("builds room rectangles from any drag direction", () => {
    expect(roomRectFromDrag([5.5, 3.2], [1.1, 0.4])).toEqual([1, 0, 6, 4]);
  });
  it("centres tiles on the cursor", () => {
    expect(tileCandidate([5.4, 2.6], "square", 0, false)).toMatchObject({ x: 5, y: 2 });
    expect(tileCandidate([5.4, 2.6], "slope2", 1, false)).toMatchObject({ x: 5, y: 2 });
  });
  it("checks edges with the validator's placement rules", () => {
    const doc = crest();
    expect(checkEdge(doc, catalog, [9, 4], [11, 4], "door.standard").ok).toBe(true);
    expect(checkEdge(doc, catalog, [9, 0], [11, 0], "door.standard").reason).toMatch(/edge mounts/);
    expect(checkEdge(doc, catalog, [30, 4], [32, 4], "door.standard").ok).toBe(false);
  });
  it("snaps face mounts to the nearest hull face with its outward normal", () => {
    const doc = crest();
    const geoms = doc.volumes.map(volumeGeometry);
    const drive = catalog.get("ion-drive.md")!;
    const aft = snapMount(doc, geoms, drive, "face", [-0.6, 7.2]);
    expect(aft).toMatchObject({ attach: "face", normal: "aft", at: [0, 7] });
    const cannon = catalog.get("side-cannon.sm")!;
    const port = snapMount(doc, geoms, cannon, "face", [15.3, 13.4]);
    expect(port?.normal).toBe("port");
    expect(port?.at[0]).toBe(15.5);
  });
  it("snaps top mounts to the 0.5 m roof grid and edge mounts to whole wall cells", () => {
    const doc = crest();
    const geoms = doc.volumes.map(volumeGeometry);
    const turret = catalog.get("autocannon.md")!;
    expect(snapMount(doc, geoms, turret, "top", [10.3, 5.2])?.at).toEqual([9.5, 4]);
    const lock = catalog.get("airlock.exterior.md")!;
    const edge = snapMount(doc, geoms, lock, "edge", [14.3, -0.2]);
    expect(edge).toMatchObject({ attach: "edge", normal: "starboard" });
    expect(Number.isInteger(edge!.at[0] - 1)).toBe(true);
  });
  it("turns interior modules by facing", () => {
    const doc = crest();
    const geoms = doc.volumes.map(volumeGeometry);
    const bunk = catalog.get("crew-bunk.sm")!;
    expect(mountModes(bunk)).toEqual(["interior"]);
    const fore = snapMount(doc, geoms, bunk, "interior", [6, 8], "fore");
    const port = snapMount(doc, geoms, bunk, "interior", [6, 8], "port");
    expect(fore?.at).toEqual([5.5, 7]);
    expect(port?.at).toEqual([5, 7.5]);
  });
  it("reports green and red mount ghosts from validateMount", () => {
    const doc = crest();
    const geoms = doc.volumes.map(volumeGeometry);
    const good = checkMount(doc, catalog, geoms, { id: "t", component: "sensor-dish.sm", attach: "top", at: [10, 5] });
    expect(good.ok).toBe(true);
    const off = checkMount(doc, catalog, geoms, { id: "t", component: "sensor-dish.sm", attach: "top", at: [40, 5] });
    expect(off).toMatchObject({ ok: false });
    expect(off.reason).toMatch(/leaves the hull roof/);
    const tooBig = checkMount(doc, catalog, geoms, { id: "x", component: "ion-drive.xl", attach: "face", normal: "aft", at: [0, 5] });
    expect(tooBig.reason).toMatch(/size-M blueprint/);
  });
  it("checks rooms and tiles", () => {
    const doc = crest();
    expect(checkRoom(doc, [0, 0, 2, 2], "cargo").reason).toMatch(/Overlaps room/);
    expect(checkRoom(doc, [40, 0, 42, 2], "cargo").reason).toMatch(/Outside/);
    expect(checkTile(doc, "hull", { x: 1, y: 1, shape: "square", rot: 0, reflected: false }).ok).toBe(false);
    expect(checkTile(doc, "hull", { x: 30, y: 1, shape: "square", rot: 0, reflected: false }).ok).toBe(true);
  });
});

describe("hit testing", () => {
  it("picks mounts before rooms and volumes", () => {
    const doc = crest();
    const geoms = doc.volumes.map(volumeGeometry);
    const top = doc.mounts.find((m) => m.attach === "top")!;
    const p: [number, number] = [top.at[0] + 0.25, top.at[1] + 0.25];
    expect(hitTest(doc, catalog, geoms, p, DEFAULT_LAYERS)).toEqual({ kind: "mount", id: top.id });
    expect(hitTest(doc, catalog, geoms, p, { ...DEFAULT_LAYERS, mounts: false })?.kind).not.toBe("mount");
    expect(hitTest(doc, catalog, geoms, [100, 100], DEFAULT_LAYERS)).toBeNull();
  });
});

describe("developer prefabs", () => {
  it("every prefab is admissible editor data", () => {
    for (const p of PREFAB_SHIPS) expect(() => readShipPrefab(structuredClone(p))).not.toThrow();
  });
});
