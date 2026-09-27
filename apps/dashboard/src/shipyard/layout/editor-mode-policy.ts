import type { ViewState } from "./state";

/** Modes choose editing tools. Visibility belongs to the document's shared view. */
export function enterEditorMode(
  view: ViewState,
  mode: ViewState["mode"],
): ViewState {
  if (view.mode === mode && (mode !== "Structure" || view.projection === "Top"))
    return view;
  return {
    ...view,
    mode,
    projection:
      mode === "Structure" || mode === "Systems" ? "Top" : view.projection,
  };
}

/** Structural tools always use the top working plane and preserve visible context. */
export function enterStructuralTool(view: ViewState): ViewState {
  return {
    ...view,
    projection: "Top",
  };
}

export function layoutPreviewPolicy(view: ViewState) {
  return {
    lockTop: view.mode === "Structure",
    layers: {
      floors: view.layers.floor,
      walls: view.layers.walls,
      roof: view.layers.roof,
      objects: view.layers.objects,
      exteriorHull: view.layers.exteriorHull !== false,
    },
    suppressEquipmentSolids: view.mode === "Systems",
  };
}
