import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { readLayout } from "@sidereal/sim/layout-validation";

/** Preserve deck positions and authored attachments; geometric conflicts remain diagnostics. */
export function editDeckClearHeight(
  doc: LayoutDocument,
  deckId: string,
  clearHeight: number,
): LayoutDocument {
  const structure = doc.structure;
  if (structure?.schema !== "sidereal.layout-structure.v2")
    throw Error("Explicit clear height requires a v2 deck profile.");
  const profile = structure.deckProfiles.find((p) => p.deckId === deckId);
  if (!profile || !doc.decks.some((d) => d.id === deckId))
    throw Error("The selected deck has no vertical profile.");
  if (!Number.isSafeInteger(clearHeight) || clearHeight <= 0)
    throw Error("Clear height must be a positive multiple of 1/32 m.");
  const next: LayoutDocument = {
    ...doc,
    decks: doc.decks.map((deck) =>
      deck.id === deckId
        ? { ...deck, ceiling: profile.floorThickness + clearHeight }
        : deck,
    ),
    structure: {
      ...structure,
      deckProfiles: structure.deckProfiles.map((p) =>
        p.deckId === deckId
          ? {
              ...p,
              clearHeight,
              pitch:
                p.floorThickness +
                clearHeight +
                p.roofThickness +
                p.serviceVoid,
            }
          : p,
      ),
    },
  };
  // Includes the retained legacy ceiling admission bound; no implicit relaxation.
  readLayout(next);
  return next;
}
