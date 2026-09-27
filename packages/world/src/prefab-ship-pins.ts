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
    "f693083b4ade23264d54e57aebe5533e7aeb6f0848dcd5b12c788fff6ad6a4b8",
  flightDefinitionSha256:
    "60d43ff225304c62c6a8ba0139220eb191452a6ff374ff918d73fe1c34196db4",
  description: "Wren (Federation courier, size S, prefab r1)",
};

export const REGISTERED_PREFAB_PINS: readonly PinnedPrefabShip[] = [
  FED_WREN_PIN,
];
