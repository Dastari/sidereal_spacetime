import type { ViewState } from "./state";

/** Defaults apply on a mode transition, never on a document edit or camera move. */
export function enterEditorMode(
  view: ViewState,
  mode: ViewState["mode"],
): ViewState {
  if (view.mode === mode) return view;
  const schematic =
    mode === "Structure" || mode === "Rooms" || mode === "Systems";
  return {
    ...view,
    mode,
    projection: schematic ? "Top" : view.projection,
    layers: {
      ...view.layers,
      floor: true,
      walls: true,
      roof: false,
      labels: true,
      routes: mode === "Systems",
      objects: !schematic || mode === "Systems",
      exteriorHull: !schematic,
    },
  };
}

/** Entering a structural tool also restores its working plane after manual orbit. */
export function enterStructuralTool(view: ViewState): ViewState {
  return {
    ...view,
    projection: "Top",
    layers: {
      ...view.layers,
      floor: true,
      walls: true,
      roof: false,
      objects: false,
      routes: false,
      exteriorHull: false,
    },
  };
}

export function layoutPreviewPolicy(view: ViewState) {
  return {
    layers: {
      floors: view.layers.floor && view.mode !== "Systems",
      walls: view.layers.walls && view.mode !== "Systems",
      roof: view.layers.roof,
      objects: view.layers.objects,
      exteriorHull: view.layers.exteriorHull !== false,
    },
    suppressEquipmentSolids: view.mode === "Systems",
  };
}
