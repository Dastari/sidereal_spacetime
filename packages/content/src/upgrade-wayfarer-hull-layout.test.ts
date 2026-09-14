import { expect, test } from "vitest";
import source from "./wayfarer-rebuild-r002.json";
import map from "./wayfarer-hull-r005-map.json";
import { upgradeWayfarerHullLayout } from "./upgrade-wayfarer-hull-layout";
import type { LayoutDocument } from "./ship-layout";
import type { PartCatalog } from "./assembly";
const doc = source.layout as unknown as LayoutDocument;
const catalog = {
  schema: "sidereal.part-catalog.v1",
  assets: map.map((m) => ({ id: m.assetId, visual: { sha256: m.sha256 } })),
} as unknown as PartCatalog;
test("all eighteen hull pieces meet structural X ±5 with same object IDs and tangent detail", () => {
  const next = upgradeWayfarerHullLayout(doc, catalog);
  const changed = next.assembly!.parts.filter((p) =>
    map.some((m) => m.assetId === p.assetId),
  );
  expect(changed).toHaveLength(18);
  for (const p of changed) {
    const original = doc.assembly!.parts.find((o) => o.id === p.id)!;
    expect(Math.abs(p.position[0])).toBe(5);
    expect(p.position[1]).toBe(original.position[1]);
    expect(p.position[2]).toBe(0.1875);
    expect(p.rotation).toBe(original.rotation);
    expect(p.flipped).toBe(p.position[0] < 0);
  }
  expect(next.assembly!.parts.map((p) => p.id)).toEqual(
    doc.assembly!.parts.map((p) => p.id),
  );
  expect(
    next.assembly!.parts.filter((p) => p.id.startsWith("drives-")),
  ).toEqual(doc.assembly!.parts.filter((p) => p.id.startsWith("drives-")));
  expect(next.tiles).toEqual(doc.tiles);
  expect(next.partitions).toEqual(doc.partitions);
  expect(next.openings).toEqual(doc.openings);
  expect(upgradeWayfarerHullLayout(next, catalog)).toBe(next);
  expect(doc).toEqual(source.layout);
});
test("unqualified replacement bytes reject and unrelated assembly remains unchanged", () => {
  expect(() =>
    upgradeWayfarerHullLayout(doc, { ...catalog, assets: [] }),
  ).toThrow("Exact normalized");
  const next = upgradeWayfarerHullLayout(doc, catalog);
  const changedIds = new Set(map.map((m) => m.previousAssetId));
  expect(
    next.assembly!.parts.filter(
      (p) => !map.some((m) => m.assetId === p.assetId),
    ),
  ).toEqual(doc.assembly!.parts.filter((p) => !changedIds.has(p.assetId)));
});
