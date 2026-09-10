import type { PartCatalog } from "@sidereal/content/assembly";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import { layoutVisualParts } from "@sidereal/content/layout-assembly";

/** Native authored bounds, in the same east/north deck plane as floors and routes.
 * These labels identify placements; no service ports or operational stats are inferred. */
export function systemsFootprints(
  doc: LayoutDocument,
  catalog: PartCatalog,
  deckId: string,
) {
  const deck = doc.decks.find((d) => d.id === deckId);
  if (!deck) return [];
  const low = deck.elevation / 32,
    high = (deck.elevation + deck.ceiling) / 32;
  return layoutVisualParts(doc, catalog).flatMap((part) => {
    const asset = catalog.assets.find((a) => a.id === part.assetId);
    if (!asset || !["equipment", "cargo", "engine"].includes(asset.category))
      return [];
    const fitting = doc.fittings.find((f) => f.id === part.id);
    if (
      fitting
        ? fitting.deckId !== deckId
        : part.position[2] + asset.bounds.max[2] <= low ||
          part.position[2] + asset.bounds.min[2] >= high
    )
      return [];
    const { min, max } = asset.bounds;
    const c = Math.cos(part.rotation),
      s = Math.sin(part.rotation);
    const polygon: Point[] = [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ].map(([x0, y]) => {
      const x = part.flipped ? -x0 : x0;
      return [
        (part.position[0] + x * c - y * s) * 32,
        (part.position[1] + x * s + y * c) * 32,
      ];
    });
    const center: Point = [
      polygon.reduce((n, p) => n + p[0], 0) / 4,
      polygon.reduce((n, p) => n + p[1], 0) / 4,
    ];
    return [
      {
        id: part.id,
        name: asset.label,
        category: asset.category,
        polygon,
        center,
      },
    ];
  });
}
