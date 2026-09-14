import { expect, it } from "vitest";
import { createDoorway250ReviewLayout } from "../../../../../packages/content/src/doorway250-review-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { applyLayoutGesture } from "./layout-gestures";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { LayoutPanelContext } from "./panel-context";
import { DEFAULT_VIEW } from "./state";

it("draws a supported internal wall with its centered 250 mm reservation in the same edit", () => {
  const doc = createDoorway250ReviewLayout();
  doc.partitions = [];
  doc.openings = [];
  if (doc.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error("fixture");
  doc.structure.boundaryTreatments = [];
  let next = doc;
  let error = "";
  let selected: string[] = [];
  applyLayoutGesture(
    { tool: "partition", start: [0, 64], end: [192, 64], ids: [], copy: false },
    {
      doc,
      result: compileLayout(doc),
      view: { ...DEFAULT_VIEW, deckId: doc.playableDeckId },
      commit: (change: (d: LayoutDocument) => LayoutDocument) => {
        next = change(structuredClone(doc));
      },
      editor: {
        setError: (value: string) => {
          error = value;
        },
      },
      select: (ids: string[]) => {
        selected = ids;
      },
    } as unknown as LayoutPanelContext,
  );
  expect(error).toBe("");
  expect(next.partitions).toHaveLength(1);
  expect(
    next.structure?.schema === "sidereal.layout-structure.v2" &&
      next.structure.boundaryTreatments,
  ).toEqual([
    expect.objectContaining({
      source: "partition",
      sourceAnchorId: selected[0],
      a: [0, 64],
      b: [192, 64],
      treatment: "auto",
      reservationSide: "center",
    }),
  ]);
  expect(
    compileLayout(next).diagnostics.filter((d) => d.severity === "error"),
  ).toEqual([]);
  expect(doc.partitions).toEqual([]);
});
