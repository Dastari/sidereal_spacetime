/**
 * Component catalogs the authority accepts for prefab ships, by revision string. New ships are
 * spawned against the current SHIPS-COMPONENTS catalog only (the spawner pins it). Instances that
 * were spawned against an earlier revision keep reading that revision's stats, so their stored
 * blueprint, layout and flight pins stay valid until an explicit migration (re-assign or refit);
 * they never silently validate against different stats.
 */
import {
  prefabComponentCatalogAt,
  defaultPrefabComponentCatalog,
} from "@sidereal/content/ship-prefab-catalog";
import {
  SHIP_COMPONENT_CATALOG_ID,
  SHIP_COMPONENT_CATALOG_REVISIONS,
} from "@sidereal/content/ship-components-source";
import type { PrefabComponentCatalog } from "@sidereal/content/ship-prefab";

export function prefabComponentCatalogFor(
  revision: string,
): PrefabComponentCatalog {
  const current = defaultPrefabComponentCatalog();
  if (revision === current.revision) return current;
  const legacy = SHIP_COMPONENT_CATALOG_REVISIONS.find(
    (r) => revision === `${SHIP_COMPONENT_CATALOG_ID}@${r}`,
  );
  if (legacy === undefined)
    throw Error(`Unsupported prefab component catalog ${revision}`);
  return prefabComponentCatalogAt(legacy);
}
