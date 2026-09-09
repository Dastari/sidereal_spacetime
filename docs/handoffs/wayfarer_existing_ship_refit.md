# Existing Wayfarer conversion: preserved-state preflight

2026-09-10. This is a tested read-only audit and concrete attachment proposal. It does not implement or authorize a reducer bypass, refit an existing account on login, or replace existing ships with fresh starter ships. The owner has authorized the integration; remaining work is implementation and evidence, not another permission request.

## Exact source compatibility

The installed assembly `assets/runtime/assembly/wayfarer.json` (raw SHA-256 `1f723510ac156089903fbd0d711a2f6adff1da35433e2ac02afde94fa4a00deb`) has262 source placements. The exact qualified semantic source in `packages/content/src/wayfarer-starter-r001.json`, canonical SHA-256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`, has51 floor placements and211 object placements. Their combined source IDs are bijective: no missing, extra or duplicate source placements. The published R006 bow and current native floor/cargo visuals are therefore already represented in this base; no cockpit remodeling is needed for this specific conversion.

Those source placement strings are local identities shared by many old ships, not globally unique entity UUIDs. Conversion must retain their aliases while assigning new instance-scoped structural identity mappings. Existing ship, character, station, container, item and interaction UUIDs remain unchanged. The instance UUID should reuse the existing ship UUID. The fixed source document/hash remains unchanged: the additional fuel visual described below belongs to a separately qualified attachment relation, never a modified document carrying the old hash.

## Captured state and storage plan

Private read-only SQL evidence is `.runtime/wayfarer-refit-audit/normal-snapshot.json`. It covers the26 legacy actors present before the new public starter review account was created:603 items,165 containers,40 storage bindings,68 interaction objects. Current inventory sidecars cover only18 containers and99 item memberships; lazy historical backfill means the future adapter must validate the entire selected actor graph rather than treating missing sidecars as missing inventory.

`packages/sim/src/wayfarer-refit-audit.ts` validates complete inventory identity links, same-character/ship ownership, nested parent links/cycles, finite liquid balances, grid dimensions, and bijective installed storage bindings. It produces a conserved root binding map without allocating an item/container or mutating input. It deliberately returns `readyToApply:false`: reducers must reread actual revisions and use the full inventory validator before applying.

All26 captured accounts pass this audit, accounting for64 installed roots:

- Ten actors have four mapped grid roots each. Twenty of these roots are6×6; twenty are14×14. All retain their existing500kg inventory limit. Neither appearance nor the new starter's defaults resize them.
- Seven actors have one historical unbound6×6 `Storage supply crate`. The proposal binds that existing UUID to the first unoccupied native storage placement and retains its contents/capacity. The other three visual boxes remain nonfunctional decoration until separately provisioned; refit grants no free inventory containers.
- Seventeen actors have an unbound engineering fuel root. Its capacity is100L, current balance20L fuel and inventory limit80kg. “20L tank” would incorrectly confuse balance with capacity. No item or liquid balance is discarded.

Exact account/container IDs, existing positions and proposed positions are in private `.runtime/wayfarer-refit-audit/proposed-storage-map.json`. The primary legacy public actor has99 persisted items and18 total containers, including four14×14 grid roots and the100L fuel root. This authoritative count differs from proximity-filtered client inventory views and must be used for migration continuity.

Existing bound supply roots may still retain the older abstract(-3.1,3) access position while their source placement is at(-4.0625,2.0625). The explicit refit may move a *container binding* to its actual native object, retaining contents and UUID. It must never move the character as an incidental consequence.

## Concrete preserved fuel attachment

The approved fuel visual is `part-81d226967abf2efefc20`, `cargo.fluid-fuel.medium/r001/appearances/fuel/glb.glb`, SHA-256 `a2f9fca902c7df08f3e8bad348d09034df8f26d9c248d0d912558886aa2eecf6`. Authored dimensions are approximately0.552×0.548×0.864m. The proposal places it at ship-local(-3,7,0.1875), within a1×1m reserved floor footprint, with supported actor approach(-1.875,7). Its native top is1.0514999628m. The original abstract engineering position(-3.1,-6) is geometrically occupied and must not be reused blindly.

`qualifyRefitFuelLayout` passes conservative full-footprint clearance against the nominal floor and qualified standing collision frame, plus a separate standing approach and line of sight. `scripts/qualify_wayfarer_refit_storage.py` independently hash-verifies and reads1047 actual native mesh groups, including floors and roof. It conservatively checks projected native convex covers over the tank's height range, proves no visual volume overlap, and proves complete nominal floor coverage. Evidence is [wayfarer_refit_fuel_geometry.json](wayfarer_refit_fuel_geometry.json). The test also rejects the historical engineering location.

This proves a concrete placement fits; it does not invent a filled-container bearing rating, pipe interface, gameplay storage capacity or liquid-transfer permission. Next integration must add an explicit nonstacking floor mount/support contract, separately qualified collision/selection/access binding and actual supported liquid transfer for the retained root. Native liquid roots cannot use the ordinary grid store/retrieve UI. No general mixed-size stacking or cargo carrier claim follows from this placement.

## Atomic conversion adapter requirements

1. An explicit refit request supplies an operation ID and expected current ship/inventory/instance revisions. Reread the actual actor, ship, station, control/input lease, complete inventory and installed interaction graph. A repeated operation returns the recorded result without allocation or revision churn.
2. Preserve the current ship world pose, velocity, heading and accepted shared admission. Do not reserve a new berth. A private legacy actor first needs its separate explicit Join shared system action; that relocation must not be disguised as refit or happen at login.
3. Require a supported current standing pose and an empty station with no live pilot input. Historical actor positions may overlap the new native seat; have the player walk to a valid location beforehand instead of teleporting. Preserve the station UUID while validating its native source/socket and operational state; an owner relation grants no pilot control.
4. Preflight all structural source aliases, cargo bindings, nested inventory scopes, existing sofa/light identities and state, and flight fitting/source-device aliases. Legacy actuator IDs are per-ship content identifiers; record their mapping explicitly rather than claiming they were global fitting UUIDs.
5. In one reducer transaction install the exact qualified instance with the existing ship UUID, preserve the original station and interaction UUIDs, bind all existing grid/liquid roots and update every affected scope/membership. Preserve grid coordinates, rotations, nested items, hotbar, equipped items, weapon energy, appearance, uniform-issue records and liquid balances. Never call the fresh-only cargo/flight writers on existing rows.
6. Create a conversion receipt and durable game-owned access relation, separate from starter entitlement and all authoring grants. Extend the kit guard to recognize converted access: the existing guard recognizes only a personal starter receipt, so a converted legacy account must not fall through to laboratory root recreation. Existing native reconnect should remain connected-state-only. Preserve the review-return behavior for genuinely temporary granted visits.
7. Prove preflight rejection and late-write rollback, then perform an isolated pre-upgrade legacy fixture conversion with exact hidden-item/container/appearance comparison, replay, reconnect, actual process restart, cargo/liquid operation, walking/collision, pilot controls and cross-owner denial. Public conversion follows only that matched client/module evidence.

## Validation and ownership

Five focused TypeScript tests passed, including mixed legacy capacities, complete identity preservation, corrupt graph/foreign scope/cycle rejection, surplus storage denial and actual pinned floor clearance. Full TypeScript compilation passed. Two Python geometry tests reread the exact GLBs and validate the proposed placement/old-position rejection. The audited26-account map is private evidence, not a synthetic test. No world tables, reducers, generated bindings, live state or client entrypoints changed in this preflight.

The release owner owns these new audit/planner/geometry files. Shared world/index/schema and generated bindings remain with the external-airlock integration owner until coordinated. Existing-ship conversion is still outstanding after the deployed fresh-starter release; a fresh starter does not complete the owner's request to transition existing ships.

The combined `npm run check` during this checkpoint passed1151 tests and failed6 in the concurrently changing review-origin adapters (`construction-flight-review.test.ts` and `construction-stairs-authority.test.ts`: absent `gameShipAccess` test context). The registration owner was notified with `.runtime/wayfarer-refit-preflight-check.log`; these are not claimed passed by this audit. A subsequent combined gate is required before the next release. The shared owner had completed the preceding matched build; this unregistered preflight does not publish a module or client.
