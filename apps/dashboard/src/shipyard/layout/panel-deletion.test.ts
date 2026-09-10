import { expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { setHullEnvelope, setWallFace } from "@sidereal/sim/layout-structure";
import {
  deleteInternalWall,
  deleteRoomLabel,
  selectedInternalWall,
} from "./panel-deletion";
import { push, undo } from "./state";

function fixture() {
  let doc = emptyLayout("draft", "deck");
  doc.tiles = [
    stampTile("left", "deck", "rectangle", [0, 0]),
    stampTile("right", "deck", "rectangle", [64, 0]),
  ];
  doc.partitions = [
    {
      id: "wall",
      deckId: "deck",
      a: [64, 0],
      b: [64, 64],
      seal: "design-sealed",
    },
  ];
  doc = setHullEnvelope(doc, {
    id: "hull",
    revision: "r1",
    name: "Hull",
    width: 128,
    length: 64,
    height: 96,
    origin: [0, 0, 0],
  });
  doc = setWallFace(doc, "wall", "left", "red");
  doc.openings = [
    {
      id: "door",
      deckId: "deck",
      partitionId: "wall",
      a: [64, 16],
      b: [64, 48],
      kind: "door",
      clearance: 16,
      sill: 0,
    },
  ];
  doc.rooms = [
    {
      id: "label",
      deckId: "deck",
      name: "Store",
      type: "Storage",
      boundaryIds: ["wall"],
      seed: [32, 32],
      access: "crew",
      floorTheme: "standard",
      wallTheme: "standard",
    },
  ];
  return doc;
}
it("resolves compiled legacy wall edges and removes only internal-wall dependents in one undoable edit", () => {
  const doc = fixture(),
    compiled = compileLayout(doc);
  const edge = compiled.walls.find((w) => w.source === "partition")!;
  expect(selectedInternalWall(doc, compiled, edge.key)?.id).toBe("wall");
  const next = deleteInternalWall(doc, "wall");
  expect(next.partitions).toEqual([]);
  expect(next.openings).toEqual([]);
  expect(next.rooms[0]?.boundaryIds).toEqual([]);
  expect(next.structure?.wallFaces).toEqual({});
  expect(next.tiles).toEqual(doc.tiles);
  expect(next.fittings).toEqual(doc.fittings);
  expect(doc.openings).toHaveLength(1);
  const history = push({ past: [], present: doc, future: [] }, next);
  expect(undo(history).present).toEqual(doc);
});
it("rejects generated exterior deletion without changing the floor plan", () => {
  const doc = fixture(),
    compiled = compileLayout(doc),
    before = JSON.stringify(doc);
  const edge = compiled.walls.find((w) => w.source === "perimeter")!;
  expect(selectedInternalWall(doc, compiled, edge.key)).toBeUndefined();
  expect(() => deleteInternalWall(doc, edge.anchorId)).toThrow(
    "Exterior walls",
  );
  expect(JSON.stringify(doc)).toBe(before);
});
it("deletes only a room label, preserving its physical walls, doors and floor finishes", () => {
  const doc = fixture(),
    next = deleteRoomLabel(doc, "label");
  expect(next.rooms).toEqual([]);
  expect({ ...next, rooms: doc.rooms }).toEqual(doc);
  expect(() => deleteRoomLabel(doc, "missing")).toThrow("Select a room label");
});
