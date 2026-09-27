import { expect, it } from "vitest";
import {
  emptyLayout,
  withRequiredShapeDependency,
} from "@sidereal/content/ship-layout";
import { matchNativeFloorTile } from "@sidereal/sim/layout-native-floor";
import { readLayout } from "@sidereal/sim/layout-validation";
import {
  floorStampSpacing,
  NATIVE_FLOOR_STAMPS,
  stampFloor,
} from "./floor-stamps";
import { placeTiles, push, undo, redo } from "./state";
it("all twelve native footprints survive rotation, save and reload with matching native geometry", () => {
  expect(NATIVE_FLOOR_STAMPS).toHaveLength(12);
  for (const stamp of NATIVE_FLOOR_STAMPS)
    for (let turn = 0; turn < 4; turn++) {
      const d = emptyLayout("draft", "deck");
      const placed = withRequiredShapeDependency(
        placeTiles(
          d,
          [[128, 64]],
          stamp.id,
          "deck",
          turn,
          false,
          false,
          () => "tile",
        ),
      );
      const restored = readLayout(JSON.parse(JSON.stringify(placed)));
      expect(restored.tiles[0].vertices).toEqual(
        stampFloor("tile", "deck", stamp.id, [128, 64], turn).vertices,
      );
      expect(matchNativeFloorTile(restored.tiles[0], 0)?.partId).toBe(
        stamp.partId,
      );
      const history = push({ past: [], present: d, future: [] }, restored);
      expect(undo(history).present.tiles).toEqual([]);
      expect(redo(undo(history)).present).toEqual(restored);
    }
});
it("uses the rotated native dimensions for fill spacing and native counterparts for reflections", () => {
  expect(floorStampSpacing("native:strip-4x1", 0)).toEqual([128, 32]);
  expect(floorStampSpacing("native:strip-4x1", 1)).toEqual([32, 128]);
  expect(floorStampSpacing("native:quarter-1m", 0)).toEqual([32, 32]);
  const d = placeTiles(
    emptyLayout("draft", "deck"),
    [[128, 128]],
    "native:triangle-long-left",
    "deck",
    0,
    true,
    true,
    (() => {
      let i = 0;
      return () => "tile-" + i++;
    })(),
  );
  expect(d.tiles).toHaveLength(4);
  for (const t of d.tiles) expect(matchNativeFloorTile(t, 0)).not.toBeNull();
  expect(() => stampFloor("a", "b", "native:unknown", [0, 0])).toThrow(
    "Unknown floor stamp",
  );
});
