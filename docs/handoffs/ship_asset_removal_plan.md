# Ship asset removal and player-ship wipe: plan and implementation

**Status:** implemented and rehearsed on an isolated server. Nothing has been run against the live database or deployed.
**Date:** 2026-09-25. **Agent Mail:** FuchsiaPanther.
**Runbook:** [ship_wipe_runbook.md](ship_wipe_runbook.md).

## Owner request

> "I want to remove all existing ship assets from the game for the moment, wipe all player ships, (leave the map) ... We'll then pick a small ship and assign it to our main player account."

## Which code the live game runs

The live game does **not** run `main`.

| Live component | Source | Evidence |
|---|---|---|
| World module (port 3100, database `sidereal-spacetime-dev`) | `/root/sidereal-live-map-authority-candidate` | [live_map_genesis.md](live_map_genesis.md): artifact `f6dcf1aa…`, published 2026-09-21 with `--delete-data=never` |
| Public game client | `/root/sidereal-shadow-release-20260922` | [shadow_cache_release_20260922.md](shadow_cache_release_20260922.md): artifact `0c48930c…` |
| Studio (dashboard) | `/root/sidereal-studio-dashboard-release` | [studio_live_release_20260921.md](studio_live_release_20260921.md) |

- **World module composition:** IFCS phase 3 (`cd09510c`, on `ifcs-update`) plus the released solar, Studio (#15) and Genesis (#19) overlays.
- **`main` is behind the live world:** it lacks the IFCS phase 3 world/sim code (218 differing files under `packages/`). Those handoffs say a main-derived world must never be published over live.
- **Client source is a separate composition:** a recovered public source plus Studio and shadow-cache overlays. Its own `packages/world` is older than the live module. The client only needs bindings compatible with the live module.

Two baseline branches capture these sources so this work can be reviewed as ordinary diffs and actually shipped:

- **`release/live-authority-20260921`:** `cd09510c` plus one snapshot commit. It byte-matches the live authority source for `packages`, `apps`, `scripts`, `docs` and `ops`. Large `assets/` art, `node_modules`, `.tools` and `.runtime` are excluded.
- **`release/live-client-20260922`:** `cd09510c` plus a snapshot of the live client text source. Generated `apps/*/public`, `assets/` and 12 evidence PNGs are excluded.

The feature PRs target these baseline branches:

- **Authority:** `feat/ship-removal-operator-tools`.
- **Client:** `feat/ship-removal-client`.

**Forward port.** When `main` is reconciled with the live IFCS composition, the same changes must be carried over.
- The authority side is additive: new files, three table registrations, three reducers and two small `enter_lab`/`claim_starter_kit` guards.
- The client side is confined to `App.tsx`, `GameLoadingScreen.tsx`, `objects.ts`, `style.css`, `render/src/index.ts`, `onboarding-copy.ts` and `prepare_app.py`.

## Where ships live (authority)

All 94 tables are private. For a starter ship, `ship.id == construction_instance.id`. The full inventory with file references is in the survey below; the wipe groups tables as follows.

**Wiped entirely (`WIPED_SHIP_TABLES`, `packages/world/src/ship-wipe.ts`):**
- **Ship core:** `ship`, `station`, `ship_world_motion`, `construction_instance`, `construction_deck`, `game_ship_access`, and the `construction_flight_*` tables (binding, station, fitting, compiled, dirty, damage event).
- **Pilot, actuators and zones:** `construction_pilot_seat`, `actuator_output`, `space_body` (legacy per-ship lab bodies), `legacy_body_alias`, `ship_zone_state`, `pilot_layout_receipt`.
- **Doors, pressure and traversal:** doors, airlocks, native pressure, atmosphere, stairs (link, walk, reservation), traversal (link, traversal, reservation).
- **Interactions and passengers:** `construction_interaction_binding`, `interaction_object`, `couch_seat`, passenger grant and visit, flight review, review origin.
- **Cargo and inventory binding:** `wayfarer_refit_attachment`, cargo assembly, grid and placement, `instance_inventory_binding`.
- **Character presence aboard a ship:** `construction_location`, `world_admission`, `input`. Clearing `input` also satisfies the contract rule to clear stale inputs on grant loss.

A ship's `ship_world_motion` row and its `ship` row are deleted together. An orphan motion row would reject the entire shared contact island (`shared-world-physics.ts:164`) and freeze every ship in the system.

**Partially changed (character and inventory):**

- **`character`:** the row is preserved (UUID, owner, name, `connected`). `shipId` becomes `""` and `localX/localY` become `0,0`. This is the **awaiting-ship** state. The authority has no off-ship location for a character: position is always ship-local. So "safe spawn on the map" is expressed as this explicit, server-defined state until an operator assigns a ship. The shared-world tick, `set_intent`, `enter_lab` and `claim_starter_kit` are all safe with it.
- **Personal inventory:** every item and container whose containment root is the character's carried pockets. This includes equipped items, the backpack, nested bags and liquid reservoirs. It is preserved with identical UUIDs. Its `shipId` is set to `""` (and to the new ship on assignment). Scoped metadata is refreshed through `synchronizeLegacyInventory`, and `inventory_state.revision` is incremented.
- **Ship-held inventory:** ship cargo containers, deck crates and lab storage, ground drops on a deck, and their hotbar, storage-binding, weapon-energy, scope and membership rows. These are **archived, then deleted**. See the policy below.

**Never written:**
- **Map, system and Genesis (`PRESERVED_MAP_TABLES`):** `world_system`, `system_body`, `body_world_motion`, `celestial_migration_receipt`, `system_zone`, `system_map_definition`, `field_asteroid`, `system_map_edit`. The apply reducer re-counts these in the same transaction and aborts if anything changed. `ship_wipe.py verify` compares their contents against the pre-wipe backup, excluding kinematic and tick columns.
- **Authoring:** `construction_draft`, `construction_blueprint`, `construction_grant`. Dashboard Shipyard templates and published blueprints are not player ships.
- **Auth and appearance:** `auth_session`, `identity_link`, `retired_identity`, `character_appearance`, `combat_aim`, `input_control*`.
- **Receipts and audits:** every receipt and audit table is kept as history, including `personal_starter_receipt` (entitlement record), `edit_receipt`, `world_join_receipt` and `construction_*_audit`.
- **Global clocks:** `construction_atmosphere_clock`, `construction_traversal_clock`, `movement_timer`.

**NPC ships:** none exist. Only the starter/replacement writer and the Studio authored-flight installer insert `ship` rows.

**Studio test ships:** `spawn_construction_blueprint` instances, with or without an authored flight, are construction instances. They are wiped too ("wipe all player ships").

## Item policy: reversible where possible

- **In-database archive:** every deleted row, and the before-image of every rewritten row, is written to the private `ship_wipe_archive` table. Each entry records the operation ID, table name, action and lossless JSON (bigint and identity values are tagged). The archive is never pruned by gameplay.
- **Offline backup:** `ship_wipe.py export` writes a private JSON snapshot before the wipe (mode 0600, `.runtime/ship-wipe-backups/`, outside git). It covers every wiped table, every character and inventory table, the map tables and the operator ledger. `apply` refuses to run unless a backup of the same database with matching counts is supplied, or the owner explicitly waives it with `--owner-waived-backup`.
- **Cold database archive:** the existing `python3 scripts/dev.py backup-database`, run from the managing checkout, is part of the runbook.
- **Restoration:** there is no automatic restore reducer. The ships being removed are legacy Wayfarers whose client assets are also removed, so restoring them into runtime is not meaningful. Ship-held items can be re-issued later from the archive by a future, explicitly reviewed operator reducer (item UUIDs and definitions are recorded). A full rollback means restoring the cold backup, which is destructive to anything that happened afterwards and needs its own owner decision. Never roll back the database as a routine step.

## Operator actions (never automatic on deploy)

All three reducers check the existing deployment-operator identity: the CLI identity that owns the database, the same one already used by `replace_legacy_player_wayfarer`. Every call is recorded in a permanent private ledger, `ship_operator_operation`, keyed by operation ID. Replaying the same request is a no-op; reusing an ID for a different request fails.

| Reducer | Effect |
|---|---|
| `operator_set_starter_ships(operationId, enabled)` | Writes the private `ship_policy` row. When the row is absent, starter Wayfarers are still created, so **publishing the module changes nothing by itself**. When disabled, `enter_lab` creates a shipless character with only its personal kit. |
| `operator_wipe_player_ships(operationId, dryRun, expectedShips, expectedInstances, expectedCharacters)` | **Dry-run** records counts, ships, instances, characters, per-table delete counts and map counts, and changes nothing else. **Apply** requires starters disabled and the expected counts to equal the current counts. It runs as one transaction. |
| `operator_assign_prefab_ship(operationId, characterId, prefabId, expectedCharacterShipId, allowLegacy)` | Boards an awaiting character on a registered prefab. It then verifies that the ship owner, active `game_ship_access`, construction location and world admission all belong to that character and account. |

**Prefab spawner interface for SHIPS-PREFABS.** It lives in `ship-assign.ts`: `registerPrefabShipSpawner({prefabId, legacy, description, blueprintSha256, spawn(ctx, actor) => {shipId}})`.
- **Registered today:** only `legacy-wayfarer-r002`, a legacy stand-in that is refused unless `allowLegacy` is set. It proves the path in tests and rehearsal.
- **What the owner's small ship needs:** SHIPS-PREFABS must register it in this live-compatible authority.
- **Known blocker on live:** `game_ship_access` qualification (`sim/game-ship-access.ts:79-81`) and flight qualification only accept Wayfarer template hashes. A non-Wayfarer prefab needs a generic qualification path first.
- The interface was proposed on Agent Mail thread `ships-removal`.

## Client: zero ships and retired assets

This is branch `feat/ship-removal-client`.

- **Awaiting-ship state:** when `character.shipId === ""`, the client shows the environment and crew only. It adds:
  - a "No ship assigned" HUD title and notice;
  - awaiting-ship loading copy.

  It also disables:
  - the Tab/Flight view and the control seat;
  - the Ship refit and Ship systems panels;
  - the shared-entry "ship not available" prompt.
- **Legacy stock ship:** the game never imports the legacy stock voxel Wayfarer. Without an authorized construction scene, the renderer uses `vessel: "none"`.
- **Other players' ships:** the stock Wayfarer remote-ship prototype (`wayfarer-exterior-r001.json`, voxel shell, hull manifest, framed Wayfarer) is no longer created in the game (`sharedWorld.stockExterior: false`). Rendering other players' prefab ships belongs to SHIPS-PREFABS.
- **Legacy inspection catalog:** the hull, cargo and equipment manifests and `wayfarer.json` are no longer fetched.
- **Asset delivery (`prepare_app.py`):** client builds exclude `CLIENT_RETIRED_PATTERNS`:
  - `wayfarer.glb`;
  - `voxels/*`, except `asteroid.glb`;
  - `assembly/*`, except `floor-manifest.json` and `floor/`;
  - `construction/wayfarer-rebuild-r002`.

  The dashboard still publishes them for Shipyard and model tools, and every source stays in git and art-library history. Client public assets fall from 1.1 GB to 789 MB. The remaining manifest references still resolve.
- **Deployment order:** after the wipe, deploy this client only after the operator wipe. Existing Wayfarer construction scenes (rebuild r002, exterior r005) depend on the retired catalogs.

## Test evidence (isolated server 127.0.0.1:3391; never live)

**Unit tests** (`packages/world/src/ship-wipe.test.ts`, `ship-wipe-tooling.test.ts`): 7 tests pass. They use the real starter writer to install two Wayfarers, then add ship cargo, a deck crate with a hotbar item, ground binding and weapon energy, plus a Studio test instance. They cover:
- operator-only access;
- policy idempotency and conflicting operation IDs;
- shipless onboarding;
- a dry-run that leaves state unchanged;
- apply refusals (starters still enabled, count mismatch);
- a full apply with all invariants;
- replay no-op;
- assignment refusals and success without duplicating the kit;
- Python/TypeScript table-list parity.

**Standard `npm run smoke` on the candidate:** passes. One earlier run failed a timing-based corridor-walk assertion unrelated to this change; the unmodified baseline passed, and the candidate rerun passed.

**Rehearsal `npm run smoke:ship-wipe -- --label wipe-r002`:**
1. Seeds a new database with the full standard smoke under the unmodified live baseline module.
2. Upgrades it in place with `--delete-data=never`.
3. Adds a cargo item and a ground drop.
4. Runs the operator tooling exactly as the runbook does.

| Result | Value |
|---|---|
| Dry-run counts | 12 ships, 12 instances, 12 characters; 82 personal items and 36 personal containers preserved |
| Archived by apply | 691 rows (2 ship-held items, 49 containers, 1 ground binding) |
| After apply | 0 ships, 0 instances, 12 characters, all in awaiting-ship state |
| Map fingerprint | unchanged |
| Wiped tables | all empty |
| Backup file | mode 0600 |
| Replays | no-op |

The rehearsal also checked, through player views:
- the former owner's view shows no ship and the same 5 personal UUIDs;
- re-entry and kit claim do not fail;
- movement intent is inert;
- a new account onboards shipless with its 7-item kit;
- the shared-world tick keeps advancing;
- non-operator calls are rejected;
- the legacy stand-in assignment boards the character with an owned ship, access and location, and does not duplicate the kit.

Evidence JSON and log: `/root/sidereal-progress/ships-removal/`.

**Browser check** (headless Chromium against the local dev client on the rehearsal database): a wiped former owner and a new shipless character both load with zero console errors and zero requests for retired assets. Screenshots are in the progress folder.

## Risks and gaps

- **No real small prefab can be assigned on live yet.** It depends on SHIPS-PREFABS registering a spawner that the live authority can qualify. Until then the owner's account stays shipless after the wipe; only the legacy stand-in works.
- **Identity linking needs a ship:** `request_identity_link` and `accept_identity_link` require exactly one ship. Awaiting-ship characters cannot migrate from a development identity to OIDC until they have a ship. Accounts that are already linked are unaffected.
- **Passengers aboard at wipe time** lose their visit rows along with every ship. Their characters enter the awaiting-ship state like everyone else.
- **Not seeded in the rehearsal:** stairs, traversal, airlocks, passengers and cargo carriers. Their rows are covered by whole-table deletion and the unit fixture, not by live-like data.
- **Old client after the wipe:** it would load the legacy voxel lab ship for a shipless character. That does not crash, but it is misleading. Deploy the new client right after the wipe.
- **New client before the wipe:** existing Wayfarer construction scenes would fail to load their retired catalogs. Keep the order.
- **Stale `personal_starter_receipt` `shipId`:** entitlement receipts keep pointing at deleted ship IDs by design (history). Assignment archives and replaces the owner's receipt.
