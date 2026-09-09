# Trusted personal Wayfarer starter and gameplay access

2026-09-10 — deployed and verified in the normal public game. Exacta962 world/2f5c client artifacts, real first-character UI, seven-item persistence, actual process restart and final public acceptance are recorded in [the native starter release ledger](native_starter_release_20260910.md). Earlier candidate evidence below remains historical. Existing-ship conversion is separate work.

## Exact source and allocation

`packages/content/src/wayfarer-starter.ts` fixes the starter entitlement and canonical source SHA-256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. Its vendored JSON is the same qualified source as the independently editable dashboard template; a regression compares canonical bytes. Runtime code imports content, never a dashboard app or an arbitrary client's draft. Editing a saved Shipyard document does not change the starter definition.

`packages/sim/src/wayfarer-starter.ts` combines the existing qualified instance, functional seed and flight planners. It allocates fresh instance/deck/floor/object IDs, four empty cargo containers, four sofa/grow-light entities and eleven independent station/computer/actuator IDs. The instance UUID is the ship UUID. Source placement relationships remain explicit. Every allocation checks the local used set and the supplied server identity lookup. No authoring grant, cargo contents, old ship snapshot or appearance is copied. Existing development flight ratings remain provisional physical definitions, not values inferred from native art.

The server reserves the canonical shared berth in the same transaction; the onboarding request carries only the character name. The resulting station is initially dormant and empty. Operational activation must reuse the full qualification/flight validation before creating the standing actor, and cannot occupy the pilot seat automatically.

## Exactly-once transaction

`packages/world/src/wayfarer-starter.ts` defines the synchronous trusted transaction orchestrator. A private receipt is keyed by verified account, not socket, tab, request nonce or character name. It checks live gameplay admission first. Existing accounts with an old ship return unchanged, allocate nothing and receive no new kit. A valid existing receipt returns the current actor without moving it, even if it has since boarded another ship. A receipt whose character disappeared fails into explicit recovery rather than minting another ship or kit.

For a genuinely fresh account, the orchestrator preflights the complete plan, then writes the instance, qualified functional state, dormant flight installation, validated activation, standing character/location, shared admission, private gameplay access relation, idempotent personal-only kit and final entitlement receipt. All hooks run within the same SpacetimeDB reducer transaction; no write exception is swallowed. The two private table declarations in `wayfarer-starter-tables.ts` are registered additively in `world/index.ts`.

`construction-flight-writer.ts` is the reusable actual typed database writer. It reconstitutes the exact qualified plan from the current owned instance, validates fresh device IDs and rejects any modified ratings before its first write. It writes only ship/motion/empty station/fittings/bindings. It does not itself authorize installation, activate controls, move an actor, modify cargo or grant authoring access. The existing review installer should call it after its current review permissions; the starter adapter should call it only after the one-time trusted entitlement. The review install adapter has not yet been changed to use this extraction.

## Gameplay access is separate from authoring

`packages/sim/src/game-ship-access.ts` requires the current live principal, owned character, private game-ship relation, actual ship owner, exact qualified instance revision, matching deck/location and accepted admission/world-motion system to agree. Missing, stale, foreign, suspended or cross-system facts deny access. The returned capabilities cover interior reading, ordinary walking and object use only. They grant neither blueprint editing nor refit, and never replace the occupied-station/input-lease check for piloting.

The first policy is deliberately limited to the starter's qualified single deck and creator character. A future crew invitation, owned ship transfer, additional playable deck or refit needs its own explicit validated update. No workspace grant should be issued to every player to work around this boundary. Reach, line of sight, object revision, collision/support, seating conflicts and resource rules remain mandatory after this scope check.

## Registered authority and client contract

`wayfarer-starter-authority.ts` implements the real database writer. Fresh `enterLab` requests create the exact template in namespace `trusted-starter-templates`, remap the qualified deck and doors, apply precomputed cargo/interaction seeds through their validating adapters, install dormant flight and qualify its operational station. The character starts standing at(-2,-2), not seated. The permanent construction location has no invented review-return destination. No workspace or authoring grant is created.

