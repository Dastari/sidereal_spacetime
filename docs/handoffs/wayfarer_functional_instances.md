# Wayfarer functional instance allocation

Status: bounded pure allocation proposal implemented and tested; no new authoritative equipment/inventory rows installed.
Updated: 2026-09-10.

The two isolated Wayfarer instances currently contain independent placement identities and complete native visuals. They do not yet contain independently usable storage, seats, medical beds, reactors or pilot controls. Copying the laboratory's seeding routines would create incorrect ownership and access behavior.

## Executable first slice

`packages/sim/src/construction-functional-instances.ts` provides `planQualifiedWayfarerFunctionalSeeds(plan, allocateUuid)`. It verifies the qualified Wayfarer document and saved UUID mapping before proposing:

- Four fresh, empty container identities bound to the four independently spawned cargo placements and actual deck/instance IDs.
- Four fresh interaction-state identities for the existing defined sofa seat and three hydroponic lights, bound to their independently spawned placed objects.
- Explicit unresolved adapters and remaining unbound visuals. No starter kit, equipment item, contents or loadout is copied. No pilot grant, health value, reactor output or clinical capability is minted.

The inventory capacities are the **existing development fixture** values from `storage-fixtures.ts` (14×14 internal item grid and 500 kg inventory limit). Their basis is recorded; they are not the art collection's approved physical payload or cargo-stack ratings. `physicalPayloadRatingKg` and `healthDefinitionId` are null. Existing interaction metadata supplies approach/seat positions, not new functional power or health claims.

Three tests establish disjoint fresh IDs across two independently spawned ships, empty inventories, explicit development-capacity provenance, and rejection of reused placement UUIDs or altered source documents. This pure proposal is not passed to current character-scoped tables.

## Existing contracts that prevent safe installation today

`packages/world/src/inventory-tables.ts` stores containers and items by `characterId`; `inventory.ts` snapshots only that character. `storageBinding` also binds a character to a fixed laboratory placement. `seedStorage` depends on an existing starter supply crate, copies that row's settings, and runs per character. It is not an instance spawn API.

`inventory.access` uses `LAB_STORAGE_FIXTURES`, character-local XY and `CABIN_PARTITIONS` for reach/line-of-sight. It has no construction deck or review grant check. Installing instance containers in these tables without extending the scope and access layer could expose another instance's contents or let an upper-deck actor access a lower-deck crate.

`interactions.ts` resolves placed IDs through `LAB_INTERACTIONS` and laboratory XY. Its couch exit restores a fixed approach point. A new construction seat must bind actual instance/deck, preserve accepted support and use construction collision/reservations for entry and recovery. The existing static review instance is not an authoritative piloted ship, so creating a station row must not grant movement of it.

Current inventory command revisions are character-centric. Shared instance storage requires destination container revisions and atomic source/destination validation to prevent two actors from consuming the same item or capacity.

## Ordered integration

1. **Persistent instance-owned scope.** Add private instance/deck/placement entity bindings with immutable functional definition revision, per-entity revision, lifecycle state and unique placed-object association. Select definitions server-side from the exact qualified template. Store template-local IDs only in mappings. Require a successful authoring grant and fresh operation receipt before allocating state; replay returns the prior result. Two spawns get independent identities. No normal-ship refit is part of this operation.
2. **Inventory ownership model.** Extend authoritative item/container scope to distinguish carried character storage from world instance storage. Add a by-instance/deck lookup and per-container revision. Preserve existing character/container/item UUIDs during migration. Every view/reducer derives access from admitted actor, actual instance/deck, current grant or crew policy, distance, construction line-of-sight and supported pose. A caller-supplied instance ID is never permission.
3. **Atomic transfers.** Existing item move/equip/rotate rules remain the geometry/weight validators. Commit source container revision, destination container revision, item location/owner scope and receipt together. Revalidate after reconnect, grant loss, actor motion and refit. Test concurrent withdrawal, full destination rollback, retry, nested-container cycles, wrong deck, behind-wall access, liquid-container rejection and foreign-instance denial.
4. **Known interactions.** Install the four existing development sofa/light definitions only after their construction approach/support is clear. Seat occupancy has a private unique reservation; exit/disconnect/destruction uses a collision-checked supported location. Grow-light enabled state is independent per instance. Visual emission toggling is not proof of powered utility operation; later power availability gates actual production. Undefined medical/reactor behavior remains unavailable until a versioned functional definition exists.
5. **Health and destruction.** Interior entities get qualified health/damage-state definitions when provided. Keep localized voxel destruction for the separately classified structural floor/walls/roof/armor. Native visual revision alone supplies neither HP nor material strength.
6. **Tests and release.** Publish/spawn two isolated templates, put an existing carried item into A, deny B's ungranted access, transfer/retrieve with two provider actors and concurrent requests, then restart/reconnect and verify every identity/content/revision. Demonstrate A's light/seat changes do not affect B or the blueprint. Remove the test grants and confirm immediate private-view removal. Capture actual container UI against the reference before publishing this capability.

## Ownership

The pure proposal and tests are in the construction specialist's new files. The integration owner must coordinate inventory schema/access/operation changes, generated bindings, UI container windows and new keyed projections; these overlap other agents' inventory and shared-world work. No table/index/auth/generated change has been made by this proposal. Keep the exact visual/collision template usable for static review while functional state is added in a separate validated migration.
