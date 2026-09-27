import type { LayoutDocument } from "./ship-layout";
import type { PartCatalog } from "./assembly";
import mappings from "./wayfarer-hull-r005-map.json";
/** Editable derivative only. The immutable onboarding source and installed UUIDs
 * remain separate. Old native socket cuts were mesh modifiers, not placements. */
export function upgradeWayfarerHullLayout(
  doc: LayoutDocument,
  catalog: PartCatalog,
): LayoutDocument {
  if (!doc.assembly) return doc;
  const byOld = new Map(mappings.map((m) => [m.previousAssetId, m]));
  const assets = new Map(catalog.assets.map((a) => [a.id, a]));
  const next = JSON.parse(JSON.stringify(doc)) as LayoutDocument;
  let changed = false;
  next.assembly!.parts = next.assembly!.parts.map((part) => {
    const mapping = byOld.get(part.assetId);
    if (!mapping) return part;
    const asset = assets.get(mapping.assetId);
    if (!asset?.visual || asset.visual.sha256 !== mapping.sha256)
      throw Error("Exact normalized r005 hull catalog required");
    // Recover the old mounting anchor, then move inward by its historical
    // 312.5mm standoff. Preserve rotation/tangent detail; align base with the closest deck floor top.
    const deck = [...doc.decks].sort(
      (a, b) =>
        Math.abs(a.elevation / 32 - part.position[2]) -
        Math.abs(b.elevation / 32 - part.position[2]),
    )[0];
    if (!deck) throw Error("Structural deck required for hull attachment");
    const localShift = mapping.legacyMountingX - mapping.previousSide * 0.3125;
    const shift = localShift * (part.flipped ? -1 : 1);
    changed = true;
    next.assembly!.revisions[mapping.assetId] = asset.visual.sha256;
    return {
      ...part,
      assetId: mapping.assetId,
      position: [
        part.position[0] + Math.cos(part.rotation) * shift,
        part.position[1] + Math.sin(part.rotation) * shift,
        deck.elevation / 32 + 0.1875,
      ] as [number, number, number],
      flipped: mapping.previousSide < 0 ? !part.flipped : part.flipped,
    };
  });
  if (!changed) return doc;
  const used = new Set(
    next.assembly!.parts.flatMap((p) => [
      p.assetId,
      ...(p.fittingProxy ? [p.fittingProxy.assetId] : []),
    ]),
  );
  for (const mapping of mappings)
    if (!used.has(mapping.previousAssetId))
      delete next.assembly!.revisions[mapping.previousAssetId];
  return next;
}
