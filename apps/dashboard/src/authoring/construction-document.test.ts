import { describe, expect, it } from "vitest";
import { createNativeTraversalRoomDocument } from "@sidereal/sim/construction-traversal-document";
import { createNativePressureRoomDocument } from "@sidereal/sim/construction-pressure-document";
import {
  constructionForLayout,
  importConstructionSource,
  copyConstructionSource,
  rememberConstructionSource,
  storedConstructionSource,
} from "./construction-document";
import { readConstructionDraft } from "@sidereal/sim/construction-transactions";

const storage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
};
describe("full construction source round trip", () => {
  for (const create of [
    createNativeTraversalRoomDocument,
    createNativePressureRoomDocument,
  ]) {
    it(`preserves qualified metadata through load, rename and server serialization: ${create.name}`, () => {
      const original = JSON.parse(
          readConstructionDraft(JSON.stringify(create())).canonical,
        ),
        local = storage();
      rememberConstructionSource(JSON.stringify(original), local);
      const layout = structuredClone(original.layout);
      layout.name = "Renamed test template";
      const result = constructionForLayout(
        layout,
        storedConstructionSource(layout.id, local),
      );
      const round = JSON.parse(
        readConstructionDraft(JSON.stringify(result)).canonical,
      );
      expect(round.layout.name).toBe(layout.name);
      for (const key of [
        "boundaryKit",
        "roofKit",
        "pressureRoom",
        "traversalRoom",
        "airlockRoom",
        "stairRoom",
      ] as const)
        expect(round[key]).toEqual(original[key]);
      expect(original.layout.name).not.toBe(layout.name);
      copyConstructionSource(layout.id, "copied-layout", local);
      expect(storedConstructionSource("copied-layout", local)?.layout.id).toBe(
        "copied-layout",
      );
      expect(storedConstructionSource(layout.id, local)?.layout.id).toBe(
        layout.id,
      );
      expect(() =>
        constructionForLayout({ ...layout, id: "wrong" }, original),
      ).toThrow(/another draft/);
    });
  }
});

it("rejects mismatched imported metadata without overwriting either draft", () => {
  const local = storage(),
    doc = createNativePressureRoomDocument();
  rememberConstructionSource(JSON.stringify(doc), local);
  expect(() =>
    importConstructionSource(JSON.stringify(doc), "unrelated", "new", local),
  ).toThrow(/does not match/);
  expect(storedConstructionSource("new", local)).toBeUndefined();
  expect(storedConstructionSource(doc.layout.id, local)?.layout.id).toBe(
    doc.layout.id,
  );
});

it("retains incomplete native floor drafts for recovery, with publication still validated separately", () => {
  const source = createNativePressureRoomDocument();
  const layout = structuredClone(source.layout);
  layout.tiles[0].vertices = [
    [0, 0],
    [1.3, 0],
    [1.3, 1.3],
    [0, 1.3],
  ];
  expect(() => constructionForLayout(layout)).not.toThrow();
  expect(constructionForLayout(layout).floors.length).toBeLessThan(
    layout.tiles.length,
  );
});
