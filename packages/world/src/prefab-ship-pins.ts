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
  /**
   * Storage the spawner stocks when it issues a NEW ship of this pin (starter onboarding and
   * operator assignment; never in-place upgrades): each entry binds a container to the storage
   * socket and fills it with the named `CREW_WARDROBE_KITS` kit, in the issuing transaction.
   */
  readonly issueStock?: readonly PrefabIssueStock[];
  /** Bind all authored storage sockets to new empty, collision-qualified inventories. */
  readonly issueEmptyStorage?: boolean;
}

export interface PrefabIssueStock {
  /** Storage socket key (`prefabCargoSockets`). */
  readonly socketKey: string;
  readonly containerName: string;
  /** `CREW_WARDROBE_KITS` id. */
  readonly kit: string;
}

/** Wren r8 suit locker: the storage socket of its hand-placed `suit-locker` fixture. */
export const WREN_SUIT_LOCKER_SOCKET = "hold/shipyard.equipment.wall-locker";

/**
 * Wren revision 9 (2026-09-30, S4-2 prerequisite): r8 plus a small black-start battery in the
 * engine room. The catalogue stays at @4; battery mass changes the flight definition hash.
 * New ships retain r8's EVA suit issue-stock; operator upgrades preserve inventory and add the
 * battery mount. Battery contents and runtime startup/debit land in the subsequent S4-2 PR.
 */
export const FED_WREN_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@4",
  blueprintSha256:
    "d7edc7f62636b1d2a780bdd30eac67bff16cf8527db7d66c426a8cc42be0c3d2",
  flightDefinitionSha256:
    "b61f8dc0937e33254aea67f9f7db1debed2112c17eff4b5d5f24aa20b52761e8",
  description: "Wren (Federation courier, size S, prefab r9)",
  issueStock: [
    {
      socketKey: WREN_SUIT_LOCKER_SOCKET,
      containerName: "EVA suit locker",
      kit: "eva-suit",
    },
  ],
};

/**
 * Wren revision 8 (2026-09-29, SUIT-LOCKER): r7 plus a dedicated EVA suit locker (a wall locker
 * storage socket, `WREN_SUIT_LOCKER_SOCKET`) in the airlock chamber beside the inside airlock
 * button. Flight and catalogue unchanged from r7. New Wrens are issued with the `eva-suit` kit in
 * the locker (EVA still needs the suit on: no suit, no vacuum). New assignments and in-place
 * upgrades (the upgrade adds the empty socket; `scripts/ship_cargo.py` stocks it).
 * Frozen in fixtures/fed-s-wren-r8.prefab.json; upgrades now target r9.
 */
export const FED_WREN_R8_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@4",
  blueprintSha256:
    "52fcc23ea095e10bdd516dd4a9afeb6ae83635e38aa47266ffb7f944ba36f695",
  flightDefinitionSha256:
    "b996952862e4ee89fcd9f16df6280742bf69731c48e2152b9b5a5137ea1f00ff",
  description: "Wren (Federation courier, size S, prefab r8)",
  issueStock: [
    {
      socketKey: WREN_SUIT_LOCKER_SOCKET,
      containerName: "EVA suit locker",
      kit: "eva-suit",
    },
  ],
};

/**
 * Wren revision 7 (2026-09-29, EVA milestone 2): r6 geometry, flight and catalogue @4; the hold
 * becomes the airlock chamber (its hall door is a sealed airlock door) and the prefab carries ship
 * logic: an airlock controller interlocking the hold door and the starboard hatch, and three wall
 * buttons (inside the hold, outside on the hull, in the hall). Wiki `Systems/Ship Logic`.
 * Registered until r8; existing instances keep these pins until `operator_upgrade_prefab_ship`
 * moves them to FED_WREN_PIN. `fixtures/fed-s-wren-r7.prefab.json` is its canonical document.
 */
export const FED_WREN_R7_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@4",
  blueprintSha256:
    "340c45977ec43ef461982de3efdbe9fff9e255f6222ed97eb7140f9c6832a12e",
  flightDefinitionSha256:
    "b996952862e4ee89fcd9f16df6280742bf69731c48e2152b9b5a5137ea1f00ff",
  description:
    "Wren (Federation courier, size S, prefab r7; legacy live instances)",
};

