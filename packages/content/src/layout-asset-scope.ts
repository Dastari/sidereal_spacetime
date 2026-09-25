import type { PartAsset } from "./assembly";

/** Editing role is independent of the legacy render category. Cockpit glazing
 * and shell modules were historically tagged wall/roof but are exterior parts. */
export function isExteriorAsset(asset: PartAsset): boolean {
  return asset.category === "superstructure" || asset.category === "engine" ||
    asset.visual?.designId === "shipyard.hull.pilot-section" ||
    asset.visual?.designId === "shipyard.hull.side-armor" ||
    asset.visual?.designId === "shipyard.roof.frontier";
}
export function isInteriorAsset(asset: PartAsset): boolean {
  return !isExteriorAsset(asset) && ["equipment", "cargo", "decoration"].includes(asset.category);
}
export function isStructuralAsset(asset: PartAsset): boolean {
  return !isExteriorAsset(asset) && ["floor", "wall", "roof"].includes(asset.category);
}
