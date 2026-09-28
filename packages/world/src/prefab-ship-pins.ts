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

/**
 * Wren revision 4 (2026-09-28): 12 x 7 m hull so every module and furniture piece fits at catalog
 * scale outside the door and pilot approaches; four small thrust blocks, catalog revision 2.
 * New assignments and in-place upgrades.
 */
export const FED_WREN_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@2",
  blueprintSha256:
    "0089333b29356307be44ef7f54157d7827e3e34303cdb8c0f70fca3d26961803",
  flightDefinitionSha256:
    "384559d4e2ac88ee6cc7fcff834b60a3f16bc043b178a80b4d78ca7aa5652100",
  description: "Wren (Federation courier, size S, prefab r4)",
};

/**
 * Wren revision 3 as assigned on the live authority from 2026-09-28 until r4: four small ion
 * drives on the 11 x 6 m hull, catalog revision 2. No longer registered as a spawner; existing
 * instances keep these pins until `operator_upgrade_prefab_ship` moves them to FED_WREN_PIN.
 * `fixtures/fed-s-wren-r3.prefab.json` is its canonical prefab document.
 */
export const FED_WREN_R3_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@2",
  blueprintSha256:
    "5b0ac95b51ced9dd8077b69c619188fc0f2b4e2967db22d45d23c54929ac5804",
  flightDefinitionSha256:
    "f3fa61c6256a8193fd8bb521bfb854eef15fa86e5f3ac0e6301d3f93e23459c5",
  description:
    "Wren (Federation courier, size S, prefab r3; legacy live instances)",
};

/**
 * Wren revision 2 (first release) as spawned on the live authority before 2026-09-28: two medium
 * ion drives, catalog revision 1. No longer registered as a spawner; existing instances keep these
 * pins (the legacy catalog stays buildable) until an operator upgrades them to FED_WREN_PIN.
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

/**
 * Earlier pinned revisions that `operator_upgrade_prefab_ship` may replace in place with the
 * registered pin of the same prefab (containers, items and the ship id are kept).
 */
export const PREFAB_UPGRADE_SOURCES: readonly PinnedPrefabShip[] = [
  FED_WREN_R2_PIN,
  FED_WREN_R3_PIN,
];
