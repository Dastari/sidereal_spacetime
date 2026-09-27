# Wayfarer rebuilt game candidate — 2026-09-12

Status: historical integration check-in. The owner subsequently waived ship/item conservation and authorized replacement; all 28 player ships are now rebuilt. See [the live replacement handoff](wayfarer_player_replacement_20260912.md). The conservation hold below is superseded; this record remains evidence of the earlier candidate, not full contract completion or art approval.

## Exact design

The rebuilt source is `packages/content/src/wayfarer-rebuild-r002.json`, canonical SHA-256 `56e485c9a9d49b5aa0c5e44a47f88916296896717df386b7240baf408e28ae44`. It retains the original 10×22 m structural footprint, all 51 floor identities and 81 native fittings/objects, including the original cockpit, controls, engines, storage and furniture. It replaces 130 legacy structural placements with the boundary-treatment system, 12 partitions, 8 open passages and 10 room labels. The port corridor moves to X=-1.5 m to keep the original storage approaches clear; fittings do not move.

The main deck uses the approved .1875 m floor / 3 m clear / .125 m roof / .1875 m service void profile. The original lower cockpit stays unchanged. An authored U-shaped roof step connects the retained low roof to the new main roof. Native replacement walls remain inside the floorplan. Floor surfaces use closed .1875 m slabs with interchangeable normal-mapped finishes.

Native additions are preserved under `assets/art-library/designs/shipyard.structure.wayfarer-transition/`: r002 125 mm internal spacer GLB `9ae55fc62ec463eb434ddb7567c625010a96bb469a7a7416c19908ad63d2b390`; r003 roof-step GLB `cf008a583532494febff62ee58ce5cdb2e065d5095a08748efebca54d4ab8922`. The Blender sources, rejected r000/r001 attempts, measured datums, export audits and renders remain in that design ledger. New art is unapproved.

## Implemented game integration

The exact source has a separate game qualification adapter: 126 native wall placements, 42 main roof placements and the roof step; 169 collision obstacles including retained object geometry and bow reservations. Source identity remapping is checked against the exact source, and unknown edits cannot inherit its qualification. Walking, floor support, cargo approaches, cockpit seat binding, fuel mount and development flight definition adapters accept this exact candidate. The existing validators and old native certificates are preserved.

The new owner-only offer and `refitRebuiltWayfarer` transaction preserve runtime identity and state. The existing Ship refit control now offers the rebuilt candidate for compatible authored Wayfarers. Its report identifies the actual ship, expected revision, target SHA, retained objects, removed structures and inventory counts. The user must review that report before applying the expected-revision transaction. Opening the panel performs no refit. Older worlds without the new offer remain usable and report the rebuild unavailable.

## Conservation and authority evidence

Two ordinary Dastari game accounts, without construction-authoring grants, were tested on `sidereal-spacetime-dev-review-rebuild-r002-smoke` at the isolated server `127.0.0.1:3191`.

- Both original ships refitted to the exact target at instance revision 2, retaining actor, ship, deck, floor, fitted object, station and flight fitting identities.
- Each test retained 7 inventory items, its 3 actor-visible containers, hotbar, appearance and 10 flight fittings; the server conservation report additionally covers all 7 containers; refit preserved ship position, velocity and heading.
- Exact operation replay did not repeat the edit. A changed replay request and cross-owner refit were rejected. Private base table subscriptions were rejected.
- Walking stopped at the new port wall around X=-1.2 m with a .3 m actor radius; the passage at Y=-5 m remained traversable. The retained cockpit approach and control seat worked.
- Piloting moved the ship as observed by the second account. Unseated flight input was rejected. Reconnect preserved the same ship.
- The managed isolated database restarted without module publication or data reset. Both accounts reconnected with the same identities, exact source, state and replay receipt.
- Real transaction tests additionally conserve a mounted tank containing 37.5 litres, and reject a refit when an actor occupies a future wall reservation.

Private raw evidence is in `.runtime/shipyard-completion/wayfarer-rebuild/game-smoke-summary.json`; token files are separate and are not report artifacts. The repeatable test is `scripts/wayfarer-rebuild-smoke.ts` with explicit isolated database and provider-file inputs.

## Candidate and visual evidence

