import type {
  ShipPrefabDocumentV1,
  PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { prefabBedSeats } from "@sidereal/sim/prefab-seats";

/** Render-facing only. Bed metadata comes from the viewer's current admitted prefab document;
 * actor position and seated status still come from private server views. */
export function prefabSeatPresentation(
  ship:
    { doc: ShipPrefabDocumentV1; catalog: PrefabComponentCatalog } | undefined,
  x: number,
  y: number,
):
  | { facing: number; lift: number; lean: number; footSupport: number }
  | undefined {
  const bed =
    ship &&
    prefabBedSeats(ship.doc, ship.catalog).find(
      (bed) => Math.hypot(bed.seatX - x, bed.seatY - y) < 1e-4,
    );
  // Both published r005 bodies: actual seated pelvis underside .301635 m.
  // A 25-degree spine perch clears the lower bunk's upper berth; existing leg IK holds soles.
  return bed
    ? {
        facing: bed.facing,
        lift: bed.supportHeight - 0.3,
        lean: bed.supportHeight === 0.375 ? (-25 * Math.PI) / 180 : 0,
        footSupport: 0,
      }
    : undefined;
}