`game-ship-access-authority.ts` resolves actual private relations and current authentication. The instance/deck/location views, normal movement, scoped inventory, sofa/light interaction, native pilot checks and shared discovery all use this policy for the trusted namespace. Existing granted review instances retain their separate permission and recovery path. `ownGameShipAccess` is a keyed minimal projection with `shipId`, `characterId`, `instanceId`, `deckId`, `revision` and `templateSha256`; it exposes neither an authoring grant nor another actor's interior.

The personal kit is seven existing items and three personal/nested containers, validated before insertion. The four native cargo roots start empty. The public `claimStarterKit` command checks the durable receipt and cannot fall through to old laboratory storage/uniform seeding; a missing kit after redemption requires explicit recovery. The old90-piece laboratory armory does not apply to this native starter and cannot create fake legacy roots through its existing command.

The normal client must subscribe to the new access view, load the accepted instance/deck document into its native presentation, and suppress legacy LAB fixture repair for this relation. `enterLab` on an existing native character changes connected state only. Review-only return controls must stay hidden for a permanent game-owned location; their server return reducer already rejects the absent saved destination. Character appearance and current inventory remain authoritative existing rows. Root owns these client connections and final browser verification.

## Actual isolated evidence

The first candidate module SHA-256 `fb79edf092a2ccced2763be17d7dbd165f7b4cc00edc1ef63ce10b657a74c3c5` was published through the managed additive workflow to `sidereal-spacetime-dev-review-starter-provider-20260910-smoke`, identity `c200c650f5b213d218b5babd2aff798179a0b9adaa2f0645adbb0fc980706c06`. It predates the subsequent public-kit replay guard; the final candidate must include that correction.

`scripts/wayfarer-starter-provider-smoke.ts` uses the actual SDK and original-provider HTTP admission proof, with no authoring grants or admin role. Primary actor `819e9895-b656-481f-afa4-5635e4a55c0d` owns instance/ship `357bf50f-943a-4093-b2a3-9bece02008f9`; secondary actor `c1c4221d-15e2-40ed-afe3-a8ca5240eb7d` owns `620f9882-abd8-4bb9-80eb-7e14c241af08`.

Both accounts were created fresh and received independent exact native ships, personal kits and flight fittings. The proof exercised ordinary supported walking, all four native cargo store/retrieve operations, unchanged replay revisions, cross-owner and old-reducer bypass denial, sofa sit/stand and movement blocking, grow-light toggle/replay/restore, qualified native pilot entry, accepted thrust telemetry, remote replicated movement, unseated thrust denial and reconnect preserving the exact location/access/items/containers. Raw starter receipt, game access, construction instance and item table subscriptions were rejected. Proof sessions were logged out and their private token files removed.

Fresh creation was observed in the initial run; the retained logs cover the subsequent full replay journeys. Evidence: `.runtime/wayfarer-starter-provider-proof.log` (cargo/flight/reconnect), `.runtime/wayfarer-starter-provider-proof-final.log` (full repeated journey), and `.runtime/wayfarer-starter-provider-summary.json`. An intermediate harness incorrectly looked up a light by the old source placement ID; selecting its actual independently allocated placement fixed the harness without an authority change.

## Original candidate acceptance boundaries (subsequently satisfied by the release ledger)

The latest focused integration run passed54 tests across8 files, including6 actual-adapter tests and the public-kit replay regression. These include exact source equivalence, independent allocations, scope denial, old-account no-op, receipt recovery, pre-write validation and emulated transaction rollback. The late-write rollback unit test is explicitly a table emulator, not proof of restored server state.

Complete the fresh generic smoke with the native kit replay correction; retain the legacy90-component branch against a genuinely pre-upgrade fixture rather than weakening it. Run the aggregate check/build/art gates on the matched client and module. Root must review normal game rendering and controls with the owned native relation, and verify existing accounts preserve their original ships across the additive upgrade. Actual standalone restart/backup acceptance and deployment need evidence from the final candidate; earlier cargo-release restart evidence is not a new starter restart claim.

This first trusted starter is the currently qualified single deck. General Shipyard publishing/refits, arbitrary multi-deck starters, crew invitation, ownership transfer, mutable system networks and the staged external airlock remain separate work. Native art publication is not final artistic sign-off.
