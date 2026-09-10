import type { PartCatalog, PartPlacement } from "@sidereal/content/assembly";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { bindConstructionLayout } from "@sidereal/sim/construction-layout";
import { PINNED_FLOOR_KIT } from "@sidereal/sim/construction-transactions";

/** Presentation-only native surfaces for semantic polygons. No objects are appended
 * to the saved assembly, and unmatched shapes remain explicitly draft geometry. */
export function layoutNativeFloors(
  doc: LayoutDocument,
  catalog: PartCatalog,
  deckId: string,
  visible = true,
) {
  const parts: PartPlacement[] = [];
  const unmatched: string[] = [];
  if (!visible) return { parts, unmatched };
  const active = {
    ...doc,
    tiles: doc.tiles.filter((t) => t.deckId === deckId),
  };
  const bound = bindConstructionLayout(active);
  unmatched.push(...bound.unmatched);
  const occupied = new Set(doc.assembly?.parts.map((p) => p.id));
  for (const floor of bound.document.floors) {
    const shape = PINNED_FLOOR_KIT.parts.find((p) => p.id === floor.partId)!;
    const native = shape.native;
    const asset = catalog.assets.find((a) => a.id === native.assetId);
    const source = native.sourceToNominal;
    if (occupied.has(floor.id))
      throw Error(
        "Semantic floor identity also exists in the visual assembly: " +
          floor.id,
      );
    if (
      !asset?.visual ||
      asset.category !== "floor" ||
      asset.visual.sha256 !== native.sha256 ||
      `r${String(asset.visual.revision).padStart(3, "0")}` !==
        native.revision ||
      asset.visual.nodePrefix !== native.nodePrefix ||
      floor.reflected ||
      source.reflected
    ) {
      unmatched.push(floor.id);
      continue;
    }
    const angle = (floor.quarterTurns * Math.PI) / 2,
      c = Math.round(Math.cos(angle)),
      s = Math.round(Math.sin(angle));
    const [x, y, z] = source.translation;
    parts.push({
      id: floor.id,
      assetId: native.assetId,
      position: [
        (floor.origin[0] + c * x - s * y) / 32,
        (floor.origin[1] + s * x + c * y) / 32,
        (floor.origin[2] + z) / 32,
      ],
      rotation:
        (((floor.quarterTurns + source.quarterTurns) % 4) * Math.PI) / 2,
      flipped: false,
      removedCells: [],
    });
  }
  return { parts, unmatched };
}
