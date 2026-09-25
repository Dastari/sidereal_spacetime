import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { PartCatalog } from "@sidereal/content/assembly";
import {
  emptyLayout,
  transformPoint,
  type LayoutDocument,
  type Point,
} from "@sidereal/content/ship-layout";
import { canonicalPolygon } from "@sidereal/sim/layout-geometry";
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
  it("renders all catalogue footprints through every rotation and mirror without losing exact surface alignment", () => {
    for (const shape of PINNED_FLOOR_KIT.parts)
      for (const quarterTurns of shape.quarterTurns)
        for (const mirrorX of [false, true])
          for (const mirrorY of [false, true]) {
            const d = emptyLayout("catalogue-review", "deck");
            d.decks[0].elevation = 112;
            const vertices = shape.footprint.map((point): Point => {
              const [x, y] = transformPoint(point, quarterTurns);
              return [96 + (mirrorX ? -x : x), -160 + (mirrorY ? -y : y)];
            });
            d.tiles.push({
              id: shape.id,
              deckId: "deck",
              shape: "polygon",
              revision: "lattice-shapes-2",
              material: "native",
              vertices,
            });
            const before = JSON.stringify(d);
            const actual = layoutNativeFloors(d, catalog, "deck");
            const label = `${shape.id} rotation ${quarterTurns} mirror ${mirrorX}/${mirrorY}`;
            expect(actual.unmatched, label).toEqual([]);
            expect(actual.parts, label).toHaveLength(1);
            const placed = actual.parts[0];
            const selected = PINNED_FLOOR_KIT.parts.find(
              (p) => p.native.assetId === placed.assetId,
            )!;
            // These exact delivered floor sources use the nominal lattice frame.
            expect(selected.native.sourceToNominal).toEqual({
              translation: [0, 0, 0],
              quarterTurns: 0,
              reflected: false,
            });
            const rendered = selected.footprint.map((p): Point => {
              const [x, y] = transformPoint(
                p,
                Math.round(placed.rotation / (Math.PI / 2)),
                placed.flipped,
              );
              return [x + placed.position[0] * 32, y + placed.position[1] * 32];
            });
            expect(canonicalPolygon(rendered), label).toEqual(
              canonicalPolygon(vertices),
            );
            expect(placed.position[2], label).toBe(3.5);
            expect(JSON.stringify(d)).toBe(before);
          }
  });
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
  it("rejects a substituted native revision even when GLB bytes and selector match", () => {
    const changed = structuredClone(catalog);
    const native = PINNED_FLOOR_KIT.parts[0].native;
    const asset = changed.assets.find((a) => a.id === native.assetId)!;
    const expected = layoutNativeFloors(doc, catalog, doc.playableDeckId)
      .parts.filter((p) => p.assetId === asset.id)
      .map((p) => p.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(asset.visual!.sha256).toBe(native.sha256);
    expect(asset.visual!.nodePrefix).toBe(native.nodePrefix);
    asset.visual!.revision += 1;
    const result = layoutNativeFloors(doc, changed, doc.playableDeckId);
    expect(result.unmatched).toEqual(expect.arrayContaining(expected));
    expect(result.parts.every((p) => p.assetId !== asset.id)).toBe(true);
    expect(
      catalog.assets.find((a) => a.id === native.assetId)!.visual!.revision,
    ).toBe(Number(native.revision.slice(1)));
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
