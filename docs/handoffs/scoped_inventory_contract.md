# Instance and deck scoped inventory contract

Status: registered additive authority and generated views/reducer, validated on an isolated database with real Dastari accounts. Parent-owned game UI and the matched public release are pending final browser/gate acceptance. Updated: 2026-09-10.
Owner priority: functional cargo for independently spawned native Wayfarer
instances, followed by the other defined functional entities.

## Implemented pure API

`packages/sim/src/scoped-inventory.ts` exports
`planScopedInventoryTransfer(state, request, access, definitions, liquidDensity)`.
It returns a structured `{ok:false,error:{code,message}}` rejection or a complete
atomic mutation plan. Failures never mutate input state. No item/container UUID
is minted; nested contents retain their current identities and containment.

The request carries only item/source/destination IDs, expected item/container/
character revisions, placement/rotation and an operation ID. It carries no actor
position, grants, geometry, balances, scope or final transform. The server resolves
those independently from admitted actor, accepted supported pose, active instance/
deck, exact current native collision frame and an explicit instance inventory
capability. Ownership of a ship alone does not grant access.

Container roots have one scope: carried character storage, or an instance/deck/
placed-object binding. Nested containers cannot override ownership; their scope
is derived by traversing the actual parent-item chain. The first slice rejects
liquid source/destination containers for solid-item transfers. It also rejects
unsupported traversal/seated poses, another character's carried storage, foreign
instances, wrong decks, expired/revoked grants, stale geometry, distance above
1.8m to the accepted access point and blocked line-of-sight.

The compiler frame supplies current structural walls/doors and native object
footprints. Existing `deckLineOfSight` handles wall thickness but only tests
obstacle endpoints, so the planner additionally checks the whole segment against
intervening object footprints. Access uses full 3D point distance plus exact deck
identity: matching XY on another floor never grants access. The container access
point must be a server-qualified point outside its own blocking footprint; the
visual mesh center or `ConstructionContainerSeed.positionM` is **not** sufficient.
The existing fixture approach points are references to validate against the
qualified new template, not automatically accepted new sockets.

On success the plan contains the existing item's new location, revisions for the
source/destination ancestor chains and any moved nested container, the actor's
inventory revision, a durable request receipt, and all moved descendant IDs for
scope-index maintenance. A container appearing on both paths advances once.
Moving a backpack bumps its nested container revision too, so a concurrent stale
withdrawal from that backpack fails even if the inner item's coordinates did not
change. Stowing the hand item requests aim cleanup; moving items into world
storage requests cleanup of that actor's hotbar references. Item-keyed resource
rows such as weapon energy remain attached to the same item UUID.

The adapter commits all changes, scope-index updates, hotbar/aim cleanup and the
receipt in one reducer transaction. It must never store a plan for later execution
or accept one from a client. Current snapshots/CAS validation occur in the same
transaction that writes. It must not catch and continue after any mutation fails.

Authorization precedes replay lookup. The same operation/payload returns its old
receipt with zero writes despite changed revisions, but moving away, changing
deck or losing access denies the replay. Reusing an operation ID with a different
payload fails. After a committed transfer, a second actor's stale source/destination
revision cannot consume the same item or free cell again.

## Bounded working set and existing rules

The planner reuses `validateInventory` for item shapes, grid overlap, rotation,
parent cycles, nesting, payload and total carried mass. It does not copy the
placement algorithm or invent equipment stats. It admits a complete working set
of at most 128 items, 152 containers, 256 definitions and 64 relevant grants;
overflow rejects instead of silently truncating a container tree. These are the
current core inventory solver's limits. A 14x14 container grid is a placement
capacity, not a claim that more than 128 items can be solved in this first slice.
Larger combined trees need a separately reviewed bounded solver expansion.

The adapter should retrieve the exact actor/operation receipt by primary key;
`state.receipts` can therefore contain zero or one row, rather than scanning
unbounded history. The planner accepts a bounded receipt working set but does not
silently prune durable receipts. Server retention/checkpoint policy remains
separate; stale CAS must never become reusable after a receipt is pruned.

`ScopedCharacterInventory.revision` keeps compatibility with the current
character-wide inventory CAS and prevents old personal equip/rotate/move writes
from racing a shared transfer. Per-container revisions serialize shared access
between different characters without pretending that one character's revision
owns world storage.

## Implemented additive authority migration

Current `inventoryItem` and `inventoryContainer` rows contain `characterId`, and
`storageBinding` is a private per-character laboratory fixture mapping. Do not
clone those fixtures per visiting actor or delete/recreate existing item rows.
Do not reuse a sentinel character ID as a substitute for an explicit ownership
model without updating every affected read and mutation.

