import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { floorModelOptions } from "@sidereal/sim/layout-native-floor";
import { stampFloor, type FloorStamp } from "./floor-stamps";

/** Only deliberate geometry edits may release an incompatible model override.
 * Loading/importing a draft never calls this: saved pins remain explicit. */
export function reconcileEditedFloorModels(doc: LayoutDocument, ids: string[]) {
  if (!doc.structure) return doc;
  const tileStyles = { ...doc.structure.tileStyles };
  let changed = false;
  for (const tile of doc.tiles) {
    const style = tileStyles[tile.id];
    if (!ids.includes(tile.id) || !style?.model) continue;
    if (
      floorModelOptions(tile, 0).some(
        (p) =>
          p.assetId === style.model!.assetId &&
          p.revision === style.model!.revision,
      )
    )
      continue;
    const { model: _model, ...rest } = style;
    tileStyles[tile.id] = rest;
    changed = true;
  }
  return changed
    ? { ...doc, structure: { ...doc.structure, tileStyles } }
    : doc;
}

export function replaceFloorShape(
  doc: LayoutDocument,
  id: string,
  shape: FloorStamp,
  turns: number,
) {
  return reconcileEditedFloorModels(
    {
      ...doc,
      tiles: doc.tiles.map((t) =>
        t.id === id
          ? {
              ...t,
              ...stampFloor(
                t.id,
                t.deckId,
                shape,
                [
                  Math.min(...t.vertices.map((p) => p[0])),
                  Math.min(...t.vertices.map((p) => p[1])),
                ],
                turns,
              ),
              material: t.material,
            }
          : t,
      ),
    },
    [id],
  );
}
