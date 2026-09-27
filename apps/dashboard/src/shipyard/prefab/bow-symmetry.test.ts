import { it, expect } from "vitest";
import {
  SHAPE_TILE_IDS,
  placedTilePolygon,
  type ShapeTilePlacement,
  type QuarterTurn,
} from "@sidereal/content/construction-grammar";
import { bowHeights } from "@sidereal/content/bow-profiles";
import { mirrorTile } from "./symmetry";
const turns = [0, 1, 2, 3] as QuarterTurn[];
it("preserves the vertical profile through editor reflection, including symmetrical square shapes", () => {
  for (const shape of SHAPE_TILE_IDS)
    for (const rot of turns)
      for (const reflected of [false, true])
        for (const axis of turns) {
          const t: ShapeTilePlacement = {
            x: 2,
            y: 3,
            shape,
            rot,
            reflected,
            bow: { step: 2, axis },
          };
          const m = mirrorTile(t, 6);
          for (const p of placedTilePolygon(t)) {
            const a = bowHeights(m, "deck", [p[0], 12 - p[1]]),
              b = bowHeights(t, "deck", p);
            a.forEach((n, i) => expect(n).toBeCloseTo(b[i], 7));
          }
        }
});
