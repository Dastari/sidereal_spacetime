import {
  readShipPrefab,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";

export interface SystemsDesignSource {
  doc: ShipPrefabDocumentV1;
  catalogRevision: string;
}
/** Consumes an already owner-authorized current construction document; performs no fetch or write. */
export function systemsDesignSource(
  documentJson: string | undefined,
): SystemsDesignSource | undefined {
  if (!documentJson) return;
  try {
    const parsed = JSON.parse(documentJson) as {
      prefab?: { document?: unknown; catalog?: unknown };
    };
    if (typeof parsed.prefab?.catalog !== "string") return;
    const doc = readShipPrefab(parsed.prefab.document),
      catalogRevision = parsed.prefab.catalog;
    prefabComponentCatalogFor(catalogRevision);
    return { doc, catalogRevision };
  } catch {
    return;
  }
}
