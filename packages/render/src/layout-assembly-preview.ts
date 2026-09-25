import { layoutPlaneClip } from "./layout-plane-clip";
import { type LayoutPreviewPolicy } from "./layout-preview-policy";
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
  let floorNotes: string[] = [],
    wallNotes: string[] = [];
  const view = createHullViewport(
    canvas,
    catalog,
    {
      select: () => {},
      move: () => {},
      place: () => {},
      status: (message) => report(`${message} · ${floorStatus}`),
      viewChanged,
      floorFit: (notes) => {
        floorNotes = notes;
        wallFit?.([...floorNotes, ...wallNotes]);
      },
      wallFit: (notes) => {
        wallNotes = notes;
        wallFit?.([...floorNotes, ...wallNotes]);
      },
    },
    initialCamera,
    initialProjection,
  );
  let lastId = "";
  return {
    getCamera: view.getCamera,
    planeTransform: view.planeTransform,
    planeClip: (matrix: readonly number[]) =>
      layoutPlaneClip(matrix, canvas.clientWidth, canvas.clientHeight),
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
      const slabCount = doc.tiles.filter((t) => t.deckId === deck).length;
      floorStatus = `${slabCount} shaped floor slabs`;
      canvas.dataset.supplementalFloors = "0";
      floorNotes = [];
      wallFit?.([...floorNotes, ...wallNotes]);
      const activeDeck = doc.decks.find((d) => d.id === deck);
      view.update({
        parts: layoutVisualParts(doc, catalog),
        selected: "",
        floorSlabs: { document: doc, deckId: deck },
        visible,
        preview,
        lockTop: preview?.lockTop,
        tool: "orbit",
        assetId: "",
        height: 0,
        snap: 1 / 32,
        blocked: true,
        projection,
        // Once the camera tilts, the SVG plan is withdrawn and the scene
        // supplies the grid and hull boundary that plan views draw as vectors.
        gridWhenTilted: true,
        hullEnvelope: doc.structure
          ? {
              origin: [
                doc.structure.hull.origin[0],
                doc.structure.hull.origin[1],
              ],
              width: doc.structure.hull.width,
              length: doc.structure.hull.length,
            }
          : undefined,
        suppressNativeWalls:
          !doc.structure &&
          layoutVisualParts(doc, catalog).some(
            (p) =>
              catalog.assets.find((a) => a.id === p.assetId)?.category ===
              "wall",
          ),
        insetPreview:
          doc.structure?.schema === "sidereal.layout-structure.v2"
            ? { document: doc, compiled: result, deckId: deck }
            : undefined,
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
          fingerprint: `${result.fingerprint}:${deck}:${showFloor}`,
          tiles: result.tiles.filter((t) => t.deckId === deck),
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
