import type { PartAsset } from "./assembly";
import { isExteriorAsset } from "./layout-asset-scope";

/** Cosmetic sRGB paint on a placed component. Absence preserves authored colours. */
export interface HullPaint {
  primary?: string;
  secondary?: string;
}
export function validateHullPaint(
  value: unknown,
): asserts value is HullPaint | undefined {
  if (value === undefined) return;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.entries(value).some(
      ([key, color]) =>
        !["primary", "secondary"].includes(key) ||
        typeof color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(color),
    )
  )
    throw Error("Paint colours must be six-digit hex colours");
}
export function canPaintHullAsset(asset: PartAsset): boolean {
  return (
    isExteriorAsset(asset) ||
    asset.visual?.designId === "shipyard.wayfarer.framed.hull" ||
    asset.category === "engine" ||
    /\bthruster\b/i.test(asset.label)
  );
}
export function hullPaintKey(paint?: HullPaint): string {
  return `${paint?.primary?.toLowerCase() ?? ""}/${paint?.secondary?.toLowerCase() ?? ""}`;
}
export function hasHullPaint(paint?: HullPaint): boolean {
  return !!(paint?.primary || paint?.secondary);
}
