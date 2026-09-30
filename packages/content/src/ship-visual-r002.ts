/** Reference r002 recipes are isolated from the delivered r001 profile table. */
import type { ShipVisualProfile, ShipVisualProfileId } from "./ship-visual";
import { volumeGeometry, type ShipPrefabDocumentV1 } from "./ship-prefab";
import { insidePolygon } from "./construction-grammar";

/** One opt-in footprint for both displayed wing markings and their roof exclusions. */
export function referencePlateDecals<
  T extends {
    kind: string;
    normal: readonly number[];
    corners: [number, number, number][];
  },
>(doc: ShipPrefabDocumentV1, decals: T[], revision?: string): T[] {
  if (revision !== "r002") return decals;
  const plates = doc.volumes
    .filter((v) => v.kind === "plate")
    .map(volumeGeometry);
  return decals.map((d) => {
    if (d.normal[2] < 0.99 || !["number", "emblem"].includes(d.kind)) return d;
    const centre = d.corners.reduce<number[]>(
      (a, p) => a.map((n, i) => n + p[i] / d.corners.length),
      [0, 0, 0],
    );
    if (
      !plates.some(
        (g) =>
          g.outline &&
          insidePolygon(g.outline.outer, centre[0], centre[1]) &&
          !g.outline.holes.some((h) => insidePolygon(h, centre[0], centre[1])),
      )
    )
      return d;
    return {
      ...d,
      corners: d.corners.map((p) => [
        centre[0] + (p[0] - centre[0]) * 0.6,
        centre[1] + (p[1] - centre[1]) * 0.6,
        p[2],
      ]),
    };
  });
}

export const SHIP_VISUAL_PROFILES_R002: Record<
  ShipVisualProfileId,
  ShipVisualProfile
> = {
  federation: {
    id: "federation",
    revision: "r002",
    course: 32,
    rib: 64,
    relief: 2,
    offsetCourses: false,
    nestedRibs: false,
  },
  riftjack: {
    id: "riftjack",
    revision: "r002",
    course: 40,
    rib: 48,
    relief: 2,
    offsetCourses: true,
    nestedRibs: false,
  },
  aurelian: {
    id: "aurelian",
    revision: "r002",
    course: 56,
    rib: 48,
    relief: 2,
    offsetCourses: true,
    nestedRibs: true,
  },
};
