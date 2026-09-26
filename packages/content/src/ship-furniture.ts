/**
 * Visuals for derived deck-object sockets (`DerivedSocket.designId`, from the room types in
 * construction-grammar.v1.json). Presentation only: sockets carry no authority.
 *
 * A design either reuses a published ship-component GLB (same interior frame) or a deck-furniture
 * GLB from `scripts/art_library/ship_furniture_export.py`. Both are proposal art.
 * Unmapped designs keep the renderer's placeholder box.
 */
import { componentVisualUrl } from "./ship-prefab-catalog";

export const SHIP_FURNITURE_ART_REVISION = "r001";
export const furnitureVisualUrl = (id: string) => `/assets/ship-furniture/${SHIP_FURNITURE_ART_REVISION}/${id}.glb`;

type DeckObjectVisual = { furniture: string } | { component: string };

export const DECK_OBJECT_VISUALS: Readonly<Record<string, DeckObjectVisual>> = {
  "shipyard.equipment.wall-locker": { furniture: "wall-locker" },
  "shipyard.equipment.bridge-bank": { furniture: "bridge-bank" },
  "shipyard.equipment.pilot-seat": { furniture: "pilot-seat" },
  "shipyard.equipment.lounge-sofa": { furniture: "lounge-sofa" },
  "shipyard.equipment.medical-bed": { furniture: "medical-bed" },
  "pale-studless.table.standard": { furniture: "table" },
  "pale-studless.kitchen.standard": { furniture: "kitchen" },
  "cargo.standard.medium": { furniture: "cargo-crate" },
  "cargo.fluid.medium": { furniture: "cargo-fluid" },
  "shipyard.equipment.command-console": { component: "console.command.sm" },
  "pale-studless.console.standard": { component: "console.engineering.sm" },
  "shipyard.equipment.crew-bunk": { component: "crew-bunk.sm" },
  "shipyard.equipment.hydroponics": { component: "hydroponics.sm" },
  "shipyard.equipment.reactor": { component: "reactor.sm" },
};

/** GLB URL for a deck-object design, or null when it keeps the placeholder. */
export function deckObjectVisualUrl(designId: string): string | null {
  const v = DECK_OBJECT_VISUALS[designId];
  if (!v) return null;
  return "furniture" in v ? furnitureVisualUrl(v.furniture) : componentVisualUrl(v.component);
}
