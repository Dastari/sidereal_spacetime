/**
 * Component catalogs the authority accepts for prefab ships, by revision string. Only the
 * current SHIPS-COMPONENTS catalog is admitted; an older revision needs an explicit
 * migration rather than silently validating against different stats.
 */
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import type { PrefabComponentCatalog } from "@sidereal/content/ship-prefab";

export function prefabComponentCatalogFor(revision: string): PrefabComponentCatalog {
  const current = defaultPrefabComponentCatalog();
  if (revision !== current.revision) throw Error(`Unsupported prefab component catalog ${revision}`);
  return current;
}
