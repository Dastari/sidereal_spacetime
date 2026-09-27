import { describe, expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { readLayout } from "@sidereal/sim/layout-validation";
import { inside } from "@sidereal/sim/layout-geometry";
import { createRoomFromTiles } from "./room-tiles";
import { deleteLayoutSelection } from "./selection-deletion";
import {
  DEFAULT_VIEW,
  push,
  readCheckpoint,
  transformTiles,
  undo,
} from "./state";

function fixture() {
  const doc = emptyLayout("ship", "deck");
  doc.tiles = [
    stampTile("square", "deck", "rectangle", [0, 0]),
    stampTile("triangle", "deck", "triangle", [128, 0], 0, true),
  ];
  return doc;
}
describe("rooms selected from structural floor tiles", () => {
  it("labels exactly the selected tiles without inventing a sealed room, and preserves membership through recovery and undo", () => {
    const original = fixture();
    const next = createRoomFromTiles(
      original,
      "deck",
      ["triangle"],
      "room",
      "  Bridge  ",
      "Bridge",
    );
    expect(next.rooms[0].tileIds).toEqual(["triangle"]);
    expect(next.rooms[0].name).toBe("Bridge");
    expect(inside(next.rooms[0].seed, next.tiles[1].vertices, false)).toBe(
      true,
    );
    const compiled = compileLayout(next);
    expect(compiled.rooms[0].tileIds).toEqual(["triangle"]);
    expect(compiled.rooms[0].area).toBe(2);
    expect(next.partitions).toEqual([]);
    expect(next.rooms[0].boundaryIds).toEqual([]);
    expect(original.rooms).toEqual([]);
    const history = push({ past: [], present: original, future: [] }, next);
    const recovery = readCheckpoint(
      JSON.stringify({
        schema: "sidereal.layout-recovery.v1",
        sequence: 1,
        writer: "test",
        history,
        view: DEFAULT_VIEW,
      }),
    );
    expect(recovery.history.present.rooms).toEqual(next.rooms);
    expect(undo(recovery.history).present).toEqual(original);
  });
  it("keeps legacy seed-based rooms working and canonicalizes explicit selection ordering", () => {
    const doc = createRoomFromTiles(
      fixture(),
      "deck",
      ["square", "triangle"],
      "room",
      "Room",
      "Custom",
    );
    const result = compileLayout(doc);
    expect(result.rooms[0].tileIds).toEqual(["square", "triangle"]);
    doc.rooms[0].tileIds!.reverse();
    expect(compileLayout(doc).fingerprint).toBe(result.fingerprint);
    delete doc.rooms[0].tileIds;
    expect(compileLayout(doc).rooms[0].tileIds).toEqual(["square", "triangle"]);
  });
  it("rejects malformed membership, missing or foreign tiles, and seeds outside their assigned room", () => {
    const doc = createRoomFromTiles(
      fixture(),
      "deck",
      ["square"],
      "room",
      "Room",
      "Custom",
    );
    for (const tileIds of [[], ["square", "square"], [42]]) {
      expect(() =>
        readLayout({ ...doc, rooms: [{ ...doc.rooms[0], tileIds }] }),
      ).toThrow("Invalid room");
    }
    const missing = structuredClone(doc);
    missing.rooms[0].tileIds = ["missing"];
    expect(compileLayout(missing).diagnostics.map((d) => d.code)).toContain(
      "room-tiles",
    );
    doc.rooms[0].seed = [110, 10];
    expect(compileLayout(doc).diagnostics.map((d) => d.code)).toContain(
      "room-seed",
    );
    expect(() =>
      createRoomFromTiles(fixture(), "deck", [], "room", "Room", "Custom"),
    ).toThrow("Select floor");
  });
  it("updates room labels after tile movement and shrinks or removes room membership during explicit deletion", () => {
    const doc = createRoomFromTiles(
      fixture(),
      "deck",
      ["square", "triangle"],
      "room",
      "Room",
      "Custom",
    );
    const moved = transformTiles(doc, ["square", "triangle"], "move", [128, 0]);
    expect(compileLayout(moved).diagnostics.map((d) => d.code)).not.toContain(
      "room-seed",
    );
    const one = deleteLayoutSelection(moved, compileLayout(moved), ["square"]);
    expect(one.rooms[0].tileIds).toEqual(["triangle"]);
    expect(compileLayout(one).rooms[0].area).toBe(2);
    expect(
      deleteLayoutSelection(one, compileLayout(one), ["triangle"]).rooms,
    ).toEqual([]);
  });
});
