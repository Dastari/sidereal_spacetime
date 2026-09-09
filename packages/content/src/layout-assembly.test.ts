import { readFileSync } from "node:fs";
import { test, expect } from "vitest";
import {
  importShipAssembly,
  assemblyMismatches,
  layoutVisualParts,
  editVisualPart,
} from "./layout-assembly";
import type { PartCatalog, AssemblyDocument } from "./assembly";
import { emptyLayout } from "./ship-layout";
import { readLayout } from "../../sim/src/layout-validation";
import { compileLayout } from "../../sim/src/layout-compiler";
import {
  push,
  undo,
  redo,
  readCheckpoint,
  DEFAULT_VIEW,
} from "../../../apps/dashboard/src/shipyard/layout/state";
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
) as PartCatalog;
const source = JSON.parse(
  readFileSync("assets/runtime/assembly/wayfarer.json", "utf8"),
) as AssemblyDocument;
test("current Wayfarer round trip retains every independent identity, transform, fitting proxy and damage proposal", () => {
  const doc = importShipAssembly(source, catalog, "local-copy", "deck");
  expect(doc.assembly!.parts.length).toBeGreaterThan(200);
  expect(doc.assembly!.parts).toEqual(source.parts);
  expect(readLayout(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  expect(assemblyMismatches(doc, catalog)).toEqual([]);
  doc.assembly!.parts[0].position[2] += 1;
  expect(doc.assembly!.parts[0].position).not.toEqual(source.parts[0].position);
  expect(doc.source).toBeNull();
  expect(doc.tiles).toEqual([]);
});
test("visual edits use shared history and survive checkpoint recovery without source mutation", () => {
  const doc = importShipAssembly(source, catalog, "local-copy", "deck");
  const part = structuredClone(doc.assembly!.parts[0]);
  part.position = [3, -4, 2.25];
  part.rotation = Math.PI;
  part.flipped = true;
  const h = push(
    { past: [], present: doc, future: [] },
    editVisualPart(structuredClone(doc), part, catalog),
  );
  expect(h.present.assembly!.parts[0]).toEqual(part);
  expect(undo(h).present).toEqual(doc);
  expect(redo(undo(h)).present).toEqual(h.present);
  const c = {
    schema: "sidereal.layout-recovery.v1",
    sequence: 1,
    writer: "test",
    history: h,
    view: { ...DEFAULT_VIEW, deckId: "deck", mode: "Hull" },
  };
  expect(readCheckpoint(JSON.stringify(c)).history.present).toEqual(h.present);
});
test("catalog mismatch preserves bytes and structural validation rejects malformed or colliding placements", () => {
  const doc = importShipAssembly(source, catalog, "copy", "deck");
  const bad = structuredClone(catalog);
  bad.assets = bad.assets.filter(
    (a) => a.id !== doc.assembly!.parts[0].assetId,
  );
  expect(assemblyMismatches(doc, bad)).toContain(doc.assembly!.parts[0].id);
  expect(readLayout(doc)).toBe(doc);
  const malformed = structuredClone(doc);
  malformed.assembly!.parts[0].position[2] = NaN;
  expect(() => readLayout(malformed)).toThrow();
  const duplicate = structuredClone(doc);
  duplicate.assembly!.parts[0].id = "deck";
  expect(() => readLayout(duplicate)).toThrow(/Duplicate/);
  const revision = structuredClone(doc);
  revision.assembly!.schema = "future" as never;
  expect(() => readLayout(revision)).toThrow(/revision/);
});
test("floor compiler fingerprint is deterministic across visual placement order", () => {
  const doc = importShipAssembly(source, catalog, "copy", "deck"),
    reversed = structuredClone(doc);
  reversed.assembly!.parts.reverse();
  expect(compileLayout(doc).fingerprint).toEqual(
    compileLayout(reversed).fingerprint,
  );
});
test("existing floorplan fittings map to the exact mesh origin and keep the same identity when edited in Hull", () => {
  const a = catalog.assets.find((a) => a.category === "equipment" && a.visual)!;
  const doc = emptyLayout("doc", "deck");
  doc.fittings = [
    {
      id: "fit",
      deckId: "deck",
      definitionId: a.id,
      revision: a.visual!.sha256,
      position: [64, 96],
      quarterTurns: 1,
      reflected: true,
      footprint: [32, 32],
      clearance: 0,
      kind: "equipment",
      container: null,
    },
  ];
  const p = layoutVisualParts(doc, catalog)[0];
  expect(editVisualPart(structuredClone(doc), p, catalog)).toEqual(doc);
  const moved = {
    ...p,
    position: [p.position[0] + 2, p.position[1] - 1, p.position[2]] as [
      number,
      number,
      number,
    ],
  };
  const edited = editVisualPart(structuredClone(doc), moved, catalog);
  expect(edited.fittings[0].position).toEqual([128, 64]);
  expect(edited.fittings[0].id).toBe("fit");
  expect(edited.assembly).toBeUndefined();
});
