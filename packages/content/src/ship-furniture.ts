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

/** GLB URL for a deck-object design, or null when it keeps the placeholder. */
export function deckObjectVisualUrl(designId: string): string | null {
  return DECK_OBJECT_DESIGNS.includes(designId)
    ? `/assets/ship-objects/${SHIP_OBJECT_ART_REVISION}/${designId}.glb`
    : null;
}
