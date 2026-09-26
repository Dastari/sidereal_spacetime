# Ship asset removal and player-ship wipe: plan and implementation

**Status:** implemented and rehearsed on an isolated server. Nothing has been run against the live database or deployed.
**Date:** 2026-09-25, updated 2026-09-26. **Agent Mail:** FuchsiaPanther.
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
| `operator_set_starter_prefab(operationId, prefabId, expectedCatalogRevision, allowLegacy)` | Writes the private `ship_policy` row. **An empty prefab ID is the default, and also applies when the row is absent.** In that case new characters never get a ship: `enter_lab` creates the character with its 7-item personal kit, and it waits for an operator assignment. A registered non-legacy prefab may be configured as the starter. The legacy Wayfarer can be configured only with `allowLegacy`; the isolated legacy regression smoke does this on its own `-smoke` database, and it is never done on live. |
| `operator_wipe_player_ships(operationId, dryRun, expectedShips, expectedInstances, expectedCharacters)` | **Dry-run** records counts, ships, instances, characters, per-table delete counts, a per-item `archivedInventory` manifest (with the reason each item is ship-held: `ship-cargo-container`, `ground-drop-on-ship-deck`, `ship-deck-storage` or `ship-deck-container`) and map counts. It changes nothing else. **Apply** refuses while a legacy starter is configured, and requires the expected counts to equal the current counts. It runs as one transaction. |
| `operator_assign_prefab_ship(operationId, characterId, prefabId, expectedCatalogRevision, spawnPoseJson, expectedCharacterShipId, allowLegacy)` | **The only way back aboard.** It accepts only a character in the awaiting-ship state whose account owns no ship. It refuses an unknown prefab, a catalog-revision mismatch, or a legacy prefab without `allowLegacy`. `spawnPoseJson` is `""` or `{"kind":"berth"}` for a canonical free berth, or `{"kind":"at","systemId","x","y","heading"}` for an exact world pose in metres and radians. After the spawn, in the same transaction, it re-verifies ship ownership, active `game_ship_access`, the construction location on the returned deck, world admission, the pose and unchanged map row counts. |

**Prefab spawner interface for SHIPS-PREFABS** (agreed on Agent Mail thread `ships-prefabs`, IndigoHarbor). It lives in `packages/world/src/ship-assign.ts`:

```ts
type PrefabSpawnPose = { kind: "berth" } | { kind: "at"; systemId: string; x: number; y: number; heading: number };
registerPrefabShipSpawner({
  prefabId,          // e.g. "fed.s.wren"
  catalogRevision,   // ship-components catalog revision the prefab compiled against
  blueprintSha256,   // published construction blueprint hash
  legacy: false,
  description,
  spawn(ctx, actor, { pose, name }) => { shipId, deckId },
});
```

