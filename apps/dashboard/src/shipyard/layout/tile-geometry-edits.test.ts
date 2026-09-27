import { expect, it } from "vitest";
import { HULL_SIZE_CATALOG } from "@sidereal/content/hull-size-catalog";
import { floorModelOptions } from "@sidereal/sim/layout-native-floor";
import { createBlankLayout } from "./redesign-document";
import { stampFloor } from "./floor-stamps";
import { replaceFloorShape } from "./tile-geometry-edits";
import { transformTiles } from "./state";

it("deliberate shape edits preserve tile identity and finish while releasing only an incompatible override", () => {
  const d = createBlankLayout(
    "ship",
    "test",
    HULL_SIZE_CATALOG[0],
    "682210ab-dae9-4f53-bb31-c8bb5617d4e1",
    "882210ab-dae9-4f53-bb31-c8bb5617d4e1",
  );
  const tile = {
    ...stampFloor("tile", "deck", "native:triangle-long-left", [0, 0]),
    material: "paint",
  };
  d.tiles = [tile];
  const model = floorModelOptions(tile, 0)[0];
  d.structure!.tileStyles[tile.id] = {
    model: { assetId: model.assetId, revision: model.revision },
  };
  const before = JSON.stringify(d);
  const rotated = transformTiles(d, [tile.id], "rotate");
  expect(rotated.structure!.tileStyles[tile.id].model).toEqual(
    d.structure!.tileStyles[tile.id].model,
  );
  const mirrored = transformTiles(d, [tile.id], "mirror-x");
  expect(mirrored.structure!.tileStyles[tile.id].model).toBeUndefined();
  expect(floorModelOptions(mirrored.tiles[0], 0)).not.toHaveLength(0);
  const changed = replaceFloorShape(d, tile.id, "native:square-2m", 0);
  expect(changed.tiles[0]).toMatchObject({
    id: tile.id,
    deckId: "deck",
    material: "paint",
  });
  expect(changed.structure!.tileStyles[tile.id].model).toBeUndefined();
  expect(JSON.stringify(d)).toBe(before);
});
