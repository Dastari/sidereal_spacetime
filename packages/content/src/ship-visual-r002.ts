/** Reference r002 recipes are isolated from the delivered r001 profile table. */
import type { ShipVisualProfile, ShipVisualProfileId } from "./ship-visual";

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
