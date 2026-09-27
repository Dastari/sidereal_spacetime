import type { PartAsset } from "@sidereal/content/assembly";
import revision from "./framed-wayfarer-visuals.json";

export interface FramedVisualEntry {
  assetId: string;
  sources: {
    category: PartAsset["category"];
    bounds: PartAsset["bounds"];
    nodes: string[];
    visualSha256: string | null;
  }[];
  visual: NonNullable<PartAsset["visual"]>;
}

export const FRAMED_WAYFARER_VISUALS = revision.entries as FramedVisualEntry[];

/** A presentation revision never edits the catalog used to validate a design.
 * The old physical asset and source pins are checked before selecting the new
 * native surface. An unknown source revision must be explicitly requalified. */
export function framedWayfarerVisual(
  asset: PartAsset,
  entries: readonly FramedVisualEntry[] = FRAMED_WAYFARER_VISUALS,
): PartAsset {
  const entry = entries.find((entry) => entry.assetId === asset.id);
  if (!entry) return asset;
  if (
    asset.visual?.sha256 === entry.visual.sha256 &&
    asset.visual.url === entry.visual.url
  )
    return asset;
  const matches = entry.sources.some(
    (source) =>
      source.category === asset.category &&
      source.visualSha256 === (asset.visual?.sha256 ?? null) &&
      JSON.stringify(source.bounds) === JSON.stringify(asset.bounds) &&
      JSON.stringify(source.nodes) === JSON.stringify(asset.nodes),
  );
  if (!matches) throw Error("Unqualified framed visual source: " + asset.id);
  return { ...asset, visual: entry.visual };
}
