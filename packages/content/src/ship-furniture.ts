/**
 * Visuals for derived deck-object sockets (`DerivedSocket.designId`, from the room types in
 * construction-grammar.v1.json). Presentation only: sockets carry no authority.
 *
 * Every design maps to a SHIPS-COMPONENTS interior object GLB (ship-objects r001, Blender-authored,
 * `scripts/art_library/ship_object_art.py`): footprint-centred on the floor, front +Y (turned to
 * the socket facing by the renderer). Unmapped designs keep the renderer's placeholder box.
 * Proposal art, not owner-approved.
 */
export const SHIP_OBJECT_ART_REVISION = "r001";

/** Socket design ids with a published object GLB. */
export const DECK_OBJECT_DESIGNS: readonly string[] = [
  "cargo.fluid.medium",
  "cargo.standard.medium",
  "pale-studless.console.standard",
  "pale-studless.kitchen.standard",
  "pale-studless.table.standard",
  "shipyard.equipment.bridge-bank",
  "shipyard.equipment.command-console",
  "shipyard.equipment.crew-bunk",
  "shipyard.equipment.hydroponics",
  "shipyard.equipment.lounge-sofa",
  "shipyard.equipment.medical-bed",
  "shipyard.equipment.pilot-seat",
  "shipyard.equipment.reactor",
  "shipyard.equipment.wall-locker",
];

/**
 * Facing convention for everything placed inside a ship (interior modules and derived deck
 * objects), 2026-09-28:
 * - Crew stations (seats, consoles, helms, banks): `facing` is the direction the crew member
 *   looks while using it. A helm "fore" puts the pilot looking at the bow.
 * - Everything else (storage, bunks, machinery): `facing` is the side it is used from, i.e. the
 *   side that faces into the room.
 * Every interior GLB is authored with its access side (where the user stands or sits) at +Y. For
 * seats that is also the view direction. At a console the operator stands on the +Y side and
 * looks toward -Y, so console-type art turns half a revolution to face its `facing`.
 */
const OPERATOR_FACES_ART_BACK: readonly string[] = [
  "pale-studless.console.standard",
  "shipyard.equipment.bridge-bank",
  "shipyard.equipment.command-console",
];

/** Extra quarter turns (counter-clockwise, 0 or 2) from `facing` to an interior GLB's +Y axis.
 * `id` is a deck-object design id or a ship component id. */
export function interiorArtQuarterTurns(id: string): 0 | 2 {
  return id.startsWith("console.") || OPERATOR_FACES_ART_BACK.includes(id)
    ? 2
    : 0;
}

/** Designs whose `facing` names the operator's view (see the convention above). */
export function isCrewStationDesign(id: string): boolean {
  return (
    interiorArtQuarterTurns(id) === 2 || id === "shipyard.equipment.pilot-seat"
  );
}

/** GLB URL for a deck-object design, or null when it keeps the placeholder. */
export function deckObjectVisualUrl(designId: string): string | null {
  return DECK_OBJECT_DESIGNS.includes(designId)
    ? `/assets/ship-objects/${SHIP_OBJECT_ART_REVISION}/${designId}.glb`
    : null;
}