Final world module SHA-256: `ffae9acadf56420a8e8dff0d68dc3857b26f7ed72998466e6fcdca674660ee91`, identical to the corrected r004 two-account/restart/generic-smoke candidate. Final source snapshot: `.runtime/shipyard-completion/wayfarer-game-r007-candidate`; source manifest `89b227ff5242ee1e78e12067faca626e3709e6ca24f0a9bc6efdd429fa4acf05` (1478 files). Production client SHA-256 `d61fafd35674619b31608c35c7f3b4432e75aa1e612e046fa7ff4ffd5462fe00`. Full build and check pass: 1833 tests/309 files and 86 documents. One full-check run hit an unrelated planet terrain timeout under concurrent build load; the unchanged candidate passed the complete repeat. Asset validation passes. An optional whole-art-library source inventory check still reports the existing unregistered `reference/art/editor-mockup-5.png`; no reference was removed or silently approved.

Initial candidate source manifest: `4e819cc7d95128dc7842cb95f125f2bfb73393383673c84d0d77d62e528c04db` (1471 files). Earlier candidate directory `.runtime/shipyard-completion/wayfarer-game-r003-candidate`, manifest `ffab02a037e55e19e43e42b936cf2f852f4180d3ba645a62d1471644c7cfca14` (1476 files).

Real Shipyard screenshots: `output/playwright/shipyard-boundary/wayfarer-new-system-first.png` and `wayfarer-new-system-roof.png`. The exact design loads all 81 retained placements and all requested native pieces, with 51 solid floors and no native-fit errors.

Real isolated game screenshot: `output/playwright/shipyard-boundary/wayfarer-game-r002-deck-f3.png` shows the rebuilt deck/cockpit with the actual ordinary game actor. Initial F3 screenshot `wayfarer-game-r002-deck-diagnostics.png` exposed 1887 draws and 2146 total meshes. This failed the rendering gate and triggered opaque native instancing while retaining per-placement cutaways. The original ship in the same client/browser at 960×640 measured 656 draws, 1346 meshes and 11 ms Render CPU (`wayfarer-original-same-client-f3.png`). Software GPU timing is not a substitute for the owner's RTX 4080 timing. Cross-asset exact-material batching then measured 772 draws, 356 active/2095 total meshes and 12.40 ms Render CPU in the stationary rebuilt scene (`wayfarer-game-r005-counters.png`). The new source has additional taller boundary/partition geometry and preserves separate original meshes for per-placement fades. This explains the retained allocation overhead; it does not satisfy the mesh target or constitute acceptance of the 17.7% draw/12.7% CPU increase over that controlled original scene. The 900-draw target passes, full performance contract remains open. r007 adds the missing exact-source engine-effect display allowlist; final r007 browser evidence is recorded below.

## Limits and owner check-in

No live ship has been refitted. The task brief requires: “do not touch the live ship before the owner approves the conservation report” (`shipyard_completion_agent_prompt_20260911.md`, line 82). The new panel provides that concrete per-ship report; an agent test account's confirmation is not the owner's live-ship approval.

Proposed owner defaults: accept this exact reconstruction as the game replacement after reviewing its per-ship conservation report; retain existing flight ratings; leave passages open until a separately qualified operational door family is delivered. Artistic approval remains separate.

Pressure sealing, structural strength, localized structural damage, new flight ratings, arbitrary edited assemblies, arbitrary height families, operational doors and multi-deck gameplay are not qualified by this candidate. Existing cockpit bevel seams remain visual seams, not a pressure seal certificate. Remote ships retain the published stock exterior proxy, not a private interior or a newly qualified reconstructed exterior. New-character starter selection remains the original template; this release provides an explicit conservation refit for existing authored Wayfarers. No A/B/C1/D contract is marked complete.

## Browser-driven correction and repeat qualification

The ordinary browser caught a false conflict not exercised by a stopped SDK session: idle input sequence/timestamp and inactive aim updates were included in the conservation fingerprint. The reviewed checkbox therefore invalidated while the actor, ship and inventory were unchanged. Only these consumed intent rows are now omitted from the conservation hash; the transaction still revalidates all live movement inputs and rejects active input, and retains all actor position, ship motion, inventory and installed-state checks. Four added authority regressions cover idle row arrival/removal, heartbeat/aim churn and substantive conflict rejection.

