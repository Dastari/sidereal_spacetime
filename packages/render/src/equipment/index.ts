export type { EquipmentAimSource, GripBasis } from "./anchors";
export {
  applyCrewItemTheme,
  createVoxelItemFx,
  createVoxelItemVisual,
  crewItemHandSocketRotation,
} from "./voxel-items";
import "@babylonjs/loaders/glTF";

/** Visual catalog only: these identifiers confer no inventory or combat rights. */
export const EQUIPMENT_ASSETS = [
  "compact-pistol",
  "heavy-handgun",
  "carbine",
  "long-rifle",
  "plasma-cutter",
  "sample-scanner",
  "medkit",
  "resource-canister",
  "power-cell",
  "supply-crate",
  "utility-backpack",
  "shield-backpack",
] as const;
export type EquipmentAsset = (typeof EQUIPMENT_ASSETS)[number];
