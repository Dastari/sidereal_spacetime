# Shared-system spatial and motion rules

Status: shared authority registered and generated; two isolated authority smoke
runs passed, 2026-09-10. Pure rules, retained subscriptions, cache and remote
exterior adapter are implemented. Root client/render wiring and real-provider
multiplayer browser acceptance are pending. No normal database or public service
was published by this specialist. Later sections supersede historical staging
notes in earlier sections. The parent owns activation and release.

## Interfaces

`packages/sim/src/spatial-cells.ts` exports:

- `spatialCell({x,y}, width=400)` returns integer `{cellX,cellY}` using floor,
  including negative coordinates. Authority adapters convert to i64 with `BigInt`.
- `neighboringSpatialCells(cell)` returns nine stable row-major cells.
- `withinSpaceDiscovery(observer,target,radius=400,width=400)` performs the exact
  squared-distance second pass after candidate-cell lookup. Radius cannot exceed
  width. This does not grant discovery: the caller must prove same-system
  admission, observer ownership and allowed row/column projection.
- `validateSpacePoint` rejects nonfinite positions and coordinates outside
  ±1,000,000,000 meters per axis. No clamping occurs. This is system-local world
  XY, not ship/deck-local coordinates, and not camera-relative GPU coordinates.
  It keeps f64 spacing below the existing 1e-5m contact tolerance. A future wider
  system needs a precision design, not a silent limit increase.

`packages/sim/src/system-space.ts` exports `stepSystemSpace(bodies,controls=[])`.
The authoritative caller supplies every dynamic ship and rock in one system or
complete contact island exactly once. Bodies use existing `RigidBody` capsule/
circle physics. `SystemFlightControl` holds `bodyId`, already-checked `enabled`,
`intent`, compiled `mass`, `actuators`, `profile`, forward and reverse speed limits.
The ship body and IFCS mass/inertia must agree. The caller remains responsible for
occupancy, installed/powered equipment, resource authorization and fresh intent.

The function performs three existing 1/60s IFCS kicks and shared contact drifts,
amounting to one fixed 50ms tick. It never computes elapsed wall time or catches up.
It uses the existing IFCS force allocator and conservative contact impulse solver;
it discards the IFCS helper's tentative position drift so a body cannot drift twice.
All ship kicks occur before each common drift. Stable body IDs fix processing order.

Result: `bodies`, `changedBodyIds`, per-body actuator `commands`, `impacts`,
`exhausted`, optional `reason`, and `completedSubsteps`.
Write only changed motion rows. A body without movement has no new motion-row tick.
Commands are the last requested actuator presentation, not an integrated fuel or
energy accounting ledger. They must not be used to infer consumed resources when
an exhausted substep has been partially advanced or rejected.

Limits are 64 bodies, 64 controls, 256 actuators per ship and 1,024 actuators total.
Over-budget islands return all input state unchanged and an explicit failure
reason; no body is dropped. Invalid admitted IDs, coordinates or inertial data
throw before solving. A contact-budget failure preserves the solver's last safe
state and momentum, then stops the rest of the tick without extra force kicks.
A coordinate/motion-bound failure rolls back that entire substep. No remaining
wall time is queued. Capacity expansion requires a proper conservative broadphase/
island design; dividing ships into separate calls with the same rocks is invalid.

## Capsule prerequisite

The existing contact solver rejected capsule/capsule pairs. The narrow proposed
patch is `shared_capsule_collision.patch`: it adds finite-segment closest points
for two real hull capsules, keeping the existing conservative advancement,
impulses, rotational bounds and fixed budgets. Parallel overlapping spines choose
their overlap midpoint to avoid arbitrary endpoint torque. Existing capsule/circle
and circle/circle behavior remains on its original code path. No outer-circle hull
approximation is substituted.

The parent lifted the release freeze and the scoped patch is installed in actual
`packages/sim/src/collision.ts`. Capsule tests are now
`packages/sim/src/collision-shared.test.ts`; all 29 focused tests pass against actual
source, including the original ten contact regressions. The patch artifact is
historical integration evidence and must not be applied twice.

## Evidence and remaining integration

Candidate validation: 29 tests across four files passed, including all ten existing
collision regressions, five spatial tests, nine system-step tests and five capsule
extension tests. Logs: `.runtime/shared-space-tests.log`. Tests cover once-only
shared-rock drift, force/order independence, immutable/resting input, pair momentum/
energy, endpoint and side/angled hull contacts, rotating hulls, bounded exhaustion,
negative cells, exact range boundaries and invalid data. These are correctness
results, not load capacity or FPS measurements.

