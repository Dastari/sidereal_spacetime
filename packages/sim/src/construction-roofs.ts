import { planNativeStairRoofs } from "./construction-stairs-document";
import { validateNativeTraversalRoomDocument } from "./construction-traversal-document";
import type { ConstructionDocument } from "@sidereal/content/construction";
import {
  CONSTRUCTION_ROOF_INTERFACES as kit,
  type ConstructionRoofPlacement,
} from "@sidereal/content/construction-roof";
import floorKit from "@sidereal/content/construction-floor-interfaces.json";
import { transformPoint, type Point } from "@sidereal/content/ship-layout";
import {
  positiveOverlap,
  stableStringify,
  canonicalPolygon,
} from "./layout-geometry";

/** Compile matching native roof geometry only. Contact geometry is not a seal rating. */
export function planNativeRoofs(
  document: Pick<ConstructionDocument, "layout" | "floors"> &
    Partial<ConstructionDocument>,
  deckId: string,
): ConstructionRoofPlacement[] {
  if (document.stairRoom)
    return planNativeStairRoofs(document as ConstructionDocument, deckId);
  const traversal = document.traversalRoom
    ? validateNativeTraversalRoomDocument(document as ConstructionDocument)
    : undefined;
  const deck = document.layout.decks.find((d) => d.id === deckId);
  if (!deck) throw Error("Unknown roof deck");
  if (!deck.roof) return [];
  if (deck.ceiling !== kit.datumsUnits.roofUnderside)
    throw Error("Pinned native roof requires its exact ceiling datum");
  const floors = document.floors.filter(
    (f) =>
      f.deckId === deckId &&
      !(
        traversal?.lowerDeckId === deckId &&
        f.origin[0] === 64 &&
        f.origin[1] === 64
      ),
  );
  return floors.map((floor) => {
    const part = kit.parts.find((p) => p.id === floor.partId);
    const paired = floorKit.parts.find((p) => p.id === floor.partId);
    if (
      !part ||
      !paired ||
      floor.reflected ||
      !part.quarterTurns.includes(floor.quarterTurns) ||
      floor.origin[2] !== deck.elevation ||
      part.floorPair.sha256 !== paired.native.sha256 ||
      part.floorPair.assetId !== paired.native.assetId ||
      stableStringify(canonicalPolygon(part.footprintUnits as Point[])) !==
        stableStringify(canonicalPolygon(paired.footprint as Point[]))
    )
      throw Error("Roof requires an exact paired native floor transform");
    const polygon = part.footprintUnits.map((p) => {
      const q = transformPoint(p as Point, floor.quarterTurns);
      return [q[0] + floor.origin[0], q[1] + floor.origin[1]] as Point;
    });
    // The visual envelope is structural clearance, not an invented service cavity.
    for (const upper of document.layout.decks) {
      if (
        upper.id === deckId ||
        upper.elevation <= deck.elevation ||
        upper.elevation >= deck.elevation + kit.datumsUnits.visualEnvelopeTop
      )
        continue;
      if (
        document.layout.tiles.some(
          (t) => t.deckId === upper.id && positiveOverlap(polygon, t.vertices),
        )
      )
        throw Error("Upper deck intersects the pinned native roof envelope");
    }
    return {
      key: "roof:" + floor.id,
      floorId: floor.id,
      partId: part.id,
      origin: [floor.origin[0], floor.origin[1], deck.elevation + deck.ceiling],
      quarterTurns: floor.quarterTurns,
    };
  });
}
