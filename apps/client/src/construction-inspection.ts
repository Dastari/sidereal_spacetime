import type { ConstructionDocument } from "@sidereal/content/construction";
import type { EquipmentCatalog } from "./objects";

/** Resolve display assets against this accepted instance's placed identities.
 * Never substitute the stock ship's placement IDs or infer gameplay authority. */
export function constructionInspectionCatalog(
  catalog: EquipmentCatalog | undefined,
  documentJson: string | undefined,
): EquipmentCatalog | undefined {
  if (!catalog || !documentJson) return undefined;
  let document: ConstructionDocument;
  try {
    document = JSON.parse(documentJson);
  } catch {
    return undefined;
  }
  const parts = document?.layout?.assembly?.parts;
  if (!Array.isArray(parts)) return undefined;
  const assets = new Map(
    catalog.entries.map((entry) => [entry.asset.id, entry.asset]),
  );
  const entries: EquipmentCatalog["entries"] = [];
  const seen = new Set<string>();
  for (const placement of parts) {
    if (
      !placement ||
      typeof placement.id !== "string" ||
      seen.has(placement.id)
    )
      return undefined;
    seen.add(placement.id);
    const asset = assets.get(placement.assetId);
    if (asset) entries.push({ asset, placements: [placement] });
  }
  return { entries };
}
