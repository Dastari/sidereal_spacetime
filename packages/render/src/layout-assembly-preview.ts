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
  const view = createHullViewport(canvas, catalog, {
    select: () => {},
    move: () => {},
    place: () => {},
    status: report,
  });
  let lastId = "";
  return {
    update(
      doc: LayoutDocument,
      result: CompiledLayout,
      _deck: string,
      roof: boolean,
      projection: string,
    ) {
      view.update({
        parts: layoutVisualParts(doc, catalog),
        selected: "",
        visible: new Set(PART_CATEGORIES.filter((c) => c !== "roof" || roof)),
        tool: "orbit",
        assetId: "",
        height: 0,
        snap: 1 / 32,
        blocked: true,
        projection,
        floor: result,
      });
      if (lastId !== doc.id) {
        lastId = doc.id;
        void view.ready().then(() => view.fit());
      }
    },
    dispose: () => view.dispose(),
  };
}