The full TypeScript pass is clean after parent registration of the concurrent stair
exports. Sim subpath exports `./spatial-cells` and `./system-space` are installed.
Actual-source focused log: `.runtime/shared-space-actual-tests.log`.

No canonical system seed or live migration should be enabled until actual-source
capsule/system tests and authority integration pass. The authority adapter must
prevent duplicate body IDs, recheck pilot authority each tick, preserve canonical
body identity, apply system membership and write only changed rows. Separate two-
account discovery, privacy, physics, reconnect and persistence smoke/browser tests
remain required. These helpers do not make the current private lab multiplayer.

## Staged seed/admission authority contract

New content `shared-system.ts` pins system UUID
`ad7bf00a-caa0-50ee-b307-332afaac71a1`, seed r001 SHA256
`8a02fde759417e1cf78165dd394093ccb0fef87e34fd4556a8076681d7bb8136`.
Sixteen existing lab descriptors have stable canonical UUIDs independent of an
account. Four asteroids move; charted planets/stars are not planar colliders.
New canonical UUIDs are deliberate; private legacy IDs and divergent motion are
retained and mapped explicitly, never silently merged or deleted.

`shared-world-tables.ts` exports seven private definitions: `worldSystem`,
`systemBody`, `bodyWorldMotion`, `shipWorldMotion`, `worldAdmission`,
`worldJoinReceipt`, `legacyBodyAlias`. Both lean motion tables have by-system and
(systemId,cellX,cellY) B-tree indexes. No authority table is public.

`shared-world.ts` exports `ensureCanonicalSystem(db)` and
`joinSharedSystem(ctx,{characterId,shipId,expectedShipRevision,
expectedAdmissionRevision,operationId})`. The root must wrap the latter in
`auth.gameAction` when exposing a reducer. The adapter also checks the exact live
game connection, principal, actor/ship ownership, current stock-ship location,
revision, UUID operation ID and replay identity. No caller coordinate is accepted.

Join is explicit, not an automatic login reset. It reserves a deterministic clear
berth using conservative current Wayfarer hull bounds, preserves velocities,
heading, UUIDs and local deck/item/character state, clears stale movement intent,
and records old/new world motion plus every legacy body's private snapshot/alias.
It increments the ship revision once and installs admission revision1. Repeat of
the same request is write-free; other requests cannot reset an admitted ship.
Sixty ships plus four rocks match the initial contact-island budget. Berth selection
is bounded to256 candidates; it is not a complete authored-ship mass/hull compiler.
The existing ship motion is mirrored at initial migration only. The parent must
overlay lean motion in its private own-ship projection and route every subsequent
space command/tick to the authoritative lean state for admitted ships.

Root integration requirements before enabling this:

- Register the seven private tables and generate bindings.
- Publish the explicit join reducer using the normal game-auth wrapper.
- Skip legacy body seeding and per-ship physics for admitted ships.
- Use once-per-system stepping and keyed authorized discovery, with actual ship
  mass/control authority and current server-owned observer center.
- Keep legacy source rows private and immutable once their ship joins.
- Block development identity migration for admitted actors until the identity
  transfer path includes these new rows; do not strand membership under a retired
  principal.
- Prove real isolated reducer transaction rollback, two-account privacy, canonical
  IDs, deterministic berth selection, persistence and reconnect before normal
  world migration or production activation.

Eight adapter tests pass (`.runtime/shared-world-tests.log`): exact seed hashes,
write-free seed/replay, two accounts/one canonical system, distinct berths, UUID/
local-coordinate/legacy-momentum preservation, live connection/ownership/revisions,
partial-installation detection, unknown legacy mappings and capacity/bounds.
Full TypeScript check is clean. These mocked-table tests do not prove server
publication, rollback or multiplayer browser behavior; those are parent gates.

## Authorized views and scheduled physics: next root wiring

`shared-world-views.ts` exports these exact keyed projection/function pairs:

