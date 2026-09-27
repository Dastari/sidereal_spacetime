/**
 * The prefab grammar's default component catalog: SHIPS-COMPONENTS' `ship-components.v1`
 * catalog adapted to `PrefabComponentCatalog`. Visual URLs point at the published runtime
 * copy of the component GLBs.
 */
import { SHIP_COMPONENT_ART_REVISION, buildShipComponentCatalog } from "./ship-components-source";
import { prefabCatalogFromShipComponents } from "./ship-prefab-components";
import type { PrefabComponentCatalog } from "./ship-prefab";

/** Public URL of a component GLB once published by `scripts/prepare_app.py`. */
export const componentVisualUrl = (id: string) => `/assets/ship-components/${SHIP_COMPONENT_ART_REVISION}/${id}.glb`;

let cached: PrefabComponentCatalog | null = null;

export function defaultPrefabComponentCatalog(): PrefabComponentCatalog {
  cached ??= prefabCatalogFromShipComponents(buildShipComponentCatalog(), {
    visual: (c) => (c.art.glb ? { url: componentVisualUrl(c.id) } : undefined),
  });
  return cached;
}
