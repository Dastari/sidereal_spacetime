# Instance and deck scoped inventory contract

Status: executable pure transfer planner, unregistered authority adapter/private sidecars and tests; **not registered or installed**
in the authoritative database. Existing inventory UI and schema are unchanged.
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

## Required additive authority migration

Current `inventoryItem` and `inventoryContainer` rows contain `characterId`, and
`storageBinding` is a private per-character laboratory fixture mapping. Do not
clone those fixtures per visiting actor or delete/recreate existing item rows.
Do not reuse a sentinel character ID as a substitute for an explicit ownership
model without updating every affected read and mutation.

Proposed coordinated migration:

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

## Acceptance before activation

Pure tests cover atomic failure, current actor/deck/grant/LOS, liquids, revised
roots, backpack cycles and identity preservation, existing hand-item stow,
weight/capacity and two granted actors racing deposits/withdrawals. The authority
adapter still needs real database tests for atomic rollback, concurrent requests,
private view removal, denied replay after access loss and persistence across a
module restart. Two real provider accounts must access only their permitted
instance/deck; removing grants must remove contents immediately. Actual reference-
style storage UI and qualified access points require the parent browser review.
No registered schema, generated bindings, world entrypoint, live rows or canvas/App files
were changed. New table declarations are inactive until the coordinated migration.


## Unregistered authority adapter now staged

`packages/world/src/scoped-inventory.ts` implements `resolveCargoAccess`,
`qualifyCargoAccessPoint`, `transferScopedCargo` and `inspectScopedCargo`.
`CargoRepository` is the explicit synchronous current-transaction table adapter
contract. Its reads fetch at most the carried root plus source/destination roots,
using root indices and stopping/rejecting at budget + 1. The transfer writes payload,
revision metadata, descendant root membership, character revision, hotbar/aim
cleanup and receipt in the same enclosing reducer. Storage exceptions propagate;
there is no catch-and-continue after writes. Tests emulate transaction rollback,
which is not a substitute for an actual isolated SpacetimeDB smoke.

`packages/world/src/scoped-inventory-tables.ts` declares four **private,
unregistered** additive tables:

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

Two keyed `t.row` projections expose only container ID, parent item ID, storage
kind/grid/current development capacity/revision and item ID, definition ID,
container ID/grid placement/revision. No private instance document, actor/grant
or visit data, or weapon resource rows are included. `inspectScopedCargo` checks
actual access, geometry, reach and occlusion every time, and returns no rows
on loss; incomplete/mixed-root membership also fails closed. A private inspected
root target and normal `auth.gameView` wrapper remain integration requirements.
View adapters must use materialized grant expiry (scheduled revocation), because
the current view context has no wall clock; reducers also check exact current time.

The current implemented review entry remains owner-scoped. An owner with the
existing current workspace `instance.spawn` grant and an actual matching
`constructionLocation` can use the cargo adapter. The actor's authoritative ship,
visit instance/deck, supported standing pose and geometry revision must agree.
The actor and approach point both require a free 0.3m standing circle on the
current qualified collision frame. Height matches that frame's authoritative
planar support elevation within 5cm; visual deck-top or decorative mesh origin
must not be substituted. More general native elevated access needs accepted
surface-support data before that envelope expands.

Crew visitation remains separate work. `AcceptedCrewVisit` specifies a current
visit/actor/instance-bound, expiring, revocable proof from a future allowed-entry
adapter. A crew member needs that proof **and** a current instance
`inventory.transfer` grant. There is no reducer that creates visits here. Tests
use an explicit invitation-gated entry contract before constructing accepted
locations; giving an inventory grant alone neither admits nor moves the actor.
Two actors can then race one shared container: stale container revisions fail,
refreshed non-overlapping deposits succeed, and revocation removes access.

### Remaining integration blockers

1. Bind `CargoRepository` to actual registered ctx.db tables only after all legacy
   personal mutations maintain sidecar revisions/root indices atomically.
2. Keep old private laboratory fixtures explicitly legacy/private during backfill;
   do not map their roots to carried-character scope, which would bypass their
   existing proximity rules. Reject unsupported roots until an explicit migration.
3. Pin and validate actual authored approach points for each of the four native
   Wayfarer crates against the qualified floor/object frame. The empty seed plan's
   placement centers are not sufficient. Bind once during the approved spawn path.
4. Add inspected-root target/reducer and normal admitted keyed views, then run
   real authority smoke for atomic rollback, revisions, expiry and restart.
5. Implement a separately permissioned crew visit/boarding path before claiming
   shared multi-account crate interaction in the actual game. Preserve physical
   entry semantics; inventory permission never authorizes review teleportation.
6. Wire the inventory UI via the parent; no external inventory UI work is changed.

Current focused evidence: `.runtime/scoped-inventory-adapter-tests.log`,
`.runtime/scoped-inventory-adapter-tsc.log`. These are source-level proofs,
not a registered schema, live storage feature or installed browser review.