| Projection | Function | Suggested wire name |
| --- | --- | --- |
| `ownWorldAdmissionProjection` | `ownWorldAdmission` | `own_world_admission` |
| `visibleShipMotionProjection` | `visibleShipMotion` | `visible_ship_motion` |
| `visibleShipDescriptionProjection` | `visibleShipDescriptions(ctx, resolveExterior)` | `visible_ship_descriptions` |
| `visibleBodyMotionProjection` | `visibleBodyMotion` | `visible_body_motion` |
| `visibleBodyDescriptionProjection` | `visibleBodyDescriptions` | `visible_body_descriptions` |

Each root `db.view` uses `t.array(projection)` and `auth.gameView(fn)`. They do not
broaden `ownShips` or `ownCharacters`. The helper independently gates the admitted
principal and one selected/connected actor, derives its center from server-owned
ship motion, queries nine `(systemId,cellX,cellY)` indexes and checks exact400m
range. It emits only explicit columns. System-charted bodies remain visible while
nearby rocks enter/leave by range. No client viewport/cell argument is authoritative.
Construction visitors and retired principals get no contacts. With more than one
admission per account the first-slice view fails closed rather than choosing the
first arbitrary actor; multi-character selection needs its own canonical row.

The server-side exterior resolver returns only
`{publishedExteriorAssetId,appearanceRevision}` for a known published stock hull.
It must not serialize an owner's private assembly or invent a catalogue identifier.
Unknown/unpublished exterior mappings produce no description. The motion view can
still convey an authorized contact; the renderer should wait for a supported
published descriptor before creating geometry.

Views cannot inspect wall-clock expiry. They rely on the existing server expiry
path to remove expired admitted session rows; do not disable that scheduler.
Unsubscribing client SQL is not revocation. Isolated tests must prove revocation
removes already-subscribed rows under arbitrary wildcard and foreign-cell SQL.

`shared-world-physics.ts` exports `stepSharedWorld(ctx, systemId?)`, defaulting to
the pinned canonical system ID. After existing session/input/grant expiry handling,
call it **once** inside the server-only50ms `stepWorld` reducer. Keep its existing
`ctx.sender === ctx.databaseIdentity` gate. The legacy per-ship loop must begin:

```ts
if (ctx.db.shipWorldMotion.shipId.find(target.id)) continue;
```

Also skip `seedBodies(existing.shipId)` in `enterLab` when that ship already has
shared motion. Shared bodies never enter `stepLabSpace`, and old per-ship body
rows remain private migration evidence. Parent own-ship view overlays the six
motion fields and `tick: shared.serverTick` from the lean table onto the owned
static ship row. Ship edits/control still retain their private revision/authority.

The adapter checks occupied operational station, matching actor and admission,
fresh/nonfuture input, the exact input-holder connection and current installed/
powered lab flight computer. No caller-provided force or transform is accepted.
It runs all stock ships and dynamic rocks through the common three-substep solver,
then writes only `changedBodyIds`; changed cell keys are part of those same writes.
The complete installed actuator output set is initialized once, including zero
rows, so existing engine-status views retain their contract after automatic entry.
Subsequent identical outputs are not rewritten; existing nonzero output is cleared
when actuation ceases. Planet/star descriptors are excluded from planar collision.
Neither old ship motion nor legacy body rows receive physics updates.

Returned `SharedPhysicsReport` gives status, budget reason, body count, changed
motion/output counts and impacts. Record exhaustion through the normal bounded
telemetry policy. Do not retry remaining wall time, silently drop bodies, swallow
partially-mutating subsystem errors, or advertise the64-body cap as measured
player capacity. `serverTick` now uses the synchronized authoritative sample
`ctx.timestamp.microsSinceUnixEpoch / 50_000n`, both on initial admission and each
changed motion. The private `worldSystem.lastSimulationTick` prevents duplicate
integration at one sample and holds on timestamp regression. A new admission's
motion stamp does not imply the system already stepped. The system clock costs
one small write per active sample (changed motion or actuator output), while a
completely idle sample writes no clock or motion rows. Legacy ticks remain in the
private old-motion migration snapshot; they are not used as interpolation time.

Additional focused tests: seven authorized-view cases with real SDK key metadata
and six physics adapter cases, together with the eight seed/admission tests all
pass (21 tests, `.runtime/shared-world-integrated-tests.log`). These verify negative
cell/range boundaries, shared canonical IDs, row/column privacy, charts, revoked/
foreign/ambiguous admission, once-only shared-rock stepping, idle zero writes,
station/lease/session checks, future/stale intent, negative crossing and whole-
island capacity fallback. Full TypeScript check is clean. Root registration,
generated bindings, actual authority smoke and browser integration remain pending.


