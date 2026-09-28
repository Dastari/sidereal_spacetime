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

/** Wren revision 3 (2026-09-28): four small ion drives, catalog revision 2. New assignments. */
export const FED_WREN_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@2",
  blueprintSha256:
    "5b0ac95b51ced9dd8077b69c619188fc0f2b4e2967db22d45d23c54929ac5804",
  flightDefinitionSha256:
    "f3fa61c6256a8193fd8bb521bfb854eef15fa86e5f3ac0e6301d3f93e23459c5",
  description: "Wren (Federation courier, size S, prefab r3)",
};

/**
 * Wren revision 2 (first release) as spawned on the live authority before 2026-09-28: two medium
 * ion drives, catalog revision 1. No longer registered as a spawner; existing instances keep these
 * pins (the legacy catalog stays buildable) until an operator re-assigns them to FED_WREN_PIN.
 * `fixtures/fed-s-wren-r2.prefab.json` is its canonical prefab document.
 */
export const FED_WREN_R2_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@1",
  blueprintSha256:
    "f693083b4ade23264d54e57aebe5533e7aeb6f0848dcd5b12c788fff6ad6a4b8",
  flightDefinitionSha256:
    "60d43ff225304c62c6a8ba0139220eb191452a6ff374ff918d73fe1c34196db4",
  description:
    "Wren (Federation courier, size S, prefab r2; legacy live instances)",
};

export const REGISTERED_PREFAB_PINS: readonly PinnedPrefabShip[] = [
  FED_WREN_PIN,
];
