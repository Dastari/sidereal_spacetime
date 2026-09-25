# Player Wayfarer replacement — 2026-09-12

Status: LIVE. All 28 player ships replaced and verified; rebuilt Wayfarer is the default for new characters.

The owner explicitly waived preservation of legacy/player ships and their items and instructed “Go ahead.” This supersedes the conservation-approval hold for this migration. Accounts, character UUIDs/names/ownership and appearance remain protected. The operation replaces each personal legacy Wayfarer and its inventory with the new exact source and a fresh seven-item starter kit. It does not reset the database or delete authoring drafts, native sources, reference history or celestial state.

## Implementation

Normal onboarding now selects `packages/content/src/wayfarer-current-starter.ts`: exact rebuilt source SHA-256 `56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44`, the same reviewed native wall/roof/cockpit/floor design as the preceding game integration. It uses a separately validated clear corridor spawn at (0,-2)m. The old immutable source remains available to migration/history tests. New flight, cargo and interaction installations pass their normal qualification.

`replaceLegacyPlayerWayfarer` is restricted to the existing deployment operator identity, not game accounts. Each call names the exact character, current ship and expected ship revision. It removes a bounded explicit dependency set of that ship's runtime/inventory rows, installs the full rebuilt ship, retains the existing character, resets input/seating and writes an idempotent receipt in the same transaction. Any late installation failure rolls back deletion. Foreign ship/inventory dependencies are rejected. No auth/character-appearance/authoring/global celestial table is in the deletion allowlist.

`python3 scripts/replace_player_wayfarers.py --server … --database … --audit …` defaults to a read-only plan. Explicit `--apply` executes the pinned requests and verifies every resulting character's new ship/source. Reusing the audit replays receipts without issuing more ships or kits.

## Verification

Unit/adapter coverage includes fresh rebuilt onboarding, an offline occupied authored ship, a pre-construction legacy ship, nested inventory, exclusion of another player's ship, operator denial, exact replay/conflict rejection and late-failure rollback. Final r008 `npm run build` and `npm run check` passed: 1838 tests / 309 files. The complete general smoke passed on isolated `sidereal-spacetime-dev-replacement-final-r0004-smoke`, including inventory, cargo transfers, equipment, seating, lights, combat, controls, shared motion and reconnect.

Two ordinary Dastari accounts were seeded on the old module at isolated `sidereal-spacetime-dev-review-replacement-r001-smoke` on3191, then actually replaced. Their character UUIDs and appearance remained unchanged, both ship IDs changed, old item IDs disappeared and each received seven fresh items. The accounts cannot read each other's instances and cannot call the maintenance operation; the actual server returns the explicit deployment-operator denial. Walking, qualified cockpit seating, thrust visible to the second account, exit and rejection of unseated flight pass.

The managed isolated database restarted without reset or publication, finally PID883674→891876 on the exact module. Reconnect and repeated gameplay verification retain the replacement identities. Ordinary browser screenshot `output/playwright/shipyard-boundary/wayfarer-replacement-r005-game.png` was reviewed: actual replacement actor/ship, new walls/floors and retained cockpit/fittings, one canvas and no legacy refit button.

Earlier general-smoke failures used old room routes and old wall-face expectations. The current source's audited transverse wall occupies Y5..5.25m, so a .3m actor correctly stops at Y5.55m. Tests now follow the current corridor/doorways and assert that face; no collision/placement validator changed. One full-check attempt hit the existing planet-terrain timeout under simultaneous software-GPU load; unchanged complete repeats passed. Failed snapshots/logs remain preserved.

## Pins and remaining scope

World module: `bc9d9504e35a1fba4480dad3487cefaceefa060e06fb47ccf52cf8324e9c7ce0`.
Production client: `585b1e87461d5fff76bdb8d754493507d32b395a954db7fbd28f92ac66ada552`.
The isolated browser's equivalent app build with review origin/database has digest `adc5b46324c9c682e17bf8284e0c8fb750de52e72d9b2dccf7dc668d4403a3a6`.
Current final regression snapshot `.runtime/shipyard-completion/wayfarer-replacement-r008-candidate`, source manifest `9d7f0e28e651125914729d4ab391ac21b15a07f679dfe2f6178b090ff99cdc9b`.

Normal entry audit found28characters, four old authored instances and24pre-construction legacy personal ships. Private migration requests and protected-row hashes are under `.runtime/shipyard-completion/player-replacement-*`; they contain no bearer tokens. Native and non-construction asset revisions are unchanged from the preceding release. Pressure sealing, arbitrary height gameplay, new flight ratings, localized structural damage and full performance-contract acceptance remain outside this activation. Remote ships still use the existing public exterior proxy. New native art is not marked artistically approved, and no full Shipyard contract is marked complete.

## Normal release outcome

The tested module was published to `sidereal-spacetime-dev` without schema changes or database reset. Database process 458746 and database identity remained unchanged. The guarded public-client activation installed the production digest above at https://sidereal.dastari.net (process 901687). The HTTPS index and all 24 directly referenced JavaScript/CSS assets match the release bytes.

All 28 pinned replacement requests completed and were independently verified: 28 characters, 28 ships, 28 exact rebuilt-source instances, and 196 inventory items (seven fresh starter items per character). Every current player ship uses the rebuilt source. New onboarding uses the same source. No further conservation approval is pending.

Before/after protected-row hashes match for character UUID/name/owner (28), appearance (4), identity links (1) and retired identities (1). Private evidence is preserved in `player-replacement-live.json` and `player-replacement-protected-before.json` / `player-replacement-protected-after.json` under `.runtime/shipyard-completion/`. The live apply log is `/tmp/wayfarer-replacement-live-apply.log`.

Normal HTTPS browser evidence: `output/playwright/shipyard-boundary/wayfarer-replacement-live.png`, using the existing ordinary review character after replacement, one canvas and no legacy refit offer. Isolated exact-module gameplay/restart evidence remains above. This release completes the requested player-ship replacement; it does not mark the broader Shipyard contracts complete.