## Client cache and render-only interpolation

New `packages/net/src/shared-world-store.ts` is unconnected to App/transport until
the parent finishes the corrective auth release. It has no new dependency or net
package export-map mutation. `SharedWorldStore` owns bounded maps for ship/body
motion, published descriptions and one own admission, plus per-entity sample
buffers. The public row interfaces match the new keyed views without importing
not-yet-generated bindings.

Integration pattern:

```ts
const store = new SharedWorldStore();
const epoch = store.beginEpoch();
// Retain all SDK listener handles with the connection's existing resource owner.
// onInsert: store.upsert("shipMotion", row, epoch)
// onUpdate: store.upsert("shipMotion", newRow, epoch)
// onDelete: store.remove("shipMotion", oldRow.shipId, epoch)
// Repeat for bodyMotion, shipDescription, bodyDescription, admission.
```

Disconnect or accepted admission replacement must call `beginEpoch` before a new
socket's rows are accepted. Old callbacks carrying the old epoch are ignored.
Unbind old listeners/subscriptions through their resource owner as well; epoch
rejection does not itself free SDK subscriptions. Use SDK aggregate table events
when scopes overlap, rather than treating an individual subscription's removal as
a global entity delete. Client scope choices still grant no server visibility.

`getSnapshot` and `getTableSnapshot(table)` keep stable immutable references until
their relevant rows change. `subscribeTable` allows `useSyncExternalStore` consumers
to follow only their needed table; it does not force inventory/character UI to
rerender on remote motion. `batch(fn)` combines notifications, suitable for one
accepted transport batch. Cache bounds reject extra rows instead of allocating
unbounded memory: default64 ships,32 bodies,one admission,eight samples per entity.

Render each supported published exterior from a description+motion pair.
`sampleShip(id, nowMs, delayMs=100)` / `sampleBody` interpolate accepted coordinates
using bigint differences between50ms server stamps and the shortest heading arc.
Never feed these presentation coordinates back to authority. Samples hold at the
latest accepted pose rather than extrapolating indefinitely. The returned `stale`
flag means last motion-sample age over1s only; an idle ship may legitimately have no
new motion rows. It is not a disconnect or discovery decision and must not hide an
otherwise authorized stationary ship. Actual view deletion or epoch reset removes
the sample immediately. Same-tick corrections replace a sample; transfer to another
system or a gap over60s resets the buffer.

Ten focused store tests pass (`.runtime/shared-store-tests.log`), covering keyed
updates, duplicate/older suppression, per-table batch notifications, deletion/
reinsertion, epoch isolation, budgets, teardown, interpolation, angle wrap, no
extrapolation and large bigint timestamp precision. Full TypeScript and scoped
ESLint checks are clean. This does not establish remote geometry integration,
cell-subscription lifecycle, two-account browser acceptance or public shared-world
activation; parent-owned wiring and isolated acceptance remain required.

## Pinned stock exterior presentation adapter

New `packages/render/src/remote-ships.ts` derives an explicit public stock exterior
from the currently published template and hull manifest. It never reads a player's
private assembly. Source text pins are enforced before derivation; all 14 distinct
GLBs are SHA-256 checked at runtime before Babylon imports them. The compact
artifact is staged at `.runtime/wayfarer-exterior-r001.json`, not yet installed or
published by this specialist. Its trusted view mapping ID is:

`stock-wayfarer-exterior:6cd837094b61bb6d1e69aefe4629cd9fa7e0f51db02fee80d203a824af756589`

The suffix hashes the exact compact payload. Its source pins are:

- Stock assembly `1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb`.
- Hull manifest `2e275052217da4b20a92ab40a9a9f098dc011557f7611b6b0c6f40f71ea22695`.
- Legacy shell GLB `aa27de4fd09db67428659af8e16479217dd7bebd1f764c13744f62b2d621a6db`.

There are 108 native placements and 14 selected legacy exterior groups. The
native subset keeps the installed cockpit canopy, outer armor, roof collars,
Frontier side armor and roof, and five public stock decals. The adapter excludes
floor tiles, rear bridge partitions, the interior doorway frame, room partitions,
storage objects, all equipment lights and characters. Every native URL, hash,
selector and public placement is pinned in the compact manifest. Materials,
normal maps, glass and emission are retained by the normal GLB loader; instances
share geometry/materials rather than re-authoring the native mesh.

