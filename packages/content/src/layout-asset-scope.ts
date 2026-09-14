import type { PartAsset } from "./assembly";

/** Editing role is independent of the legacy render category. Cockpit glazing
 * and shell modules were historically tagged wall/roof but are exterior parts. */
export function isExteriorAsset(asset: PartAsset): boolean {
  return (
    asset.category === "superstructure" ||
    asset.visual?.designId === "shipyard.hull.pilot-section" ||
    asset.visual?.designId === "shipyard.hull.side-armor" ||
    asset.visual?.designId === "shipyard.roof.frontier"
  );
}
/** Objects includes engines and thrusters even when physically outside the hull. */
export function isObjectAsset(asset: PartAsset): boolean {
  return (
    !isExteriorAsset(asset) &&
    ["equipment", "cargo", "decoration", "engine"].includes(asset.category)
  );
}
/** Compatibility name for consumers of the original interior-only palette. */
export const isInteriorAsset = isObjectAsset;
export function isStructuralAsset(asset: PartAsset): boolean {
  return (
    !isExteriorAsset(asset) &&
    ["floor", "wall", "roof"].includes(asset.category)
  );
}
