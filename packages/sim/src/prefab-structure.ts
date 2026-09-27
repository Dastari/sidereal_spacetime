/** Invisible structural envelope derived from the same grammar tiles as the Blender kit.
 * This is compiler output, never dresser output. Camera mode cannot alter it.
 */
import {
  G,
  insidePolygon,
  placedTilePolygon,
  type Pt,
  type ShapeTilePlacement,
  type HeightClassId,
} from "@sidereal/content/construction-grammar";
import {
  bowGlass,
  bowHeights,
  bowWallPolygon,
  bowLocalEdges,
  tileWorld,
  tileLocal,
} from "@sidereal/content/bow-profiles";
import {
  volumeGeometry,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import type { PrefabStructureTile } from "@sidereal/content/construction";
export type { PrefabStructureTile } from "@sidereal/content/construction";

function on(a: Pt, b: Pt, p: Pt): boolean {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    l = dx * dx + dy * dy;
  return (
    l > 1e-12 &&
    Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) < 1e-6 &&
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l >= -1e-7 &&
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l <= 1 + 1e-7
  );
}
export function derivePrefabStructure(
  doc: ShipPrefabDocumentV1,
): PrefabStructureTile[] {
  return doc.volumes.flatMap((v) => {
    const g = volumeGeometry(v);
    const loops = g.outline ? [g.outline.outer, ...g.outline.holes] : [];
    return v.tiles
      .filter((t) => t.bow)
      .map((tile) => {
        const footprint = placedTilePolygon(tile);
        const pressure = bowLocalEdges(tile)
          .map(([a, b]) => [tileWorld(tile, a), tileWorld(tile, b)] as [Pt, Pt])
          .filter(([a, b]) =>
            loops.some((r) =>
              r.some(
                (p, i) =>
                  on(p, r[(i + 1) % r.length], a) &&
                  on(p, r[(i + 1) % r.length], b),
              ),
            ),
          )
          .map(([a, b]) => ({
            a,
            b,
            seals: true as const,
            material: "primary" as const,
          }));
        return {
          volume: v.id,
          tile,
          height: v.height,
          footprint,
          envelope: footprint.map((at) => {
            const [keel, roof] = bowHeights(tile, v.height, at);
            return { at, keel, roof };
          }),
          pressure,
          roofSeals: true as const,
          roofMaterial: bowGlass(tile)
            ? ("glass" as const)
            : ("primary" as const),
        };
      });
  });
}
/** Surface material at a world-space sample. Continuous point query for structural surfaces.
 * Voxel adapters must conservatively intersect thin surfaces rather than sample centres.
 * Glass occupies a framed roof inset and seals exactly as the armoured roof does.
 */
export function prefabStructureMaterial(
  s: PrefabStructureTile,
  at: readonly [number, number, number],
): "primary" | "secondary" | "accent" | "trim" | "glass" | null {
  const xy: Pt = [at[0], at[1]];
  if (!insidePolygon(s.footprint, ...xy)) return null;
  const [lo, hi] = bowHeights(s.tile, s.height, xy),
    z = at[2] * 16;
  const [floor, roof] = G.bowProfiles.shellThicknessTexels[s.height];
  if (z < lo || z > hi) return null;
  if (z <= lo + floor) return "secondary";
  if (z >= hi - roof) {
    if (s.roofMaterial === "glass") {
      const [x, y] = tileLocal(s.tile, xy);
      if (
        x > 1.35 / 16 &&
        x < 1 - 1.35 / 16 &&
        y > 1.35 / 16 &&
        y < 1 - 1.35 / 16
      )
        return z >= hi - 0.8 && z <= hi - 0.45 ? "glass" : null;
      return "trim";
    }
    return "primary";
  }
  const lp = tileLocal(s.tile, xy);
  for (const e of s.pressure) {
    const a = tileLocal(s.tile, e.a),
      b = tileLocal(s.tile, e.b);
    const index = bowLocalEdges(s.tile).findIndex(
      ([p, q]) =>
        Math.hypot(p[0] - a[0], p[1] - a[1]) +
          Math.hypot(q[0] - b[0], q[1] - b[1]) <
        1e-6,
    );
    if (
      index >= 0 &&
      insidePolygon(bowWallPolygon(s.tile.shape, index), ...lp)
    ) {
      const f = (z - lo - floor) / (hi - roof - lo - floor);
      if (f >= 0.24 && f <= 0.36) return "accent";
      if (f > 0.36 && f < 0.43) return "trim";
      if (
        [1, 2].includes(s.tile.bow!.step) &&
        ["deck", "pod", "cabin"].includes(s.height) &&
        f >= 0.5
      ) {
        if (f <= 0.55 || f >= 0.94) return "trim";
        const edges = bowLocalEdges(s.tile),
          [a, b] = edges[index];
        const prev = edges[(index - 1 + edges.length) % edges.length][0];
        const next = edges[(index + 1) % edges.length][1];
        const angled = (p: Pt, q: Pt) =>
          Math.abs(p[0] - q[0]) > 1e-8 && Math.abs(p[1] - q[1]) > 1e-8;
        const inset = Math.min(
          0.22,
          0.85 / 16 / Math.hypot(b[0] - a[0], b[1] - a[1]),
        );
        const u0 = angled(a, b) && angled(prev, a) ? 0 : inset;
        const u1 = angled(a, b) && angled(b, next) ? 1 : 1 - inset;
        const wall = bowWallPolygon(s.tile.shape, index);
        const mix = (a: Pt, b: Pt, t: number): Pt => [
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
        ];
        const pane = [
          mix(wall[0], wall[1], u0),
          mix(wall[0], wall[1], u1),
          mix(wall[3], wall[2], u1),
          mix(wall[3], wall[2], u0),
        ];
        return insidePolygon(pane, ...lp) ? "glass" : "trim";
      }
      return "primary";
    }
  }
  return null;
}
