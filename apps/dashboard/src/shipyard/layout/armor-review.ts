import type { PartCatalog } from "@sidereal/content/assembly";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import { readLayout } from "@sidereal/sim/layout-validation";
import kit from "./armor-kit-r005.json";

/** Dashboard-local catalog. These IDs are deliberately absent from server catalogs. */
export function withArmorReviewCatalog(catalog: PartCatalog): PartCatalog {
  const ids = new Set(catalog.assets.map((a) => a.id));
  if (kit.assets.some((a) => ids.has(a.id)))
    throw Error("Armor review asset ID conflicts with the installed catalog");
  return {
    ...catalog,
    assets: [...catalog.assets, ...(kit.assets as PartCatalog["assets"])],
  };
}

export function createArmorReviewDraft(id: string): LayoutDocument {
  const doc = structuredClone(kit.layout) as unknown as LayoutDocument;
  doc.id = id;
  return readLayout(doc);
}

export function hasArmorReviewParts(doc?: LayoutDocument | null): boolean {
  return !!doc?.assembly?.parts.some((p) =>
    kit.assets.some((a) => a.id === p.assetId),
  );
}

const paletteAliases: Readonly<Record<string, string>> = kit.paletteAliases;

/** Keep legacy native IDs resolvable for placed parts without duplicate palette cards. */
export function isArmorPaletteAlias(id: string): boolean {
  return Object.hasOwn(paletteAliases, id);
}