The registered migration implements the following boundaries:

1. Add private container scope/revision and item revision metadata keyed by the
   **existing IDs**, plus indexed item membership by container and container
   ancestry/root membership. Bind new instance roots to actual instance/deck/
   placed-object IDs and an immutable functional definition revision. Enforce
   one functional container per placed-object identity. Preserve existing
   capacity provenance: current development grid values are not physical cargo
   payload ratings or art-approved HP.
2. Backfill metadata for existing carried items/containers without resetting
   balances, kit receipts, hotbar, appearance, weapon energy or UUIDs. Preserve
   existing private laboratory storage and its mappings until it receives its
   own explicit migration. An old private crate must not silently become shared.
3. Reconcile the existing `characterId` lookup semantics with explicit root scope.
   A stored world item must not remain exposed through its previous character's
   inventory view, and a retrieved item must join the recipient's carried lookup.
   Nested items and containers move scope together. Keep the old columns only as
   a documented compatibility index, not a second competing ownership source.
4. Route **every** personal/shared move, equip, rotate, drop, loadout issue and
   container-content mutation through compatible revision/index maintenance.
   Current character CAS remains required during transition. Unmigrated legacy
   mutations must not edit world-owned rows or bypass container revisions.
5. Add minimal keyed container/item views authorized by current actor admission,
   actual instance/deck, supported pose, grant, reach and current LOS. UI selection
   or SQL `WHERE containerId=...` can narrow them but grants no access. Do not
   expose private root tables beside the views. Choose either bounded reachable
   containers or a private per-actor inspected-container target; re-evaluate
   access on every view and reducer, including permission loss and refit.
6. Install the four independently allocated empty instance containers from the
   qualified functional seed plan exactly once inside its validated spawn/refit
   transaction. Preserve allocation receipts and stable placed-object bindings.
   Do not seed a starter kit or duplicate contents at instance spawn.

A genuinely shared container also needs a gameplay access path to that instance.
Current construction-review entry has owner-oriented restrictions; an explicit
inventory grant by itself must not fabricate actor location or bypass those
restrictions. Grant-authorized visitation/crew access must be coordinated before
claiming two real players can stand at the same crate. The pure access contract
supports distinct actors, but this is not implemented boarding authority.

## Registered adapter and data contract

`packages/world/src/scoped-inventory.ts` implements `resolveCargoAccess`,
`qualifyCargoAccessPoint`, `transferScopedCargo` and `inspectScopedCargo`.
`CargoRepository` is the explicit synchronous current-transaction table adapter
contract. Its reads fetch at most the carried root plus source/destination roots,
using root indices and stopping/rejecting at budget + 1. The transfer writes payload,
revision metadata, descendant root membership, character revision, hotbar/aim
cleanup and receipt in the same enclosing reducer. Storage exceptions propagate;
there is no catch-and-continue after writes. Tests emulate transaction rollback,
which is not a substitute for an actual isolated SpacetimeDB smoke.

`packages/world/src/scoped-inventory-tables.ts` declares four **private, registered** additive tables:

- `inventoryContainerScope`: existing container ID/revision, root membership,
  explicit character or instance/deck/placed-object scope, qualified approach,
  immutable functional definition revision and lifecycle. Root/character and
  instance+deck indices avoid global scans.
- `inventoryItemMembership`: existing item ID/revision, actual container and root
  membership; root/container/character indices. It is not a second item payload.
- `instanceInventoryBinding`: unique placed-object ID to unique container ID,
  instance/deck and functional definition revision.
- `scopedInventoryReceipt`: actor+operation identity, request and exact result.
  Adapter primary key must be `JSON.stringify([actorId, operationId])`.

Keyed `t.row` projections expose container ID, placed-object ID, name, parent item ID, storage kind/grid/current development capacity/revision, actual capacityLitres/amountLitres/liquidType, and item ID, definition ID, container ID/grid placement/revision. A third projection exposes only carried item/container IDs, kind and revision for transfer CAS. Liquid values preserve the truthful contents of a stored fuel canister; liquid reservoirs still reject solid-item insertion. No private instance document, actor/grant
or visit data, or weapon resource rows are included. `inspectScopedCargo` checks
actual access, geometry, reach and occlusion every time, and returns no rows
on loss; incomplete/mixed-root membership also fails closed. The registered admitted `auth.gameView` wrappers expose at most the bounded currently reachable roots; a client-selected target is not authority.
View adapters must use materialized grant expiry (scheduled revocation), because
the current view context has no wall clock; reducers also check exact current time.

