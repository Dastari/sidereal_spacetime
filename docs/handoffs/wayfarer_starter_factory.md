# Trusted personal Wayfarer starter and gameplay access

2026-09-10 — new modules and tests implemented, unregistered. The current public cargo release is unchanged. This is the next onboarding integration contract, not a claim that new players already receive functional authored ships.

## Exact source and allocation

`packages/content/src/wayfarer-starter.ts` fixes the starter entitlement and canonical source SHA-256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. Its vendored JSON is the same qualified source as the independently editable dashboard template; a regression compares canonical bytes. Runtime code imports content, never a dashboard app or an arbitrary client's draft. Editing a saved Shipyard document does not change the starter definition.

`packages/sim/src/wayfarer-starter.ts` combines the existing qualified instance, functional seed and flight planners. It allocates fresh instance/deck/floor/object IDs, four empty cargo containers, four sofa/grow-light entities and eleven independent station/computer/actuator IDs. The instance UUID is the ship UUID. Source placement relationships remain explicit. Every allocation checks the local used set and the supplied server identity lookup. No authoring grant, cargo contents, old ship snapshot or appearance is copied. Existing development flight ratings remain provisional physical definitions, not values inferred from native art.

The server reserves the canonical shared berth in the same transaction; the onboarding request carries only the character name. The resulting station is initially dormant and empty. Operational activation must reuse the full qualification/flight validation before creating the standing actor, and cannot occupy the pilot seat automatically.

## Exactly-once transaction

`packages/world/src/wayfarer-starter.ts` defines the synchronous trusted transaction orchestrator. A private receipt is keyed by verified account, not socket, tab, request nonce or character name. It checks live gameplay admission first. Existing accounts with an old ship return unchanged, allocate nothing and receive no new kit. A valid existing receipt returns the current actor without moving it, even if it has since boarded another ship. A receipt whose character disappeared fails into explicit recovery rather than minting another ship or kit.

For a genuinely fresh account, the orchestrator preflights the complete plan, then writes the instance, qualified functional state, dormant flight installation, validated activation, standing character/location, shared admission, private gameplay access relation, existing idempotent personal kit and final entitlement receipt. All hooks run within the same SpacetimeDB reducer transaction; no write exception is swallowed. The new table declarations are private and unregistered in `wayfarer-starter-tables.ts`.

`construction-flight-writer.ts` is the reusable actual typed database writer. It reconstitutes the exact qualified plan from the current owned instance, validates fresh device IDs and rejects any modified ratings before its first write. It writes only ship/motion/empty station/fittings/bindings. It does not itself authorize installation, activate controls, move an actor, modify cargo or grant authoring access. The existing review installer should call it after its current review permissions; the starter adapter should call it only after the one-time trusted entitlement. The review install adapter has not yet been changed to use this extraction.

## Gameplay access is separate from authoring

`packages/sim/src/game-ship-access.ts` requires the current live principal, owned character, private game-ship relation, actual ship owner, exact qualified instance revision, matching deck/location and accepted admission/world-motion system to agree. Missing, stale, foreign, suspended or cross-system facts deny access. The returned capabilities cover interior reading, ordinary walking and object use only. They grant neither blueprint editing nor refit, and never replace the occupied-station/input-lease check for piloting.

The first policy is deliberately limited to the starter's qualified single deck and creator character. A future crew invitation, owned ship transfer, additional playable deck or refit needs its own explicit validated update. No workspace grant should be issued to every player to work around this boundary. Reach, line of sight, object revision, collision/support, seating conflicts and resource rules remain mandatory after this scope check.

## Remaining adapter and acceptance work

1. Register the two private tables with no backfill/reset, after the currently separate flight integration passes. Keep existing character onboarding branch unchanged.
2. Implement the actual trusted instance writer and standing game location contract. `workspaceId` must identify a server-owned template namespace, not create a writable workspace for the player. Gameplay views must resolve the private game-ship relation without exposing authoring documents to unrelated actors.
3. Reuse cargo/interaction approach qualification and state writers with the preallocated seeds. Current review installers each allocate their own seed stream; blindly calling both would ignore planned IDs. Either extract their validated batch writers or use one explicitly recorded allocation plan consistently. Do not insert old laboratory storage contents.
4. Connect the complete dormant flight writer and full activation validator without bypassing physical qualification or requiring artificial authoring grants. Keep station unoccupied and spawn actor on qualified standing support.
5. Apply game-owned access in interior read, movement, cargo, sofa/light and native pilot scope adapters. Preserve the authoring-grant review path and grant-loss safe egress as a separate alternative; replacing all permission checks with owner equality would be incorrect.
6. Wire only the genuinely fresh-character branch to this transaction. Reconnect and existing accounts must preserve old ships, appearance and every inventory UUID. Personal kit seed remains idempotent and must not call the legacy ship-storage refill path.
7. On an isolated fresh database, prove two real accounts receive distinct full ships/containers/fittings, can walk/use cargo and qualified controls without any authoring grant, and cannot inspect or mutate the other's interior. Test receipt replay across new sockets, rollback at a late write, reconnect/process restart, existing-account upgrade and private raw-table denial. Then review the normal game and publish matched artifacts.

## Verification scope

Twenty-one focused tests across four files currently pass: exact source equivalence, complete independent allocations, empty cargo, global UUID collision denial, foreign/stale/current-system access guards, old-account preservation, retry after boarding elsewhere, missing-character recovery denial, full write order and exception propagation. The factory test demonstrates rollback using an emulator; the writer's table double deliberately has no rollback. Neither is an actual published-module recovery claim. Full TypeScript and ESLint checks pass for these modules. The concurrent combined check passed1,110 tests in188 files and art checks before the last two additional missing-state cases. Actual provider onboarding and a final matching build remain necessary before registration or live activation.
