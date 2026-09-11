import {
  layoutPartVisible,
  type LayoutPreviewPolicy,
} from "./layout-preview-policy";
import { layoutNativeFloors } from "./layout-native-floors";
/** The other layout modes inspect the same editable assembly; Hull owns its gestures. */
import { createHullViewport, type HullCameraState } from "./layout-hull";
import { PART_CATEGORIES, type PartCatalog } from "@sidereal/content/assembly";
import { layoutVisualParts } from "@sidereal/content/layout-assembly";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
export function createAssemblyLayoutPreview(
  canvas: HTMLCanvasElement,
  catalog: PartCatalog,
  report: (s: string) => void,
  initialCamera?: HullCameraState,
  initialProjection?: string,
  viewChanged?: () => void,
  wallFit?: (notes: string[]) => void,
) {
  let floorStatus = "Native floors pending";
  const view = createHullViewport(
    canvas,
    catalog,
    {
      select: () => {},
      move: () => {},
      place: () => {},
      status: (message) => report(`${message} · ${floorStatus}`),
      viewChanged,
      wallFit,
    },
    initialCamera,
    initialProjection,
  );
  let lastId = "";
  return {
    getCamera: view.getCamera,
    planeTransform: view.planeTransform,
    floorPoint: view.floorPoint,
    fit: view.fit,
    zoom: view.zoom,
    orbit: view.orbit,
    pan: view.pan,
    update(
      doc: LayoutDocument,
      result: CompiledLayout,
      deck: string,
      roof: boolean,
      projection: string,
      _catalog?: PartCatalog,
      showFloor = true,
      preview?: LayoutPreviewPolicy,
    ) {
      const visible = new Set(
        PART_CATEGORIES.filter(
          (c) => (c !== "roof" || roof) && (c !== "floor" || showFloor),
        ),
      );
      const native = layoutNativeFloors(
        doc,
        catalog,
        deck,
        layoutPartVisible("floor", visible, preview),
      );
      floorStatus = `${native.parts.length} native floors${native.unmatched.length ? ` · ${native.unmatched.length} unmatched draft floors` : ""}`;
      const unmatched = new Set(native.unmatched);
      const activeDeck = doc.decks.find((d) => d.id === deck);
      view.update({
        parts: [...layoutVisualParts(doc, catalog), ...native.parts],
        selected: "",
        contextOnly: new Set(native.parts.map((p) => p.id)),
        visible,
        preview,
        tool: "orbit",
        assetId: "",
        height: 0,
        snap: 1 / 32,
        blocked: true,
        projection,
        suppressNativeWalls:
          !doc.structure &&
          layoutVisualParts(doc, catalog).some(
            (p) =>
              catalog.assets.find((a) => a.id === p.assetId)?.category ===
              "wall",
          ),
        structuralGuide: activeDeck
          ? {
              walls: result.walls,
              deckId: deck,
              elevationUnits: activeDeck.elevation,
              heightUnits: activeDeck.ceiling,
            }
          : undefined,
        floor: {
          ...result,
          bounds:
            !result.tiles.some((tile) => tile.deckId === deck) && doc.structure
              ? {
                  min: [
                    doc.structure.hull.origin[0],
                    doc.structure.hull.origin[1],
                  ],
                  max: [
                    doc.structure.hull.origin[0] + doc.structure.hull.width,
                    doc.structure.hull.origin[1] + doc.structure.hull.length,
                  ],
                }
              : result.bounds,
          fingerprint: `${result.fingerprint}:${deck}:${showFloor}:${native.unmatched.join(",")}`,
          tiles: result.tiles.filter(
            (t) => t.deckId === deck && unmatched.has(t.id),
          ),
        },
      });
      if (lastId !== doc.id) {
        const first = !lastId;
        lastId = doc.id;
        if (!first || !initialCamera) void view.ready().then(() => view.fit());
      }
    },
    dispose: () => view.dispose(),
  };
}
