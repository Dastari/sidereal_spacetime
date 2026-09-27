import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { PartCatalog, AssemblyDocument } from "./assembly";
import {
  canPaintHullAsset,
  validateHullPaint,
  hullPaintKey,
} from "./hull-paint";
import {
  importShipAssembly,
  paintVisualPart,
  layoutVisualParts,
} from "./layout-assembly";
import { emptyLayout } from "./ship-layout";
import { readLayout } from "@sidereal/sim/layout-validation";
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
) as PartCatalog;
const source = JSON.parse(
  readFileSync("assets/runtime/assembly/wayfarer.json", "utf8"),
) as AssemblyDocument;

test("paint permits only bounded opaque sRGB colours and has a stable render key", () => {
  for (const p of [
    undefined,
    {},
    { primary: "#123ABC" },
    { primary: "#000000", secondary: "#ffffff" },
  ])
    expect(() => validateHullPaint(p)).not.toThrow();
  for (const p of [
    null,
    [],
    "red",
    { primary: "red" },
    { secondary: "#fff" },
    { primary: "#11223344" },
    { primary: "url(secret)" },
    { tertiary: "#112233" },
    { primary: 4 },
  ])
    expect(() => validateHullPaint(p)).toThrow(/six-digit/);
  expect(hullPaintKey({ primary: "#AAbbCC" })).toBe(
    hullPaintKey({ primary: "#aabbcc" }),
  );
});
test("painting one placed hull component preserves its pose, source and neighbours through JSON round trips", () => {
  const doc = importShipAssembly(source, catalog, "paint-test", "deck");
  const part = doc.assembly!.parts.find((p) =>
    canPaintHullAsset(catalog.assets.find((a) => a.id === p.assetId)!),
  )!;
  const paint = { primary: "#0088ff", secondary: "#ff8800" };
  const next = paintVisualPart(doc, part.id, paint, catalog);
  expect(next.assembly!.parts.find((p) => p.id === part.id)).toEqual({
    ...part,
    paint,
  });
  expect(
    doc.assembly!.parts.find((p) => p.id === part.id)!.paint,
  ).toBeUndefined();
  expect(next.assembly!.parts.filter((p) => p.id !== part.id)).toEqual(
    doc.assembly!.parts.filter((p) => p.id !== part.id),
  );
  paint.primary = "#112233";
  expect(
    next.assembly!.parts.find((p) => p.id === part.id)!.paint!.primary,
  ).toBe("#0088ff");
  expect(readLayout(JSON.parse(JSON.stringify(next)))).toEqual(next);
  expect(paintVisualPart(next, part.id, undefined, catalog)).toEqual(doc);
  const invalid = structuredClone(next);
  invalid.assembly!.parts[0].paint = { primary: "transparent" };
  expect(() => readLayout(invalid)).toThrow();
});
test("planar engine paint is carried into previews without re-snapping the fitting", () => {
  const asset = catalog.assets.find((a) => a.category === "engine")!;
  const doc = emptyLayout("paint-planar", "deck");
  doc.fittings = [
    {
      id: "engine",
      deckId: "deck",
      definitionId: asset.id,
      revision: "native",
      position: [64, 96],
      quarterTurns: 1,
      reflected: true,
      footprint: [32, 32],
      clearance: 0,
      kind: "equipment",
      container: null,
    },
  ];
  const next = paintVisualPart(
    doc,
    "engine",
    { secondary: "#112233" },
    catalog,
  );
  expect(next.fittings[0]).toEqual({
    ...doc.fittings[0],
    paint: { secondary: "#112233" },
  });
  expect(layoutVisualParts(next, catalog)[0]).toEqual({
    ...layoutVisualParts(doc, catalog)[0],
    paint: { secondary: "#112233" },
  });
  expect(readLayout(JSON.parse(JSON.stringify(next)))).toEqual(next);
  const invalid = structuredClone(next);
  invalid.fittings[0].paint = { primary: "#123" };
  expect(() => readLayout(invalid)).toThrow();
});
test("interior furnishings cannot be accidentally repainted by the hull control", () => {
  const doc = importShipAssembly(source, catalog, "paint-test", "deck");
  const part = doc.assembly!.parts.find(
    (p) => !canPaintHullAsset(catalog.assets.find((a) => a.id === p.assetId)!),
  )!;
  expect(() =>
    paintVisualPart(doc, part.id, { primary: "#112233" }, catalog),
  ).toThrow(/no hull paint/);
});