The corrected module is `ffae9acadf56420a8e8dff0d68dc3857b26f7ed72998466e6fcdca674660ee91`. Candidate `.runtime/shipyard-completion/wayfarer-game-r004-candidate` has source manifest `2475d06ebea89e2f49a07d0f716f75419b9a6448e4e23b3f2ef1808fb4203dbc`. Full build/check passed (1828 tests/308 files). The production client is byte-identical to the staged `7934f8…` client. The repeated two-account integration on `sidereal-spacetime-dev-review-rebuild-r004-smoke` passed refit, replay, privacy, walking, cockpit/piloting, remote motion and reconnect. Generic smoke passed on a fresh separate database as well.

The actual browser panel then converted the stationary baseline test ship successfully: it first refused an actor at(-2,-2), admitted the actor after walking to clear central floor, displayed the server's seven-container conservation report, required explicit review, applied the refit, and removed the refit button. Screenshot `wayfarer-rebuild-conservation-panel.png` is the concrete ordinary game report. The failed checkbox state is preserved separately as `wayfarer-review-heartbeat-failure.png`.

Thin instancing measured1018draws/450active/2232total meshes in the two-account rebuilt scene (`wayfarer-game-r003-optimized-f3.png`), versus1887draws before. This thin-instance attempt was superseded by exact-material batching; no full performance acceptance is recorded.

## Final review and release package

Shipyard now exposes New → Import an existing design → Open rebuilt Wayfarer. It creates a separate editable draft and preserves the prior draft. `wayfarer-r005-preset.png` was reviewed at 960×640: rebuilt walls, retained cockpit, 51 floor tiles, zero layout/native-fit errors. Both exact Wayfarer source revisions now enable authored flight effects; unknown edited revisions cannot inherit that display qualification. Normal publication does not automatically refit any existing ship.

All screenshots above are under `output/playwright/shipyard-boundary/`. Private account tokens are excluded. Final source hashes match the shared tree at freeze; non-construction non-code production assets have zero changes or removals versus the existing live client.


### Activated release

On 2026-09-12 the managed normal publication updated database `sidereal-spacetime-dev`, preserving identity `c2005c24147323197826efa22f24e30d2d99a93a5a5091949f2ad25fa2127572`, with `--delete-data=never`. The module artifact remained `ffae9acadf56420a8e8dff0d68dc3857b26f7ed72998466e6fcdca674660ee91` after publication. The migration report added the rebuild offer and the previously prepared private construction cargo tables/views carried in the tested candidate; it reported no removed table. Raw publication log: `/tmp/wayfarer-rebuild-r007-live-publish.log`. The database metadata's `initial_program` is historical and is not used as the active module hash.

Public client activation used expected-live `c2cb7dad161399f307b169347313a9c5e01748e5109cbfaeec9361a87eb6d03e` and expected-staged `d61fafd35674619b31608c35c7f3b4432e75aa1e612e046fa7ff4ffd5462fe00`. HTTPS index and every directly referenced script/stylesheet match the activated artifact byte-for-byte. No live ship refit was invoked.

Exact r007 game screenshots, all reviewed: `wayfarer-game-r007-deck-f3.png` shows the rebuilt cockpit/deck with the real actor (790 draws, 373 active/2188 total meshes, 21.50ms Render CPU in this software-GPU two-account scene); `wayfarer-game-r007-exterior-f3.png` shows roof-on local flight view (360 draws, 154 active/2205 total meshes,20.30ms Render CPU); `wayfarer-game-r007-two-ships.png` shows both the reconstructed local ship and the separate existing stock remote exterior. Software GPU results are not an RTX4080 timing claim, and remaining allocation/timing work still blocks full contract performance acceptance.

Normal HTTPS browser verification used the ordinary review account's existing ship `d00e8875-2443-4e86-914a-42827aca9d2e`. The real rebuilt offer displays 1 crew,99items,18containers,81retainedobjects and130structural replacements, revision1→2 and the exact target hash. The game reaches ready with one canvas. This is that test account's actual conservation report, not the owner's approval or a dry-run count inferred from fixture data. No checkbox/application was authorized or invoked in the live database.

`wayfarer-r007-live-conservation.png` is the reviewed normal-HTTPS screenshot: existing ship remains unchanged, conservation checkbox is unchecked and Apply is disabled. The ordinary browser session was then blanked and the isolated 5187 review client stopped to release resources; candidate artifacts and the isolated3191 database remain preserved. Normal game and Shipyard services remain running.