The current implemented review entry remains owner-scoped. An owner with the
existing current workspace `instance.spawn` grant and an actual matching
`constructionLocation` can use the cargo adapter. The actor's authoritative ship,
visit instance/deck, supported standing pose and geometry revision must agree.
The actor and approach point both require a free 0.3m standing circle on the
current qualified collision frame. Height matches the actual native standing-support query within 5cm; the same accepted support provider used by character movement handles the qualified floor and thresholds. Decorative mesh origins are not authority.

Crew visitation remains separate work. `AcceptedCrewVisit` specifies a current
visit/actor/instance-bound, expiring, revocable proof from a future allowed-entry
adapter. A crew member needs that proof **and** a current instance
`inventory.transfer` grant. There is no reducer that creates visits here. Tests
use an explicit invitation-gated entry contract before constructing accepted
locations; giving an inventory grant alone neither admits nor moves the actor.
Two actors can then race one shared container: stale container revisions fail,
refreshed non-overlapping deposits succeed, and revocation removes access.

### Actual installation and compatibility

`scoped-inventory-authority.ts` binds reads/writes to actual registered `ctx.db` tables. `scoped-inventory-migration.ts` computes UUID-preserving metadata changes at every existing inventory mutation/seeding boundary. Old laboratory roots stay `legacy-private`; old reducers cannot move instance-owned items. World-owned payload rows use an empty legacy character lookup only as a compatibility index; explicit indexed root scope remains authority. Descendants migrate together, and retrieval restores the recipient lookup. Weapon energy stays keyed to the original item UUID.

`scoped-inventory-installation.ts` installs four fresh empty roots inside the qualified Wayfarer spawn transaction, pinned to source SHA256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. It validates every approach before inserting. Existing cargo geometry was unchanged: the old proposed approach collided with native furniture, so approaches were qualified on actual free floor. Actor point (-3.5, 2.75) is reachable through 38 swept quarter-meter steps from spawn. The four current approaches are (-3.75,2.625), (-2.875,2.5), (-3.75,2.875), (-2.875,3). No native collider was weakened.

Registered views: `own_reachable_cargo_containers`, `own_reachable_cargo_items`, `own_carried_inventory_revisions`. Registered reducer: `transfer_scoped_cargo_item`. Arguments are operationId/itemId, expectedItemRevision, sourceContainerId/expectedSourceRevision, destinationContainerId/expectedDestinationRevision, expectedCharacterRevision and x/y/rotated. No permission or physical location comes from the request.

### Validation and remaining acceptance

- Aggregate registered cargo gate: 987 tests across 166 files plus typecheck and full build passed. Logs: `.runtime/scoped-inventory-integrated-check.log`, `.runtime/scoped-inventory-integrated-build.log`.
- Managed isolated authority smoke passed on `sidereal-spacetime-dev-cargo-instance-smoke`; log `.runtime/scoped-inventory-authority-smoke.log`.
- Real primary-provider journey spawned two exact native instances and walked through collision to all eight independently allocated empty crates. The same pistol UUID was stored/retrieved in each; replay produced no additional revisions; old personal reducers could not retrieve world-owned items; second-instance attempts against first-instance cargo were denied; moving out of range removed views. Evidence: `.runtime/cargo-authority-review/journey.json` and `.runtime/cargo-provider-journey.log`.
- A separate reconnect restored the exact stored pistol, actor appearance, visit and container revision. Grant revocation removed cargo rows and denied receipt replay; grant restoration allowed retrieval of that same UUID. Evidence: `.runtime/cargo-authority-review/persistence-result.json`. This is a reconnect proof, **not a server restart proof**.
- A distinct ordinary provider account was denied all four private tables, foreign instance entry and foreign cargo transfer. Evidence: `.runtime/cargo-authority-review/private-denials.json`.
- Latest focused 25 tests include actual ctx.db nested fuel-canister storage/retrieval and exact liquid contents preservation. Latest managed generation includes liquid projection fields and the construction-interaction agent's seat view. These later additions require the final matched aggregate/module/browser gate.
- Temporary provider-admin role was revoked; fresh-token admin denial passed, own provider sessions were logged out and own token files deleted. Existing fixtures and unrelated sessions were preserved.

Actual crew boarding is still separate: this installation permits the existing owner review entry with a live workspace grant. A second account denial proof does not demonstrate two admitted crew using one crate. The generic adapter tests that concurrency contract, but production crew admission is not installed. Server restart durability, actual storage UI browser review, current combined interaction fixture and public activation remain integration-owner gates. Interior HP, payload ratings and functional power were not invented from art.