This stock visual whitelist has no separate underside floor backing. It does not
claim a sealed hull, collision, pressure enclosure or damage implementation. It
also does not show custom ships or account-private refits. Those need separately
validated published exterior packages; unsupported exterior IDs are omitted.

Parent integration:

```ts
// Promote the staged compact manifest through the normal asset preparation.
// Map only the corresponding trusted public stock ship template to its assetId.
const remotes = createRemoteShips(scene, sharedWorldStore, {
  assetId: manifest.assetId,
  localShipId: () => currentOwnShipId,
  loadPrototype: () => loadRemoteShipPrototype(scene, manifest, manifest.assetId),
  onError: reportVisualAssetError,
});
// In the render frame, before scene.render():
remotes.update({ x: cameraWorldX, y: cameraWorldY }, performance.now());
// On renderer teardown:
remotes.dispose();
```

The manager uses ID-keyed independent roots, excludes the current local ship,
removes departed contacts immediately and resets roots on transport epoch changes.
It samples the store's delayed interpolation and subtracts f64 camera coordinates
before GPU transforms. New roots remain disabled until their first valid sample,
so discovery cannot flash geometry at the camera origin. Late asynchronous imports
cannot resurrect a disposed scene or removed contact. Scene teardown unbinds table
listeners, disposes roots/owned decals and then the shared hidden prototype.

Seven focused tests pass in `.runtime/remote-ships-tests.log`: exact hash/whitelist
and static native-material preservation checks, pinned source rejection, runtime
instance/material sharing, camera-relative transforms, deletion/reconnect and
late-load cleanup. The lifecycle loader test uses real Babylon NullEngine meshes
but mocks GLB import; it is not a browser or visual acceptance claim. Full tsc at
this point reports only concurrent construction-instances test calls lacking a
new fourth argument (lines 220/232), already reported to the parent. Root wiring,
asset promotion, authoritative smoke and two-account browser review remain pending.

## Retained cell subscription adapter and generated compatibility

New `packages/net/src/world-subscriptions.ts` owns one socket's retained shared
subscription scopes. Root added the declared `@sidereal/sim` net dependency so
cell geometry reuses the authoritative pure spatial rules. No net/App entrypoint
wiring or generated binding changes were made by this adapter task.

Register the following exact public filtered view names, with these generated
camel-case accessors and snake-case SQL motion columns:

| SQL view | Generated cache accessor | Primary key |
| --- | --- | --- |
| `own_world_admission` | `ownWorldAdmission` | `characterId` |
| `visible_ship_motion` | `visibleShipMotion` | `shipId` |
| `visible_ship_descriptions` | `visibleShipDescriptions` | `shipId` |
| `visible_body_motion` | `visibleBodyMotion` | `bodyId` |
| `visible_body_descriptions` | `visibleBodyDescriptions` | `bodyId` |

Motion queries require `ship_id`, `system_id`, `cell_x`, `cell_y`. Confirm the
regenerated module SQL schema and isolated subscribe acceptance rather than
assuming TypeScript property casing is SQL casing. No query references a private
base table. Cell predicates are egress filters, never authorization.

Create the adapter after authenticated game-session binding, using the current
socket's existing `createConnectionResources()` owner and the shared store:

```ts
const scopes = createWorldSubscriptions({
  resources, store,
  transport: {
    subscribe(sql, callbacks) {
      return connection.subscriptionBuilder()
        .onApplied(() => callbacks.applied())
        .onError(context => callbacks.error(context))
        .subscribe(sql);
    },
  },
  onError: reportSubscriptionFailureAndReconnect,
  onEpoch: rebindCurrentSocketAggregateListenersAndHydrateAcceptedCache,
});
// Feed accepted admission first, then accepted own motion on inserts/updates:
scopes.acceptObserver(admission, ownMotion, capturedCurrentSocketStoreEpoch);
```

The baseline subscribes admission, ship/body descriptions and authorized body
motion. The current body view includes at most the bounded canonical system
contents: charted planets/stars remain visible beyond local ship cells. Because
body motion currently has no `charted` column, it deliberately remains a bounded
baseline query; do not accidentally hide observed planets by applying ship-cell
predicates to all bodies. A later separately keyed chart-motion view can split
nearby dynamic bodies from charts without changing authority.

