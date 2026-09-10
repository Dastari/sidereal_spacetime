import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  type ConstructionDocument,
  type ConstructionFloor,
} from "@sidereal/content/construction";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { PINNED_FLOOR_KIT, FLOOR_KIT_HASH } from "./construction-transactions";
import { matchNativeFloorTile } from "./layout-native-floor";
/** Match explicit semantic floor polygons to approved nominal shapes. This never infers
 * walkable floor from arbitrary visual meshes, nor changes the authored document. */
export function bindConstructionLayout(layout: LayoutDocument): {
  document: ConstructionDocument;
  unmatched: string[];
} {
  const floors: ConstructionFloor[] = [],
    unmatched: string[] = [];
  for (const tile of layout.tiles) {
    const deck = layout.decks.find((d) => d.id === tile.deckId);
    const found = deck
      ? matchNativeFloorTile(
          tile,
          deck.elevation,
          layout.structure?.tileStyles[tile.id]?.model,
        )
      : null;
    if (found) floors.push(found);
    else unmatched.push(tile.id);
  }
  return {
    document: {
      schema: CONSTRUCTION_SCHEMA,
      compiler: CONSTRUCTION_COMPILER,
      layout: structuredClone(layout),
      floorKit: {
        id: PINNED_FLOOR_KIT.id,
        revision: PINNED_FLOOR_KIT.revision,
        sha256: FLOOR_KIT_HASH,
      },
      floors,
    },
    unmatched,
  };
}
