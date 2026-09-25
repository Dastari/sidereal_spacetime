import type { FloorTile, Point } from "@sidereal/content/ship-layout";
import type { FloorStyle } from "@sidereal/content/layout-structure";
import { canonicalPolygon } from "@sidereal/sim/layout-geometry";
import { INSET_VISUAL_PARTS } from "./inset-visual-registry";

/** Exact rigid matches only; no inferred scaling or replacement of explicit pins. */
export function supplementalFloor(
  tile: FloorTile,
  model?: FloorStyle["model"],
) {
  if (model) return;
  const target = canonicalPolygon(tile.vertices);
  for (const part of INSET_VISUAL_PARTS.filter((p) => p.kind === "floor")) {
    for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
      const c = Math.round(Math.cos((quarterTurns * Math.PI) / 2)),
        s = Math.round(Math.sin((quarterTurns * Math.PI) / 2));
      const turned = part.footprintM.map(([x, y]): Point => [
        (x * c - y * s) * 32,
        (x * s + y * c) * 32,
      ]);
      const origin: Point = [0, 1].map(
        (i) =>
          Math.min(...target.map((p) => p[i])) -
          Math.min(...turned.map((p) => p[i])),
      ) as Point;
      if (
        JSON.stringify(
          canonicalPolygon(
            turned.map(([x, y]) => [x + origin[0], y + origin[1]]),
          ),
        ) === JSON.stringify(target)
      )
        return { key: part.key, origin, quarterTurns };
    }
  }
}
