import type { ShipPrefabDocumentV1 } from "./ship-prefab";
import { shipAccessDoorVariant } from "./ship-access-doors";
import { WAYFARER_ACCESS_DOORS } from "./wayfarer-access-profile";

const IDS = new Set([
  "fed.s.wren-fleet",
  "fed.s.petrel-fleet",
  "fed.m.wayfarer-fleet",
  "fed.m.heron-fleet",
  "fed.l.kestrel-fleet",
  "fed.l.albatross-fleet",
]);
export const isFleetAccessPrefab = (
  doc: Pick<ShipPrefabDocumentV1, "id" | "revision">,
) => doc.revision === 1 && IDS.has(doc.id);

/** The same immutable native aperture used by the renderer; legacy pins keep their clearances. */
export function fleetAccessDoorClearance(
  doc: Pick<ShipPrefabDocumentV1, "id" | "revision">,
  mountId: string,
) {
  if (!isFleetAccessPrefab(doc)) return undefined;
  if (mountId !== "personnel-outer" && mountId !== "cargo-outer")
    return undefined;
  return shipAccessDoorVariant(
    mountId === "cargo-outer" ? "cargo.4m" : "personnel",
    WAYFARER_ACCESS_DOORS,
  );
}
