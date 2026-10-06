import type { FurnishingOverrides } from "@sidereal/content/wayfarer-furnishings";
import type {
  ShipPrefabDocumentV1,
  PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { G, TEXEL } from "@sidereal/content/construction-grammar";
import { prefabOrigin } from "@sidereal/content/ship-prefab";
import {
  CREW_STUDY_SCALE,
  CREW_STUDY_SEATED_PELVIS_UNDERSIDE_M,
  CREW_STUDY_SEATED_PELVIS_REAR_M,
  CREW_STUDY_PILOT_CHAIR,
} from "@sidereal/content/crew-study";
import { prefabBedSeats } from "@sidereal/sim/prefab-seats";
import { dressShip } from "@sidereal/sim/ship-dresser";

/** Render-facing only. Seat metadata comes from the viewer's current admitted prefab document;
 * actor position and seated status still come from private server views. */
export function prefabSeatPresentation(
  ship:
    | {
        doc: ShipPrefabDocumentV1;
        catalog: PrefabComponentCatalog;
        furnishings?: FurnishingOverrides;
      }
    | undefined,
  x: number,
  y: number,
):
  | {
      facing: number;
      lift: number;
      lean: number;
      footSupport: number;
      forward?: number;
      footForward?: number;
    }
  | undefined {
  const bed =
    ship &&
    prefabBedSeats(ship.doc, ship.catalog, ship.furnishings).find(
      (bed) => Math.hypot(bed.seatX - x, bed.seatY - y) < 1e-4,
    );
  const underside = CREW_STUDY_SEATED_PELVIS_UNDERSIDE_M * CREW_STUDY_SCALE;
  // A 35-degree spine perch clears the lower bunk's upper berth; existing leg IK holds soles.
  if (bed)
    return {
      facing: bed.facing,
      lift: bed.supportHeight - underside,
      lean: bed.supportHeight === 0.375 ? (-35 * Math.PI) / 180 : 0,
      footSupport: 0,
    };
  // Legacy authored Wayfarer has its own integrated command station, not this native chair.
  if (!ship || ship.doc.authoredGameplay) return undefined;
  const [ox, oy] = prefabOrigin(ship.doc);
  const chair = dressShip(ship.doc, { catalog: ship.catalog }).components.find(
    (c) =>
      c.component === "console.navigation.sm" &&
      c.placement.mount.attach === "interior" &&
      Math.hypot(
        -(c.placement.anchor[1] - oy) - x,
        c.placement.anchor[0] - ox - y,
      ) < 1e-4,
  );
  if (!chair) return undefined;
  const p = chair.placement,
    width = p.rect[2] - p.rect[0],
    depth = p.rect[3] - p.rect[1];
  // Same source-preserving envelope fit as fittedObjectMatrix in the actual authored renderer.
  const scale = Math.min(
    1,
    (p.quarterTurns % 2 ? width : depth) / CREW_STUDY_PILOT_CHAIR.width,
    (p.quarterTurns % 2 ? depth : width) / CREW_STUDY_PILOT_CHAIR.depth,
    ((p.z[1] - p.z[0]) * TEXEL) / CREW_STUDY_PILOT_CHAIR.height,
  );
  const supportHeight =
    p.anchorZ * TEXEL +
    CREW_STUDY_PILOT_CHAIR.cushionTop * scale -
    G.deck.floorTopTexels * TEXEL;
  return {
    facing: (p.quarterTurns * Math.PI) / 2,
    lift: supportHeight - underside,
    lean: 0,
    footSupport: CREW_STUDY_PILOT_CHAIR.footBaseTop * scale,
    footForward: CREW_STUDY_PILOT_CHAIR.footBaseForward * scale,
    forward: Math.max(
      0,
      CREW_STUDY_SEATED_PELVIS_REAR_M * CREW_STUDY_SCALE -
        CREW_STUDY_PILOT_CHAIR.cushionRear * scale,
    ),
  };
}
