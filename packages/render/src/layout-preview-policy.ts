import type { PartCategory } from "@sidereal/content/assembly";

export interface LayoutPreviewLayers {
  walls: boolean;
  floors: boolean;
  roof: boolean;
  objects: boolean;
  exteriorHull: boolean;
}
export interface LayoutPreviewPolicy {
  layers?: Partial<LayoutPreviewLayers>;
  /** Schematic footprints/ports are drawn by the editor, not these solid meshes. */
  suppressEquipmentSolids?: boolean;
}
const layers: Record<PartCategory, keyof LayoutPreviewLayers> = {
  wall: "walls",
  floor: "floors",
  roof: "roof",
  superstructure: "exteriorHull",
  engine: "exteriorHull",
  decoration: "objects",
  equipment: "objects",
  cargo: "objects",
};
export function layoutPartVisible(
  category: PartCategory | undefined,
  visible: ReadonlySet<PartCategory>,
  policy?: LayoutPreviewPolicy,
): boolean {
  if (!category || !visible.has(category)) return false;
  if (policy?.layers?.[layers[category]] === false) return false;
  return !(
    policy?.suppressEquipmentSolids &&
    (category === "equipment" || category === "cargo" || category === "engine")
  );
}
