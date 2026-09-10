import { describe, it, expect } from "vitest";
import { emptyLayout, type FloorTile } from "@sidereal/content/ship-layout";
import { HULL_SIZE_CATALOG } from "@sidereal/content/hull-size-catalog";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import {
  PINNED_FLOOR_KIT,
  compileConstruction,
} from "./construction-transactions";
import { floorModelOptions, matchNativeFloorTile } from "./layout-native-floor";
import { bindConstructionLayout } from "./construction-layout";
import { readLayout } from "./layout-validation";
import { setFloorStyle, setHullEnvelope } from "./layout-structure";
const original = JSON.parse(WAYFARER_STARTER.documentJson);
describe("pinned native floor model selection", () => {
  it("retains all 51 exact original native placements with no override", () => {
    const d = readLayout(original.layout),
      bound = bindConstructionLayout(d);
    expect(bound.unmatched).toEqual([]);
    expect(
      [...bound.document.floors].sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([...original.floors].sort((a, b) => a.id.localeCompare(b.id)));
  });
  it("matches every native nominal part with its approved identity, datum and transform", () => {
    for (const part of PINNED_FLOOR_KIT.parts) {
      const tile: FloorTile = {
        id: "tile",
        deckId: "upper",
        shape: "polygon",
        revision: "lattice-shapes-2",
        material: "native",
        vertices: part.footprint.map(([x, y]) => [x + 64, y - 64]),
      };
      const selected = matchNativeFloorTile(tile, 128, {
        assetId: part.native.assetId,
        revision: part.native.revision,
      });
      expect(selected).toMatchObject({
        id: "tile",
        deckId: "upper",
        partId: part.id,
        origin: [64, -64, 128],
        reflected: false,
      });
      expect(
        floorModelOptions(tile, 128).find((o) => o.partId === part.id)?.sha256,
      ).toBe(part.native.sha256);
    }
  });
  it("rejects wrong shape/revision/unknown override without falling back or altering the draft", () => {
    const d = readLayout(original.layout),
      tile = d.tiles[0],
      options = floorModelOptions(tile, 0),
      valid = options[0]!;
    expect(
      matchNativeFloorTile(tile, 0, {
        assetId: valid.assetId,
        revision: "r999",
      }),
    ).toBeNull();
    expect(
      matchNativeFloorTile(tile, 0, { assetId: "unknown", revision: "r002" }),
    ).toBeNull();
    const wrong = PINNED_FLOOR_KIT.parts.find(
      (p) => !options.some((o) => o.assetId === p.native.assetId),
    )!;
    expect(
      matchNativeFloorTile(tile, 0, {
        assetId: wrong.native.assetId,
        revision: wrong.native.revision,
      }),
    ).toBeNull();
    const next = setHullEnvelope(d, {
        ...HULL_SIZE_CATALOG[0],
        origin: [...HULL_SIZE_CATALOG[0].origin],
      }),
      before = JSON.stringify(next);
    expect(() =>
      setFloorStyle(next, tile.id, {
        model: {
          assetId: wrong.native.assetId,
          revision: wrong.native.revision,
        },
      }),
    ).toThrow("interface");
    expect(JSON.stringify(next)).toBe(before);
  });
  it("binds and compiles the selected native model and rejects manually forged binding mismatch", () => {
    const doc = setHullEnvelope(readLayout(original.layout), {
        ...HULL_SIZE_CATALOG[0],
        origin: [...HULL_SIZE_CATALOG[0].origin],
      }),
      tile = doc.tiles[0],
      option = floorModelOptions(tile, 0)[0];
    const changed = setFloorStyle(doc, tile.id, {
        model: { assetId: option.assetId, revision: option.revision },
      }),
      bound = bindConstructionLayout(changed);
    expect(bound.unmatched).toEqual([]);
    expect(() =>
      compileConstruction(JSON.stringify(bound.document)),
    ).not.toThrow();
    // Keep real native footprint binding but lie about the chosen revision; direct
    // proposal compilation must reject independently of the editor helper.
    bound.document.layout.structure!.tileStyles[tile.id].model!.revision =
      "r999";
    expect(() => compileConstruction(JSON.stringify(bound.document))).toThrow(
      "explicit model",
    );
  });
});
