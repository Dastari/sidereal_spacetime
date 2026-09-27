import { describe, expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { PART_CATEGORIES, type PartCatalog } from "@sidereal/content/assembly";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { deleteLayoutSelection } from "./selection-deletion";
import { systemsFootprints } from "./systems-footprints";
import { push, undo } from "./state";
import { createDoorway250ReviewLayout } from "@sidereal/content/doorway250-review-layout";
function fixture() {
  const doc = emptyLayout("draft", "deck");
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
  doc.openings = [
    {
      id: "door",
      deckId: "deck",
      partitionId: "wall",
      a: [64, 16],
      b: [64, 48],
      kind: "door",
      clearance: 32,
      sill: 0,
    },
  ];
  doc.rooms = [
    {
      id: "room",
      deckId: "deck",
      name: "Room",
      type: "Storage",
      seed: [32, 32],
      boundaryIds: ["wall"],
      access: "crew",
      floorTheme: "standard",
      wallTheme: "standard",
    },
  ];
  doc.nodes = ["unconnected", "from", "to"].map((id, i) => ({
    id,
    deckId: "deck",
    point: [16 + i * 8, 16],
    channel: "power",
    kind: "endpoint",
    direction: i === 2 ? "in" : "out",
    medium: "power",
  }));
  doc.routes = [
    {
      id: "route",
      deckId: "deck",
      channel: "power",
      from: "from",
      to: "to",
      path: [
        [24, 16],
        [32, 16],
      ],
      capacity: null,
    },
  ];
  return doc;
}
describe("explicit editor selection deletion", () => {
  it("restores centered wall reservation when deleting an unpinned native door in one edit", () => {
    const doc = createDoorway250ReviewLayout();
    const next = deleteLayoutSelection(doc, compileLayout(doc), [
      doc.openings[0].id,
    ]);
    expect(next.openings).toEqual([]);
    expect(
      next.structure?.schema === "sidereal.layout-structure.v2" &&
        next.structure.boundaryTreatments,
    ).toEqual([
      expect.objectContaining({
        a: [0, 64],
        b: [192, 64],
        reservationSide: "center",
      }),
    ]);
    expect(
      compileLayout(next).diagnostics.filter((d) => d.severity === "error"),
    ).toEqual([]);
    expect(doc.openings).toHaveLength(1);
  });
  it("empty selection does not edit and wall, room or route deletion preserves every unrelated service port", () => {
    const doc = fixture(),
      before = JSON.stringify(doc),
      result = compileLayout(doc);
    expect(deleteLayoutSelection(doc, result, [])).toBe(doc);
    const wall = result.walls.find((w) => w.source === "partition")!;
    const deletedWall = deleteLayoutSelection(doc, result, [wall.key]);
    expect(deletedWall.partitions).toEqual([]);
    expect(deletedWall.openings).toEqual([]);
    expect(deletedWall.rooms[0].boundaryIds).toEqual([]);
    expect(deletedWall.nodes).toEqual(doc.nodes);
    expect(deletedWall.routes).toEqual(doc.routes);
    const deletedRoom = deleteLayoutSelection(doc, result, ["room"]);
    expect(deletedRoom.rooms).toEqual([]);
    expect(deletedRoom.nodes).toEqual(doc.nodes);
    expect(deletedRoom.partitions).toEqual(doc.partitions);
    const deletedRoute = deleteLayoutSelection(doc, result, ["route"]);
    expect(deletedRoute.routes).toEqual([]);
    expect(deletedRoute.nodes).toEqual(doc.nodes);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("removes selected Systems footprint placements and preserves native structures, unknown assets and unselected objects", () => {
    const doc = fixture();
    const catalog: PartCatalog = {
      schema: "sidereal.part-catalog.v1",
      assets: PART_CATEGORIES.map((category) => ({
        id: `asset-${category}`,
        label: category,
        category,
        nodes: [],
        bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      })),
    };
    doc.assembly = {
      schema: "sidereal.layout-assembly.v1",
      source: null,
      revisions: Object.fromEntries(
        [...PART_CATEGORIES, "unknown"].map((category) => [
          `asset-${category}`,
          "preserved-source-r1",
        ]),
      ),
      parts: [...PART_CATEGORIES, "unknown", "spare"].map((category) => ({
        id: `placed-${category}`,
        assetId: `asset-${category === "spare" ? "equipment" : category}`,
        position: [0, 0, 0],
        rotation: 0,
        flipped: false,
        removedCells: [],
      })),
    };
    const selected = doc.assembly.parts
      .filter((p) => p.id !== "placed-spare")
      .map((p) => p.id);
    const next = deleteLayoutSelection(
      doc,
      compileLayout(doc),
      selected,
      catalog,
    );
    expect(next.assembly!.parts.map((p) => p.id)).toEqual([
      "placed-superstructure",
      "placed-floor",
      "placed-wall",
      "placed-roof",
      "placed-decoration",
      "placed-unknown",
      "placed-spare",
    ]);
    expect(systemsFootprints(next, catalog, "deck").map((p) => p.id)).toEqual([
      "placed-spare",
    ]);
    expect(next.tiles).toEqual(doc.tiles);
    expect(next.partitions).toEqual(doc.partitions);
    expect(next.nodes).toEqual(doc.nodes);
    expect(next.assembly!.revisions).toEqual(doc.assembly.revisions);
    expect(
      undo(push({ past: [], present: doc, future: [] }, next)).present,
    ).toEqual(doc);
    expect(deleteLayoutSelection(doc, undefined, selected).assembly).toEqual(
      doc.assembly,
    );
  });
  it("does not delete a generated perimeter when passed its compiled selection key", () => {
    const doc = fixture(),
      result = compileLayout(doc),
      edge = result.walls.find((w) => w.source === "perimeter")!;
    expect(deleteLayoutSelection(doc, result, [edge.anchorId])).toEqual(doc);
  });
});
