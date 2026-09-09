import { layoutNativeFloors } from "./layout-native-floors";
/** The other layout modes inspect the same editable assembly; Hull owns its gestures. */
import { createHullViewport } from "./layout-hull";
import { PART_CATEGORIES, type PartCatalog } from "../../content/src/assembly";
import { layoutVisualParts } from "../../content/src/layout-assembly";
import type { LayoutDocument } from "../../content/src/ship-layout";
import type { CompiledLayout } from "../../sim/src/layout-compiler";
export function createAssemblyLayoutPreview(
  canvas: HTMLCanvasElement,
  catalog: PartCatalog,
  report: (s: string) => void,
) {
  let floorStatus = "Native floors pending";
  const view = createHullViewport(canvas, catalog, {
    select: () => {},
    move: () => {},
    place: () => {},
    status: (message) => report(`${message} · ${floorStatus}`),
  });
  let lastId = "";
  return {
    update(
      doc: LayoutDocument,
      result: CompiledLayout,
      deck: string,
      roof: boolean,
      projection: string,
      _catalog?: PartCatalog,
      showFloor = true,
    ) {
      const native = layoutNativeFloors(doc, catalog, deck, showFloor);
      floorStatus = `${native.parts.length} native floors${native.unmatched.length ? ` · ${native.unmatched.length} unmatched draft floors` : ""}`;
      const unmatched = new Set(native.unmatched);
      view.update({
        parts: [...layoutVisualParts(doc, catalog), ...native.parts],
        selected: "",
        visible: new Set(PART_CATEGORIES.filter((c) => c !== "roof" || roof)),
        tool: "orbit",
        assetId: "",
        height: 0,
        snap: 1 / 32,
        blocked: true,
        projection,
        floor: {
          ...result,
          fingerprint: `${result.fingerprint}:${deck}:${showFloor}:${native.unmatched.join(",")}`,
          tiles: result.tiles.filter(
            (t) => t.deckId === deck && unmatched.has(t.id),
          ),
        },
      });
      if (lastId !== doc.id) {
        lastId = doc.id;
        void view.ready().then(() => view.fit());
      }
    },
    dispose: () => view.dispose(),
  };
}
