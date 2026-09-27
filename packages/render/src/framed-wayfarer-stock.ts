import type { PartAsset } from "@sidereal/content/assembly";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import source from "./framed-wayfarer-stock.json";
import {
  framedWayfarerVisual,
  FRAMED_WAYFARER_VISUALS,
  type FramedVisualEntry,
} from "./framed-wayfarer-visuals";
import type { ExteriorPlacement, StockExteriorManifest } from "./remote-ships";

export const FRAMED_STOCK_WAYFARER_SOURCE_PINS = Object.freeze(
  source.sourcePins,
);
export const FRAMED_STOCK_WAYFARER_PRESENTATION_ID =
  "framed-stock-wayfarer-r001";

/** Exact public-stock cosmetic plan, after the original manifest validator.
 * This curated source contains only known exterior assets and transforms, never
 * a player's assembly, interior fittings, discovery rows or mutable authority.
 * r003 side transforms cannot be reused for the r005 three-metre mount family.
 */
export function framedStockWayfarerPlacements(
  manifest: StockExteriorManifest,
  entries: readonly FramedVisualEntry[] = FRAMED_WAYFARER_VISUALS,
): ExteriorPlacement[] {
  const expected = source.sourcePins.stockManifestSha256;
  if (
    manifest.assetId !== `stock-wayfarer-exterior:${expected}` ||
    manifest.sha256 !== expected ||
    constructionHash(JSON.stringify(manifest.payload)) !== expected
  )
    throw Error("Unqualified framed stock exterior revision");

  const removed = new Set(source.removedPlacementIds);
  const original = new Map(manifest.payload.placements.map((p) => [p.id, p]));
  const replacements = new Map(source.placements.map((p) => [p.id, p]));
  const native = new Map<string, NonNullable<PartAsset["visual"]>>();
  for (const asset of source.assets as PartAsset[]) {
    if (entries.filter((entry) => entry.assetId === asset.id).length !== 1)
      throw Error("Incomplete framed stock native package: " + asset.id);
    const visual = framedWayfarerVisual(asset, entries).visual;
    if (
      !visual?.url.startsWith("/assets/assembly/native/framed-wayfarer/") ||
      !/^[0-9a-f]{64}$/.test(visual.sha256)
    )
      throw Error("Invalid framed stock native visual: " + asset.id);
    native.set(asset.id, visual);
  }
  const placements: ExteriorPlacement[] = [];
  for (const p of manifest.payload.placements) {
    if (removed.has(p.id) || replacements.has(p.id)) continue;
    placements.push(structuredClone(p));
  }
  for (const p of source.placements) {
    const previous = original.get(p.id);
    const engine = p.id.startsWith("drives-");
    if (
      engine
        ? previous || !manifest.payload.base.meshNames.includes("GEO-" + p.id)
        : !previous
    )
      throw Error("Framed stock source placement missing: " + p.id);
    const visual = native.get(p.assetId)!;
    placements.push({
      id: p.id,
      position: [...p.position] as [number, number, number],
      rotation: p.rotation,
      flipped: p.flipped,
      url: visual.url,
      sha256: visual.sha256,
      ...(visual.nodePrefix ? { nodePrefix: visual.nodePrefix } : {}),
      ...(previous?.decals?.length
        ? { decals: structuredClone(previous.decals) }
        : {}),
    });
  }
  if (
    placements.length !== 117 ||
    new Set(placements.map((p) => p.id)).size !== placements.length
  )
    throw Error("Framed stock presentation is incomplete");
  return placements.sort((a, b) => a.id.localeCompare(b.id));
}
