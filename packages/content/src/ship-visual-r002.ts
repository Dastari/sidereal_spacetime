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

/** Finite manufacturing dimensions, in global lattice cells. These are presentation
 * inputs, not equipment statistics. Their actual values enter the r002 profile hash. */
export interface ShipVisualMacroProfile {
  armorSection: number;
  corner: number;
  bindingHeight: number;
  ventWidth: number;
  ventHeight: number;
  accessWidth: number;
  roofShoulder: number;
  wallTasks: Record<
    "engineering" | "bridge" | "quarters" | "living",
    {
      width: number;
      height: number;
      bottom: number;
      insert: "vent" | "control" | "access";
    }
  >;
}
export const SHIP_VISUAL_MACRO_PROFILES_R002: Record<
  ShipVisualProfileId,
  ShipVisualMacroProfile
> = {
  federation: {
    armorSection: 32,
    corner: 2,
    bindingHeight: 3,
    ventWidth: 13,
    ventHeight: 8,
    accessWidth: 15,
    roofShoulder: 3,
    wallTasks: {
      engineering: { width: 21, height: 17, bottom: 3, insert: "vent" },
      bridge: { width: 19, height: 16, bottom: 5, insert: "control" },
      quarters: { width: 18, height: 15, bottom: 4, insert: "access" },
      living: { width: 20, height: 13, bottom: 4, insert: "access" },
    },
  },
  riftjack: {
    armorSection: 36,
    corner: 2,
    bindingHeight: 3,
    ventWidth: 14,
    ventHeight: 8,
    accessWidth: 16,
    roofShoulder: 3,
    wallTasks: {
      engineering: { width: 22, height: 17, bottom: 3, insert: "vent" },
      bridge: { width: 19, height: 16, bottom: 5, insert: "control" },
      quarters: { width: 18, height: 14, bottom: 4, insert: "access" },
      living: { width: 20, height: 13, bottom: 4, insert: "access" },
    },
  },
  aurelian: {
    armorSection: 40,
    corner: 3,
    bindingHeight: 3,
    ventWidth: 14,
    ventHeight: 9,
    accessWidth: 17,
    roofShoulder: 3,
    wallTasks: {
      engineering: { width: 21, height: 17, bottom: 3, insert: "vent" },
      bridge: { width: 20, height: 16, bottom: 5, insert: "control" },
      quarters: { width: 19, height: 15, bottom: 4, insert: "access" },
      living: { width: 21, height: 13, bottom: 4, insert: "access" },
    },
  },
};