- **What the spawner must do:** board the **existing** awaiting character, all in one transaction. It updates `character.shipId/localX/localY` and inserts `construction_location`, `input`, `world_admission` and an active `game_ship_access` row.
- **What the spawner must never do:** insert a character, a personal kit or a starter receipt, or write map tables.
- **SHIPS-PREFABS' hook:** `installPrefabShip` in `packages/world/src/prefab-ship-authority.ts`, registered by `packages/world/src/prefab-ship-spawners.ts` (imported from `index.ts` right after `./ship-assign`).
- **Registered today** (branch `feat/prefab-wren-live`, stacked on this PR):
  - `fed.s.wren` (Wren, the owner's pick). Catalog revision `ship-components-v1@1`; blueprint sha256 `8c3c2f6d104d080d233f9cf70c60f9503ef8b9e0dccf6c14773a729c2b1eb7a3`; flight definition sha256 `e79173313d2abb22cbed92b1a21ff0b81c1f0386d6a448bf76281c2b7e471c59`. The pins live in `prefab-ship-pins.ts`. A golden test asserts they equal the current derivation. After installing, the spawner rechecks the installed blueprint and flight hashes and rolls back on drift. The ship is named "Wren", not after the character.
  - `legacy-wayfarer-r002`. It is refused unless `allowLegacy` is set; it exists for unit tests and the legacy regression smoke.
  - The other prefabs (`rj.s.jackal`, `au.s.lumen`, …) ship as content but are not registered. Each needs its own pin and smoke.

**Integration done by the backport, option (b).** `feat/prefab-wren-live` ports the prefab compile/spawn path from `feat/prefab-ships` onto this live base:
- grammar, component catalog, prefab construction and flight;
- non-Wayfarer game ship access (the `trusted-prefab:` blueprint ID with the trusted workspace);
- the prefab flight resolver/writer/input branch;
- the prefab pilot pose.

It is adapted to IFCS phase 3, which has no per-actuator `supply` input.

**Still needed for the owner to see the Wren in the game:** the live client (`release/live-client-20260922`) cannot render it yet. That needs a separate client PR with:
- the prefab ship renderer (`packages/render/src/prefab-ship/*` on `feat/prefab-ships`);
- publication of the ship-kit and ship-component GLBs.

Until then an assigned Wren is authoritative (it walks, seats and flies in the smoke), but the client shows no hull for it.

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

**Unit tests** (`packages/world/src/ship-wipe.test.ts`, `ship-wipe-tooling.test.ts`): 10 pass.
- **Fixtures:** the real starter writer installs two Wayfarers. The tests then add ship cargo, a deck crate with a hotbar item, a ground binding, weapon energy and a Studio test instance. A minimal non-legacy test prefab exercises the spawner contract.
- **Starter policy:** defaults to none; only the operator may change it; conflicting operation IDs are refused; legacy requires opt-in.
- **Onboarding:** new players are shipless by default. A configured non-legacy starter boards them through the spawner.
- **Dry-run:** changes nothing and emits a per-item manifest with reasons.
- **Apply:**
  - refuses while a legacy starter is configured, and refuses count mismatches;
  - a full apply keeps every invariant, including archive before-images and tagged identity/bigint JSON;
  - replay is a no-op.
- **Assignment:**
  - operator-only;
  - refuses an unknown prefab, a stale catalog revision, the legacy Wayfarer and a malformed pose;
  - succeeds at an exact pose without duplicating the kit;
  - a later assignment to a character that already has a ship is refused.
- **Legacy opt-in:** the legacy stand-in is reachable only with explicit opt-in.
- **Pose rollback:** a spawner that ignores the requested pose is rolled back.
- **Tooling parity:** the Python and TypeScript table lists match.

`packages/world` + `packages/net`: 379 tests pass. Two suites fail at collection (`construction-native-pressure`, `construction-traversal`) because this worktree lacks the live native `assets/`. This failure is pre-existing and unrelated.

**Standard `npm run smoke`** (the legacy regression suite; it opts its own isolated database into the legacy starter): **passes on the final commit** on a quiet host.
- Earlier runs failed only on timing-based walking assertions at host load 26–29.
- The unmodified baseline also passed.
- Log: `/root/sidereal-progress/ships-removal/smoke-final-postreboot.log`.

**Live-shaped rehearsal `npm run smoke:ship-wipe -- --label wipe-r005`** (`--stage seed`, then `--stage wipe`):
1. The unmodified live baseline module seeds 3 accounts with starter Wayfarers. One account stores its pistol in ship cargo and drops its scanner on the deck.
2. The database is upgraded in place with `--delete-data=never`.
3. The operator tooling runs exactly as the runbook describes.

| Check | Result |
|---|---|
| New account after the upgrade, before the wipe | Shipless: 0 ships, 7-item kit |
| Dry-run | 3 ships, 3 instances, 4 characters; 26 personal items and 12 personal containers preserved |
| Archived items | Exactly the pistol (`ship-cargo-container`) and the scanner (`ground-drop-on-ship-deck`); no personal item |
| Apply | 180 rows archived |
| After apply | 0 ships, 0 instances, 4 characters, all awaiting a ship |
| Verify | `mapUnchanged`; wiped tables empty; backup file mode 0600; replay no-op |
| Owner player view | Same character UUID, no ship, same 5 personal item UUIDs; re-entry and kit claim succeed; movement is inert |
| Archived pistol and scanner | Present in `ship_wipe_archive` |
| Scheduled world step | Timer retained, 0 `step_world` errors. `stepSharedWorld` writes no clock row for idle samples, so `last_simulation_tick` does not advance with zero ships; this is expected and not a failure. |
| Assignment (this PR) | `fed.s.wren` refused as not registered in this authority; legacy Wayfarer refused as assignment and as starter; the character stays awaiting a ship |
| Assignment (`feat/prefab-wren-live`, rehearsal `wren-r001`) | Refused: unregistered `rj.s.jackal`, a stale catalog revision, and the legacy Wayfarer. `fed.s.wren` assigned at a berth: same character UUID, personal kit preserved, ship "Wren", compiled flight ready (18 723 kg, 10 actuators). The character walked a 5-waypoint door-aware route to the derived pilot approach, took the seat, reached 3.96 m/s, and turned 0.056 rad |

Evidence: `ship-wipe-rehearsal-r005.json` and `rehearsal-r005-{seed,wipe}.log` in `/root/sidereal-progress/ships-removal/`.

**Browser check** (headless Chromium against a local dev client on the rehearsal database):
- **Before**, live client: the owner is aboard the legacy Wayfarer (`r003-before-wipe-owner-legacy-wayfarer.png`, same seed procedure).
- **After**, candidate client:
  - "No ship assigned"; the personal inventory is intact at 8.1 kg without the archived pistol and scanner (`r005-after-wipe-owner-*.png`);
  - zero console errors;
  - zero requests for retired ship assets.

## Risks and gaps

- **New players wait for a ship.** By default, after this module is published, new accounts get no ship until an operator assigns one. The legacy Wayfarer is never created again.
- **The live client cannot render a prefab yet.** With `feat/prefab-wren-live`, `fed.s.wren` can be assigned and flown on the live authority. The client needs the prefab renderer and the ship-kit/component GLB publication in a separate client PR before the owner can see the hull.
- **A starter prefab on a database without a system:** a berth spawn creates the canonical system if it is missing, and `boardPrefabShip` refuses map writes. Live already has the system, so live is unaffected; this only matters for a brand-new database.
- **Identity linking needs a ship:** `request_identity_link` and `accept_identity_link` require exactly one ship. Awaiting-ship characters cannot migrate from a development identity to OIDC until they have a ship. Accounts that are already linked are unaffected.
- **Passengers aboard at wipe time** lose their visit rows along with every ship. Their characters enter the awaiting-ship state like everyone else.
- **Not seeded in the rehearsal:** stairs, traversal, airlocks, passengers and cargo carriers. Their rows are covered by whole-table deletion and the unit fixture, not by live-like data.
- **Old client after the wipe:** it would load the legacy voxel lab ship for a shipless character. That does not crash, but it is misleading. Deploy the new client right after the wipe.
- **New client before the wipe:** existing Wayfarer construction scenes would fail to load their retired catalogs. Keep the order.
- **Stale `personal_starter_receipt` `shipId`:** entitlement receipts keep pointing at deleted ship IDs by design (history). Assignment archives and replaces the owner's receipt.
