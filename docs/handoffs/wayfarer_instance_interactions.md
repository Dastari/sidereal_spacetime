# Qualified Wayfarer instance interactions

Updated: 2026-09-10. Registered and passing focused authority tests, a fresh isolated module publication/smoke, and two real-provider instance journeys. Coordinator browser review is in progress. This revision is not yet the normal public world.

## Implemented scope

Each newly spawned exact qualified Wayfarer template receives one sofa interaction and three independent grow-light switches, with new server UUIDs and actual remapped placed-object identities. Existing `interactionObject` rows hold enabled/revision state; existing `couchSeat` uniqueness still holds occupancy. A new **private** `construction_interaction_binding` table associates those objects with the exact instance/deck/source placement/revision and any pending supported recovery. It does not copy another ship's interaction state or inventory.

The source blueprint is `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. `planQualifiedWayfarerFunctionalSeeds` supplies existing development definitions; the source and UUID map are checked again against current native collision proof. Changed document bytes or maps invalidate the bounded proof cache. No reactor output, power consumption, medical effect, health, pressure seal or physical load rating is inferred from the art. The grow-light switch changes enabled state only; it does not claim a routed electrical network.

The sofa's existing `(2.25,3)` approach is supported and reachable from the template spawn. The third grow light's old approach `(-2.4,-0.625)` intersects current native clearance; its new interaction approach is `(-2.375,-0.875)` on existing clear floor. Its model placement is unchanged. The other two light approaches retain their existing definition positions. Actual swept-radius route evidence is retained in `.runtime/wayfarer-semantic-candidate-r001/interaction-walking-review.json`.

Seating uses the current published seat-pose root convention: actor XY `(3.3,3)` with the normal deck floor datum `0.1875` m. This preserves the existing seated animation integration; it is not an assertion of final hip/foot contact art acceptance. The entry/exit sweep excludes only that exact sofa's one native obstacle and its derived collision segments. Other equipment, floors and wall collision remain active. The actor's supported floor approach must be clear; no arbitrary client destination is accepted.

## Authority and recovery

`interactWithConstructionObject` validates current game admission, accepted actor/visit/instance/deck, current source/revision, input-control lease, standing/traversal conflicts, workspace read/spawn grants, actual reach and a clear native approach. Operations use the existing character receipt ledger and expected interaction revision. Seat occupancy is unique; an unchanged light command does not rewrite the object row. Seated motion remains suppressed by the existing `couchSeat` movement guard.

Standing, disconnect and auth/grant loss request supported release. Seven bounded nearby floor exits are checked against the real swept body and other accepted actors. If all exits are blocked, the actor remains seated with a pending recovery flag; neither the legacy leave path nor a retry can delete its support. The world retries only bindings in the `by_recovery=true` index. Repeated blocked retries and an empty recovery set produce no character/object/binding writes. Release changes only that actor's accepted XY, clears their controls, and updates the occupied object's revision.

Grant-loss recovery stands the actor on supported floor. It **does not** grant ordinary workspace walking or interaction again. The shared construction movement hook requires both `draft.read` and `instance.spawn`; revoking either keeps that actor frozen; the existing explicit review-return action remains available after standing. This is the current development review-return contract, not physical airlock/docking traversal.

General `ownInteractions` rows are filtered to the actor's accepted instance and deck and disappear when workspace read access is revoked. The keyed, game-admitted `ownConstructionSeat` projection preserves only eight fields while the actor remains supported: character/instance/deck/object IDs, accepted XY, root elevation and pending-release flag. It contains no instance document, other equipment, inventory, model URL, name or restored capability.

## Applied integration hooks

- `construction-instances.ts`: installs cargo, then the four qualified interaction objects after the native instance is created. Existing instances are not silently migrated. Review exit refuses an occupied couch seat; stand/recovery must complete first.
- `interactions.ts`: dispatches actual bound objects to the instance adapter; its existing `ownInteractions` projection remains the UI row contract. `leaveCouch` delegates bound seats before the legacy fixture path, preserving pending support.
- `auth.ts`: passes a disconnect/auth-loss reason through that existing leave path and preserves all JWT/session/input proof logic.
- `construction.ts`: actual read/spawn grant revocations and expiry events request recovery for the affected principal/workspace. There is no all-actor polling pass to detect empty work.
- `world/index.ts`: registers the private binding, keyed minimum own-seat view, and pending-only recovery hook after grant expiry. Bindings are generated by the managed generator.
- Coordinator App/net: subscribes to `ownConstructionSeat` for minimum seated pose after general view loss. Existing interaction rows use actual placed UUIDs. The generic per-placement material/emission controller already accepts those UUIDs, so construction light state uses the existing renderer path.

`requireNoOccupiedConstructionInteractions` is implemented and tested for future structural refit/capture/delete handlers. No such general live instance refit handler is claimed complete here. Any future structural edit must call this guard before removing/changing occupied support or recovery routes, alongside stair/ladder reservations and cargo lifecycle checks.

## Validation record

The focused registered adapter/auth/construction set passes **34 tests**. These include exact-native installation, independent instances, occupied-seat conflicts, replay/revision checks, light no-op writes, blocked recovery with twenty idle retries, actual grant-expiry and legacy-leave dispatch, minimum own-pose privacy and source changes after cached qualification.

Managed fresh named smoke passed for `sidereal-spacetime-dev-wayfarer-interactions-20260910-smoke`; `.runtime/wayfarer-interactions-smoke.log` includes successful module initialization and the standard persistence/combat/appearance/reconnect scenarios. The bundler reports function-reference cycles through auth/interaction and construction/grant adapters; the successful fresh module run verifies actual initialization, rather than relying only on TypeScript.

The real PKCE provider journey passed on both instances `48963655-23c6-4a04-b324-0cd358cae70c` and `15bebca1-d034-4b24-aa26-dbb413df656a` in that named database. It verified light toggles, operation replay and stale revision denial; sofa seating and replay; suppressed seated movement; disconnect recovery to supported floor with the same visit; read-only grant revocation releasing the seat and removing private views; subsequent walking/interaction denial; and return to the original ship with character/inventory UUIDs preserved. This found and fixed a real shared movement check that previously accepted spawn permission without read permission. An actual world-hook regression now covers the partial-grant case.

Evidence is `.runtime/wayfarer-interactions-review/{fixture,journey,cleanup,role-denial}.json`. The temporary administrator role was revoked, a fresh provider token was denied administrator mutation, only the helper's provider session was logged out (204), and temporary token files were deleted. Ordinary workspace grants remain temporarily available for the coordinator's browser. The third grow light in each instance remains intentionally off from the test; the other two remain on.

Four transitive SDK mocks were extended only at their schema host boundary. Real SDK primary-key metadata now covers the minimum seat and cargo/carried projections. Those four suites pass 70 tests; combined `npm run check` passes 173 suites / 1,023 tests, TypeScript and 76 document checks. The additive corrective republish succeeded; its generic smoke runner subsequently rejected stale berth expectations because this database already contains the retained instances. That reused-fixture failure is not claimed as a fresh baseline pass.

Final gameplay screenshots, remaining combined build/art gates and public activation remain the coordinator's release gates. Native material and source meshes are unchanged; publication is separate from final art sign-off.
