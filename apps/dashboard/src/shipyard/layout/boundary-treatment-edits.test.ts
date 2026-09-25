import { describe, expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import type { LayoutStructureV2 } from "@sidereal/content/layout-structure";
import { editBoundaryTreatment } from "./boundary-treatment-edits";
import { deleteInternalWall } from "./panel-deletion";
import { push, undo } from "./state";

function fixture() {
  const doc = emptyLayout("treatment-edit", "main");
  doc.decks[0].ceiling = 102;
  doc.tiles = [stampTile("floor", "main", "rectangle", [0, 0])];
  const structure: LayoutStructureV2 = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      revision: "1",
      name: "Test",
      width: 64,
      length: 64,
      height: 112,
      origin: [0, 0, 0],
    },
    wallFaces: {},
    tileStyles: {},
    armor: [],
    boundaryTreatments: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
  };
  return { ...doc, structure };
}

describe("draft boundary treatment edits", () => {
  it("creates and updates one saved intent while preserving the old checkpoint and native reference", () => {
    const doc = fixture();
    const original = JSON.stringify(doc);
    const wall = compileLayout(doc).walls[0];
    const next = editBoundaryTreatment(
      doc,
      wall,
      { treatment: "cockpit-glass", heightUnits: 72 },
      "glazing",
    );
    expect(JSON.stringify(doc)).toBe(original);
    expect(next.structure?.schema).toBe("sidereal.layout-structure.v2");
    if (next.structure?.schema !== "sidereal.layout-structure.v2")
      throw Error("v2 lost");
    const native = { id: "retained", revision: "r000", sha256: "a".repeat(64) };
    next.structure.boundaryTreatments[0].native = native;
    const selected = compileLayout(next).walls.find(
      (w) => w.treatment?.overrideId === "glazing",
    )!;
    const changed = editBoundaryTreatment(
      next,
      selected,
      { heightUnits: 48 },
      "unused",
    );
    if (changed.structure?.schema !== "sidereal.layout-structure.v2")
      throw Error("v2 lost");
    expect(changed.structure.boundaryTreatments).toHaveLength(1);
    expect(changed.structure.boundaryTreatments[0]).toMatchObject({
      id: "glazing",
      heightUnits: 48,
      native,
    });
    expect(
      compileLayout(changed).walls.find(
        (w) => w.treatment?.overrideId === "glazing",
      )?.treatment?.qualification,
    ).toBe("pending");
    expect(next.structure.boundaryTreatments[0].heightUnits).toBe(72);
  });

  it("rejects stale selection, invalid patches and heights without changing the source", () => {
    const doc = fixture(),
      wall = compileLayout(doc).walls[0],
      before = JSON.stringify(doc);
    expect(() =>
      editBoundaryTreatment(
        doc,
        { ...wall, b: [999, 999] },
        { treatment: "open" },
        "x",
      ),
    ).toThrow(/changed/);
    expect(() =>
      editBoundaryTreatment(doc, wall, { heightUnits: 97 }, "x"),
    ).toThrow(/clear height/);
    expect(() =>
      editBoundaryTreatment(doc, wall, { heightUnits: 24.5 }, "x"),
    ).toThrow(/height/);
    expect(() =>
      editBoundaryTreatment(doc, wall, { reservationSide: "center" }, "x"),
    ).toThrow(/reservation side/);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("lets an unresolved internal partition acquire an explicit reservation through a normal edit", () => {
    const doc = fixture();
    doc.partitions = [
      {
        id: "divider",
        deckId: "main",
        a: [32, 0],
        b: [32, 64],
        seal: "design-sealed",
      },
    ];
    const wall = compileLayout(doc).walls.find(
      (w) => w.source === "partition",
    )!;
    const next = editBoundaryTreatment(
      doc,
      wall,
      { treatment: "bulkhead", reservationSide: "center" },
      "internal",
    );
    expect(
      compileLayout(next).diagnostics.filter((d) => d.severity === "error"),
    ).toEqual([]);
    expect(doc.structure.boundaryTreatments).toEqual([]);
    const removed = deleteInternalWall(next, "divider");
    if (removed.structure?.schema !== "sidereal.layout-structure.v2")
      throw Error("v2 lost");
    expect(removed.structure.boundaryTreatments).toEqual([]);
    expect(removed.partitions).toEqual([]);
    const history = push({ past: [], present: next, future: [] }, removed);
    expect(undo(history).present).toEqual(next);
  });
});
