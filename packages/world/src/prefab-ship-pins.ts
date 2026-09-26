/**
 * Pinned identities of the prefab ships registered on the live authority. Pure data
 * (no server imports) so operator scripts and smokes can read the same values.
 * `prefab-ship-spawners.test.ts` asserts every pin equals the current derivation.
 */
export interface PinnedPrefabShip {
  readonly prefabId: string;
  /** `${SHIP_COMPONENT_CATALOG_ID}@${SHIP_COMPONENT_CATALOG_REVISION}`. */
  readonly catalogRevision: string;
  /** sha256 of the canonical prefab construction document (the instance blueprint). */
  readonly blueprintSha256: string;
  /** flightDefinitionCatalogHash of the prefab physical catalog (binding definitionSha256). */
  readonly flightDefinitionSha256: string;
  readonly description: string;
}

export const FED_WREN_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@1",
  blueprintSha256:
    "8c3c2f6d104d080d233f9cf70c60f9503ef8b9e0dccf6c14773a729c2b1eb7a3",
  flightDefinitionSha256:
    "e79173313d2abb22cbed92b1a21ff0b81c1f0386d6a448bf76281c2b7e471c59",
  description: "Wren (Federation courier, size S, prefab r1)",
};

export const REGISTERED_PREFAB_PINS: readonly PinnedPrefabShip[] = [
  FED_WREN_PIN,
];