A dedicated own-motion query bootstraps the observer and prevents losing one's
own row at a cell crossing. Each nearby ship scope contains nine exact indexed
cell predicates, including negative cells. There is one active and at most one
replacement/retiring cell scope. The old scope remains until replacement apply;
its `unsubscribeThen` acknowledgement must arrive before another replacement is
allocated. Rapid crossings coalesce to one latest desired cell. Bounds include
retiring scopes, not just active JavaScript handles: at most four retained handles
(baseline, own, two cell sets), at most eighteen cell predicates. A stalled pending
or unsubscribe acknowledgement stalls rescoping instead of allocating unlimited
handles; the connection watchdog/reconnect owner handles a transport stall.

Bind SDK aggregate cache table insert/update/delete listeners once per current
socket generation and retain their removers. Feed keyed rows to `SharedWorldStore`;
do not remove rows when an individual scope ends because SDK query sets overlap
and deduplicate. Admission/epoch reset clears the shared store. The parent rebinds
only the current socket's aggregate callbacks and hydrates its accepted cache;
old socket callbacks keep their obsolete epoch and remain rejected. Accepted own
admission/motion rows are retained after a transfer reset. Revocation or a live
subscription error clears cached shared state and retires every scope, including
pending scopes when they eventually apply. Revoked adapters require explicit
reset or socket replacement before any new scope is created. Disposal is also
registered with the connection resource owner.

Ten adapter tests plus ten store and five resource tests pass (25 total) in
`.runtime/world-subscriptions-tests.log`. This covers actual lifecycle ordering,
negative cells, input bounds, overlap, pending/release budgets, rapid crossing,
wrong/stale observer rows, admission transfer, epoch isolation, revocation and
errors. Full TypeScript and focused ESLint checks pass. Actual generated-table
subscription smoke and two-account browser integration remain root integration
acceptance, not established by these unit tests.


## Applied authority integration and isolated acceptance

`packages/world/src/index.ts` now registers all seven private shared tables,
five keyed authorized views and the explicit `joinSharedSystem` reducer. It calls
`stepSharedWorld(ctx)` once per scheduled world sample, then skips admitted ships
in the legacy private-body physics loop. Existing stair scheduling, traversal,
standing guards and original-provider `bindGameSession` proof remain intact.
Existing `ownShips` remains owner-only and overlays lean shared x/y/vx/vy/heading/
omega/serverTick into its existing shape. `ownSpaceBodies` stops returning preserved
legacy fixtures for admitted ships; new keyed body views supply canonical bodies.
Re-entering the lab does not seed legacy bodies for an admitted ship.

Identity-link request and acceptance now reject shared-admitted source/target
membership until a reviewed migration also transfers admission and its audit.
This prevents an otherwise successful identity migration from stranding private
shared-world ownership. The guard has a regression test. Old body rows, their
individual divergent motion, and alias snapshots remain private and untouched.

The join request is exactly:

```ts
{
  characterId: string,
  shipId: string,
  expectedShipRevision: bigint,
  expectedAdmissionRevision: bigint, // 0n for this initial explicit admission
  operationId: string,              // UUID; retain it for retries
}
```

Only the exact same operation ID and exact request replay is a no-op. A different
operation ID for an already-admitted ship is rejected, even if otherwise valid;
there is no implicit transfer or berth reset. For later normal activation, first
hydrate `ownWorldAdmission`: if it already matches the selected actor/ship/system,
do not call join. If absent, read the current owned ship revision, submit once and
retain that request for network retries. On stale revision, read the refreshed
state; do not blindly generate retry operations. Successful admission preserves
all UUIDs, local deck state and inventory, and increments the static ship revision
once. The server chooses the safe berth and never accepts client source/destination
coordinates. Existing construction instances do not become space ships by joining.

The current renderer mapping is the pinned public stock Wayfarer exterior ID in
`@sidereal/content/shared-system`. Only the legacy ship creation path is admitted
in this first slice. Authored construction ships still require their compiled
hull/flight installation and explicit published exterior identity; this adapter
must not be advertised as supporting arbitrary authored ship physics.

Server schema extraction revealed duplicate type-name conflicts that ordinary
TypeScript missed. Underlying row types now have distinct `Shared*Projection`
names; public view names and keys remain as documented above. Generated bindings
confirm snake-case SQL columns and primary keys. The SDK's index type extraction
also requires literal accessor names with a mutable index-array type; the actual
private `by_system` and composite `by_cell` indices are registered and consumed.
No generated files were edited manually.

