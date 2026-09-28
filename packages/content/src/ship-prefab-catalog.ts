/**
 * The prefab grammar's default component catalog: SHIPS-COMPONENTS' `ship-components.v1`
 * catalog adapted to `PrefabComponentCatalog`. Visual URLs point at the published runtime
 * copy of the component GLBs.
 */
import {
  SHIP_COMPONENT_ART_REVISION,
  SHIP_COMPONENT_CATALOG_REVISION,
  buildShipComponentCatalog,
  type ShipComponentCatalogRevision,
} from "./ship-components-source";
import { prefabCatalogFromShipComponents } from "./ship-prefab-components";
import type { PrefabComponentCatalog } from "./ship-prefab";

/** Public URL of a component GLB once published by `scripts/prepare_app.py`. */
export const componentVisualUrl = (id: string) =>
  `/assets/ship-components/${SHIP_COMPONENT_ART_REVISION}/${id}.glb`;

const cached = new Map<ShipComponentCatalogRevision, PrefabComponentCatalog>();

/** The prefab catalog at a component catalog revision (default: current). */
export function prefabComponentCatalogAt(
  revision: ShipComponentCatalogRevision,
): PrefabComponentCatalog {
  let c = cached.get(revision);
  if (!c)
    cached.set(
      revision,
      (c = prefabCatalogFromShipComponents(
        buildShipComponentCatalog(revision),
        {
          visual: (d) =>
            d.art.glb ? { url: componentVisualUrl(d.id) } : undefined,
        },
      )),
    );
  return c;
}

export function defaultPrefabComponentCatalog(): PrefabComponentCatalog {
  return prefabComponentCatalogAt(SHIP_COMPONENT_CATALOG_REVISION);
}
