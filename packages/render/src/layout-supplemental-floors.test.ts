import { expect, it } from "vitest";
import { stampTile, transformPoint } from "@sidereal/content/ship-layout";
import { supplementalFloor } from "./layout-supplemental-floors";
import { canonicalPolygon } from "@sidereal/sim/layout-geometry";
import { INSET_VISUAL_PARTS } from "./inset-visual-registry";
import { readFileSync } from "node:fs";
import { constructionHash } from "@sidereal/sim/construction-transactions";

it("restores the historic trapezoid with exact native sources in every handed orientation", () => {
  for (let q = 0; q < 4; q++)
    for (const reflected of [false, true]) {
      const tile = stampTile(
        "legacy",
        "deck",
        "trapezoid",
        [-96, 160],
        q,
        reflected,
      );
      const match = supplementalFloor(tile)!;
      expect(match).toBeDefined();
      const part = INSET_VISUAL_PARTS.find((p) => p.key === match.key)!;
      const vertices = part.footprintM.map(([x, y]) => {
        const p = transformPoint([x * 32, y * 32], match.quarterTurns);
        return [p[0] + match.origin[0], p[1] + match.origin[1]] as [
          number,
          number,
        ];
      });
      expect(canonicalPolygon(vertices)).toEqual(
        canonicalPolygon(tile.vertices),
      );
      expect(
        constructionHash(
          readFileSync("assets/runtime/" + part.url.replace("/assets/", "")),
        ),
      ).toBe(part.sha256);
      expect(
        supplementalFloor(tile, {
          assetId: "explicit-model",
          revision: "r001",
        }),
      ).toBeUndefined();
    }
  const tile = stampTile("custom", "deck", "trapezoid", [0, 0]);
  tile.vertices[2][0] += 1;
  expect(supplementalFloor(tile)).toBeUndefined();
});