Validation evidence:

- `npm run check`: 873 tests /149 files plus TypeScript and document/provenance
  checks pass (`.runtime/shared-world-combined-check.log`). Includes the concurrent
  synthetic elevator pure prerequisite and generated shared cache binding tests.
- Aggregate `npm run build` passes for world, generated bindings and separate
  client/dashboard outputs (`.runtime/shared-world-combined-build.log`). Existing
  Vite large-chunk warnings remain; this is not a production performance claim.
- Standard `npm run smoke -- --smoke-name shared-foundation` and the fresh
  `shared-discovery` named isolated databases pass all existing authority checks.
- New `scripts/shared-world-smoke.ts` passes against
  `sidereal-spacetime-dev-shared-discovery-smoke`. Three ordinary principals prove
  explicit entry, two distinct berths, one canonical set of16 bodies, owner-only
  private views, all seven private shared base-table denials, join replay and
  revision protection, actual negative-cell SQL acceptance, same canonical rock
  motion/sample values for both subscribers, unchanged inventory/appearance/UUIDs,
  and membership surviving reconnect. Five shared-rock samples matched.
- During accepted flight beyond400m, B retained wildcard view subscriptions and
  still lost A's motion and description; A lost B. All12 charted planet/star
  descriptors remained available outside local cells. This is server discovery,
  independent of client SQL narrowing. Evidence:
  `.runtime/shared-world-smoke-summary.json`, `.runtime/shared-world-smoke.log`.

The first extended range test exhausted its bounded flight time before reaching
400m at the actual loaded ship speed; it did not reveal a server error. The final
fresh isolated run increased the bounded flight duration and passed the range
assertion. The initial shared migration smoke also passed independently. None of
these tests mutates the normal database. Standalone smoke uses development
principals. The separate actual-provider acceptance below now verifies two
different Dastari accounts; visible remote exterior browser review still remains
required before normal shared-world activation. This does not claim shared crew boarding, a new
multi-seat station model, native elevator activation or a50-player capacity proof.


## Actual Dastari account acceptance

`scripts/shared-world-provider-smoke.ts` uses the real generated SDK connection,
original ID-token `bindGameSessionProof`, `bindSharedWorld` readiness, retained
cell subscription adapter and keyed cache. On 2026-09-09 at 16:22 UTC the first
run passed for two distinct ordinary Dastari accounts; the repeat at 16:24 UTC
passed with both existing admissions skipped, confirming review setup does not
relocate admitted ships or generate replacement identities. The isolated database
is `sidereal-spacetime-dev-shared-provider-smoke`; normal game data is untouched.

Verified: both accounts see the same canonical bodies and each other's ship;
accepted pilot input propagates into the other account's keyed remote-motion
cache; owner-only ship views remain one row each; appearance, item/container/
hotbar UUIDs survive movement and reconnect; disconnect clears the old cache
and advances its epoch; reconnect hydrates the remote ship without rejoining.
The review world retains the two accounts and ships for parent browser review.
Safe IDs and assertions are in `.runtime/shared-world-provider-summary.json`;
transport output is `.runtime/shared-world-provider-smoke.log`.

Ordinary login is exercised by `scripts/shared_world_provider_login.py` through
Keycloak's real Authorization Code + PKCE S256 flow using the existing exact
HTTPS game-review callback. It enables no password grant and changes no public
client or realm policy. The game uses the provider **ID token**; the access token
is not substituted for it. Credentials and temporary token responses remain in
0600 files outside git and are never printed. Both proof-only provider sessions
were logged out and their temporary token files removed after validation.

The secondary account is created/reused only through the managed CT116 command
`python3 scripts/dev.py keycloak-shared-review-account`. Its helper refuses to
reset an existing username without its managed credential file and does not grant
construction/admin roles. It leaves existing accounts and Orchard unchanged.
The reusable primary and secondary credential files remain root-only for parent
browser review; their values are absent from all evidence. The managed secondary
profile includes an unverified `.invalid` test email solely to satisfy the
existing ordinary profile requirements, without relaxing that policy.

This proof has no GPU/browser component. Visible native exterior alignment,
interpolation and user-facing join flow must still pass the parent browser review.
The standard managed authority smoke for this named database also passed, and
full TypeScript plus Python compile checks passed after adding these helpers.
