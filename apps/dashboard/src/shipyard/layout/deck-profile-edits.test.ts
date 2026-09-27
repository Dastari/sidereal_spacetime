import { describe, expect, it } from "vitest";
import { emptyLayout } from "@sidereal/content/ship-layout";
import type { LayoutStructureV2 } from "@sidereal/content/layout-structure";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { readLayout } from "@sidereal/sim/layout-validation";
import { editDeckClearHeight } from "./deck-profile-edits";

function fixture() {
  const doc = emptyLayout("height-edit", "main");
  doc.decks[0].ceiling = 102;
  doc.decks.push({ ...doc.decks[0], id: "upper", elevation: 112 });
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
      height: 224,
      origin: [0, 0, 0],
    },
    wallFaces: {},
    tileStyles: {},
    armor: [],
    boundaryTreatments: [],
    navigationReservations: [],
    deckProfiles: doc.decks.map((d) => ({
      deckId: d.id,
      floorThickness: 6,
      clearHeight: 96,
      roofThickness: 4,
      serviceVoid: 6,
      pitch: 112,
    })),
  };
  return { ...doc, structure };
}

describe("explicit deck clear height", () => {
  it("persists a smaller profile with matching ceiling and pitch while preserving the old checkpoint and other deck", () => {
    const doc = fixture(),
      before = JSON.stringify(doc);
    const next = editDeckClearHeight(doc, "main", 32);
    expect(JSON.stringify(doc)).toBe(before);
    expect(next.decks[0].ceiling).toBe(38);
    expect(next.decks[1]).toBe(doc.decks[1]);
    expect(next.structure?.schema).toBe("sidereal.layout-structure.v2");
    if (next.structure?.schema !== "sidereal.layout-structure.v2")
      throw Error("v2 lost");
    expect(next.structure.deckProfiles[0]).toMatchObject({
      clearHeight: 32,
      pitch: 48,
    });
    expect(readLayout(JSON.parse(JSON.stringify(next)))).toEqual(next);
    expect(
      compileLayout(next).diagnostics.filter((d) =>
        d.code.startsWith("profile-"),
      ),
    ).toEqual([]);
  });

  it("exposes overlap without moving another deck or expanding the hull", () => {
    const doc = fixture();
    const next = editDeckClearHeight(doc, "main", 112);
    expect(next.decks[1].elevation).toBe(112);
    expect(next.structure?.hull).toBe(doc.structure.hull);
    expect(
      compileLayout(next).diagnostics.some((d) => d.code === "profile-overlap"),
    ).toBe(true);
  });

  it("rejects fractional lattice values, missing profiles and the retained subminimum ceiling", () => {
    const doc = fixture(),
      before = JSON.stringify(doc);
    for (const h of [NaN, Infinity, 32.5, 0, 24, 512])
      expect(() => editDeckClearHeight(doc, "main", h)).toThrow();
    expect(() => editDeckClearHeight(doc, "missing", 32)).toThrow();
    expect(() =>
      editDeckClearHeight(emptyLayout("legacy", "main"), "main", 32),
    ).toThrow();
    expect(JSON.stringify(doc)).toBe(before);
  });
});