/**
 * Wren revision 6 (2026-09-29, FLIGHT-IFCS): fly-by-wire handling earned by real thrusters. Four
 * quad RCS blocks at the nose and stern corners (catalogue revision 4: nozzles exhaust clear of the
 * hull and act at their exits), three small thrust blocks on the centreline, the r5 roof weapons and
 * sensor, plus a coolant pump and a small ballistic magazine so the ship-systems budget closes
 * (S4-1 catalogue rules). Registered until r7; existing instances keep these pins until
 * `operator_upgrade_prefab_ship` moves them to FED_WREN_PIN. `fixtures/fed-s-wren-r6.prefab.json` is
 * its canonical document.
 */
export const FED_WREN_R6_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@4",
  blueprintSha256:
    "9e243122dcea41e4ff4eb988a509303de177adeb58e1e17ef2a5bcb5a2a98e84",
  flightDefinitionSha256:
    "b996952862e4ee89fcd9f16df6280742bf69731c48e2152b9b5a5137ea1f00ff",
  description:
    "Wren (Federation courier, size S, prefab r6; legacy live instances)",
};

/**
 * Wren revision 5 (2026-09-29, SHIP-MOUNTS) as assigned on the live authority until r6: weapons
 * and the basic sensor dish on roof mount tiles, engines aft only, RCS only at the wing tips,
 * catalog revision 3. No longer registered as a spawner; existing instances keep these pins until
 * `operator_upgrade_prefab_ship` moves them to FED_WREN_PIN. `fixtures/fed-s-wren-r5.prefab.json`
 * is its canonical document.
 */
export const FED_WREN_R5_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@3",
  blueprintSha256:
    "c080b1397fd61b4609d4b8459239111aaed3bd398f868975ae2702418ad71eaf",
  flightDefinitionSha256:
    "c6d252e906de0d8fad479e156a8ca512f0ac58500f4d7a0f3d888c13902a447d",
  description:
    "Wren (Federation courier, size S, prefab r5; legacy live instances)",
};

/**
 * Wren revision 4 (2026-09-28) as assigned on the live authority until r5/r6: 12 x 7 m hull, four
 * small thrust blocks, side cannons and a bare roof autocannon, catalog revision 2. No longer
 * registered as a spawner; existing instances keep these pins until `operator_upgrade_prefab_ship`
 * moves them to FED_WREN_PIN. `fixtures/fed-s-wren-r4.prefab.json` is its canonical document.
 */
export const FED_WREN_R4_PIN: PinnedPrefabShip = {
  prefabId: "fed.s.wren",
  catalogRevision: "ship-components-v1@2",
  blueprintSha256:
    "0089333b29356307be44ef7f54157d7827e3e34303cdb8c0f70fca3d26961803",
  flightDefinitionSha256:
    "384559d4e2ac88ee6cc7fcff834b60a3f16bc043b178a80b4d78ca7aa5652100",
  description:
    "Wren (Federation courier, size S, prefab r4; legacy live instances)",
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

/** Owner-selected authored Wayfarer r1, explicitly issued or used for targeted replacement. */
export const FED_WAYFARER_PIN: PinnedPrefabShip = {
  prefabId: "fed.m.wayfarer",
  catalogRevision: "ship-components-v1@4",
  blueprintSha256:
    "49e5898ceaafb12c5361250440515562f5e6202d0c7a6d4f4405f2419ade90fa",
  flightDefinitionSha256:
    "7d87c73d43ebf00afda0f9b4344ea0a7abd7eba1fc65883ceebab2d6d41073a0",
  description: "Wayfarer (Federation explorer, authored prefab r1)",
  issueEmptyStorage: true,
};

export const REGISTERED_PREFAB_PINS: readonly PinnedPrefabShip[] = [
  FED_WREN_PIN,
  FED_WAYFARER_PIN,
];

/**
 * Earlier pinned revisions that `operator_upgrade_prefab_ship` may replace in place with the
 * registered pin of the same prefab (containers, items and the ship id are kept).
 */
export const PREFAB_UPGRADE_SOURCES: readonly PinnedPrefabShip[] = [
  FED_WREN_R2_PIN,
  FED_WREN_R3_PIN,
  FED_WREN_R4_PIN,
  FED_WREN_R5_PIN,
  FED_WREN_R6_PIN,
  FED_WREN_R7_PIN,
  FED_WREN_R8_PIN,
];
