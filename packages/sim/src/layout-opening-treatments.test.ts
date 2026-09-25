import { expect, it } from "vitest";
import { createDoorway250ReviewLayout } from "../../content/src/doorway250-review-layout";
import { compileLayout } from "./layout-compiler";
import { proposeWallOpening } from "./layout-structure";
import { remapOpeningTreatments } from "./layout-opening-treatments";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";

function closed() {
  const document = createDoorway250ReviewLayout();
  if (document.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  document.openings = [];
  return {
    ...document,
    structure: {
      ...document.structure,
      boundaryTreatments: [
        {
          ...document.structure.boundaryTreatments[0],
          id: "continuous-bulkhead",
          a: [0, 64] as Point,
          b: [192, 64] as Point,
        },
      ],
    },
  };
}
const insert = (document: LayoutDocument, width = 40) =>
  proposeWallOpening(document, {
    id: "native-door",
    deckId: document.playableDeckId,
    partitionId: document.partitions[0].id,
    slot: [96, 64],
    width,
    kind: "door",
    clearance: 16,
    sill: 0,
    setback: 12,
  });
it("cuts a native-sized doorway and its explicit jamb treatments in one strict draft edit", () => {
  const document = closed(),
    before = structuredClone(document),
    next = insert(document);
  expect(compileLayout(next).valid).toBe(true);
  if (next.structure?.schema !== "sidereal.layout-structure.v2") throw Error();
  expect(next.structure.boundaryTreatments).toMatchObject([
    {
      id: "continuous-bulkhead",
      a: [0, 64],
      b: [76, 64],
      reservationSide: "center",
    },
    { a: [116, 64], b: [192, 64], reservationSide: "center" },
  ]);
  expect(new Set(next.structure.boundaryTreatments.map((t) => t.id)).size).toBe(
    2,
  );
  expect(document).toEqual(before);
});
it("resizing or deleting a door restores the matching centered wall intent without orphaned spans", () => {
  const opened = insert(closed()),
    resized = insert(opened, 24);
  expect(compileLayout(resized).valid).toBe(true);
  if (resized.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  expect(resized.structure.boundaryTreatments).toMatchObject([
    { a: [0, 64], b: [84, 64] },
    { a: [108, 64], b: [192, 64] },
  ]);
  const treatments = remapOpeningTreatments(resized, undefined, "native-door");
  resized.openings = [];
  resized.structure.boundaryTreatments = treatments;
  expect(compileLayout(resized).valid).toBe(true);
  expect(treatments).toMatchObject([
    {
      id: "continuous-bulkhead",
      a: [0, 64],
      b: [192, 64],
      reservationSide: "center",
    },
  ]);
});
it("preserves reversed authored treatment direction and refuses native pins or ambiguous wall restoration", () => {
  const reverse = closed(),
    treatment = reverse.structure.boundaryTreatments[0];
  [treatment.a, treatment.b] = [treatment.b, treatment.a];
  const opened = insert(reverse);
  if (opened.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  expect(opened.structure.boundaryTreatments).toMatchObject([
    { id: "continuous-bulkhead", a: [192, 64], b: [116, 64] },
    { a: [76, 64], b: [0, 64] },
  ]);
  opened.structure.boundaryTreatments[0].heightUnits = 72;
  expect(() =>
    remapOpeningTreatments(opened, undefined, "native-door"),
  ).toThrow(/matching unpinned/);
  const pinned = closed();
  pinned.structure.boundaryTreatments[0].native = {
    id: "native-wall",
    revision: "r001",
    sha256: "0".repeat(64),
  };
  const before = structuredClone(pinned);
  expect(() => insert(pinned)).toThrow(/pinned native wall/);
  expect(pinned).toEqual(before);
});
