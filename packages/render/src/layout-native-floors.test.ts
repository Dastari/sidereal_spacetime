import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { PartCatalog } from "@sidereal/content/assembly";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { PINNED_FLOOR_KIT } from "@sidereal/sim/construction-transactions";
import { layoutNativeFloors } from "./layout-native-floors";
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
) as PartCatalog;
const doc = JSON.parse(
  readFileSync(
    "apps/dashboard/src/shipyard/layout/templates/wayfarer-r001.json",
    "utf8",
  ),
).layout as LayoutDocument;
const manifest = JSON.parse(
  readFileSync("assets/runtime/assembly/floor-manifest.json", "utf8"),
);
describe("native semantic floor preview", () => {
  it("matches all 51 source placements including diagonal source offsets without mutating the draft", () => {
    const before = JSON.stringify(doc),
      actual = layoutNativeFloors(doc, catalog, doc.playableDeckId);
    expect(actual.unmatched).toEqual([]);
    expect(actual.parts).toHaveLength(51);
    const original = manifest.entries.flatMap((e: any) => e.placements);
    for (const p of actual.parts) {
      const source = original.find((s: any) => s.id === p.id);
      expect(source, p.id).toBeDefined();
      expect(p.assetId).toBe(source.assetId);
      expect(p.position).toEqual(source.position);
      expect(p.rotation).toBeCloseTo(source.rotation, 8);
      expect(p.flipped).toBe(source.flipped);
    }
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("retains distinct tile IDs and uses selected deck height with floor-layer visibility", () => {
    const d = structuredClone(doc),
      tile = structuredClone(d.tiles[0]);
    tile.id = "upper-copy";
    tile.deckId = "upper";
    d.decks.push({ ...d.decks[0], id: "upper", order: 1, elevation: 128 });
    d.tiles.push(tile);
    const result = layoutNativeFloors(d, catalog, "upper");
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0].id).toBe("upper-copy");
    expect(result.parts[0].position[2]).toBe(4);
    expect(layoutNativeFloors(d, catalog, "upper", false).parts).toEqual([]);
    expect(layoutNativeFloors(d, catalog, "missing").parts).toEqual([]);
  });
  it("requires exact GLB bytes and selector before mapping an authored native surface", () => {
    const changed = structuredClone(catalog),
      asset = changed.assets.find(
        (a) => a.id === PINNED_FLOOR_KIT.parts[0].native.assetId,
      )!;
    asset.visual!.sha256 = "0".repeat(64);
    const result = layoutNativeFloors(doc, changed, doc.playableDeckId);
    expect(result.unmatched.length).toBeGreaterThan(0);
    expect(result.parts.every((p) => p.assetId !== asset.id)).toBe(true);
  });
  it("does not manufacture native geometry for unsupported shapes or duplicate identities", () => {
    const d = structuredClone(doc);
    d.tiles[0].vertices[0][0] += 1;
    expect(
      layoutNativeFloors(d, catalog, d.playableDeckId).unmatched,
    ).toContain(d.tiles[0].id);
    const duplicate = structuredClone(doc);
    duplicate.assembly!.parts.push({
      ...duplicate.assembly!.parts[0],
      id: duplicate.tiles[0].id,
    });
    expect(() =>
      layoutNativeFloors(duplicate, catalog, duplicate.playableDeckId),
    ).toThrow("identity also exists");
  });
});
