# Cargo grid integration and model correction contract

2026-09-10. Staged authority adapter and exact visual audit; not a live cargo placement release.

## Exact source audit

The owner-approved manifest is `512ea3056138b3da315bb92e681c01ba5d758d54928f74d986b58bd9b001e4dd`. All73 approved GLBs and paired editable Blender sources resolved by their recorded hashes. The audit reads actual neutral POSITION vertices, applies the complete scene transform hierarchy, and converts GLB X/Y/Z to author X/−Z/Y. Every measured bound matches its published Blender validation exactly (maximum delta0m).

The complete per-appearance mapping, hashes, measured bounds, proposed floor reservation and reported stacking metadata are in [cargo_grid_model_audit.json](cargo_grid_model_audit.json). Reproduce with `python3 scripts/audit_cargo_grid.py --output docs/handoffs/cargo_grid_model_audit.json`.

These are visual measurements, not certified collision, operating envelopes, bearing patches or load ratings. Reservation rounding is an explicitly proposed authoring interface; it does not rescale the GLBs or move the existing four storage containers.

## Canonical dimensions and proposed reservations

Author XY is the deck plane, Z is height, dimensions are metres. Additional color/finish appearances are independently measured and pinned in the JSON rather than assumed identical.

| Canonical appearance | Revision | Actual X × Y × Z | Proposed half-metre floor reservation | Reported empty pitch |
| --- | --- | --- | --- | --- |
| standard-small | r003 | 0.6610 × 0.4855 × 0.5115 | 1 × 0.5 | 0.4640 |
| standard-medium | r003 | 1.0610 × 0.7964 × 0.9515 | 1.5 × 1 | 0.9040 |
| standard-large | r002 | 1.9410 × 1.3161 × 1.7200 | 2 × 1.5 | 1.7040 |
| standard-oversized | r002 | 1.9410 × 3.9161 × 1.9200 | 2 × 4 | 1.9040 |
| reinforced-medium | r003 | 1.0610 × 0.8088 × 0.9515 | 1.5 × 1 | 0.9040 |
| reinforced-large | r002 | 1.9410 × 1.4111 × 1.7200 | 2 × 1.5 | 1.7040 |
| reinforced-oversized | r002 | 1.9410 × 4.0111 × 1.9200 | 2 × 4.5 | 1.9040 |
| refrigerated-medium | r002 | 0.9160 × 1.3325 × 0.6800 | 1 × 1.5 | 0.6640 |
| refrigerated-large | r002 | 1.3960 × 1.9325 × 1.1600 | 1.5 × 2 | 1.1440 |
| vacuum-medium | r002 | 0.8610 × 1.3640 × 0.6800 | 1 × 1.5 | 0.6640 |
| vacuum-large | r002 | 1.3410 × 1.9640 × 1.1600 | 1.5 × 2 | 1.1440 |
| salvage-large | r002 | 1.3410 × 1.9325 × 1.2540 | 1.5 × 2 | 1.1440 |
| salvage-oversized | r002 | 1.9410 × 3.9325 × 1.8540 | 2 × 4 | 1.7440 |
| medical-small | r003 | 0.6610 × 0.4855 × 0.3915 | 1 × 0.5 | 0.3440 |
| medical-medium | r003 | 1.0610 × 0.7964 × 0.6315 | 1.5 × 1 | 0.5840 |
| high-value-small | r003 | 0.6610 × 0.6555 × 0.4715 | 1 × 1 | 0.4240 |
| high-value-medium | r003 | 1.0610 × 1.0864 × 0.7915 | 1.5 × 1.5 | 0.7440 |
| fluid-medium | r002 | 0.8610 × 1.1600 × 0.6800 | 1 × 1.5 | 0.6640 |
| fluid-large | r002 | 1.3410 × 1.7600 × 1.1600 | 1.5 × 2 | 1.1440 |
| cryo | r001 | 0.6800 × 0.6800 × 1.3600 | 1 × 1 | none reported |
| fuel | r001 | 0.5520 × 0.5480 × 0.8640 | 1 × 1 | none reported |
| chemical | r001 | 0.5480 × 0.5480 × 0.8640 | 1 × 1 | none reported |
| gas | r001 | 0.8800 × 0.6800 × 0.9000 | 1 × 1 | none reported |
| water | r001 | 0.8800 × 0.6890 × 0.9070 | 1 × 1 | none reported |
| narrow-blue | r001 | 0.2420 × 0.2510 × 0.4420 | 0.5 × 0.5 | none reported |
| tiny-magenta | r001 | 0.1920 × 0.2190 × 0.1710 | 0.5 × 0.5 | none reported |

The complete73 appearance reservations group as:29 at1×1m,12 at1×1.5m,7 at1.5×2m,6 at1×0.5m,6 at2×4m,4 at1.5×1m,4 at2×1.5m,3 at0.5×0.5m,1 at2×4.5m and1 at1.5×1.5m. These preserve physical overhangs; a rotated instance swaps the first two dimensions.

## Required model/interface decisions

1. **No filled stacking is qualified.** None of the73 exact artifacts provides an affirmative filled-stacking approval.45 contain mechanical stacking metadata; none of the reported pitches lands exactly on the current1/32m nominal authority lattice.15 appearances are r003; approval of those appearances does not upgrade the rest of the collection.
2. **Small r003 is not a1m or0.5m stacking module.** Standard-small measured outer size is0.6610×0.4855×0.5115m, with a0.464m empty mating pitch. Its40mm feet,44mm receiver voids and16mm insertion are size-specific. A0.5m pitch would change the actual interface by36mm; a0.5m vertical reservation is already11.5mm shorter than the closed visual. Do not snap these contacts to1/32m or stretch the source mesh.
3. **A separate carrier family is the preferred correction proposal.** Preserve approved bodies and create new, separately reviewed carriers with nominal0.5m subdivisions of the2m structural grid. Prioritize1×1m and2×2m load interfaces so four1×1 carriers can sit on one2×2 carrier and support another2×2 carrier. Top and bottom bearing geometry must supply the union of support patches required by that arrangement; the existing sparse crate feet alone do not establish this. If broad flush bearing plates are undesirable visually, document the exact coplanar pads and prove their union against every mating orientation.
4. **Proposed carrier datum:** bottom supported planeZ=0, mechanical carrier thickness0.15m (matching the current review carrier), retain cargo editable meshes without scale changes. Pick installed stacking pitches in0.5m steps after measuring the full mounted closed visual. Small r003 on a0.15m carrier needs at least0.6615m before headroom, therefore a1m pitch is a reasonable model target, not an approved gameplay size. At least0.15m handling/lid clearance must be represented separately and may forbid operating a lid beneath another layer. Larger models need their own measured pitch; do not impose1m on a1.92m-high body.
5. **Oversized kits require two longitudinal structural modules.** Six approved oversized appearances fit within a2×4m closed visual reservation. Reinforced-oversized measures1.9410×4.0111×1.9200m and overhangs that length by11.1mm. Choose an explicitly revised latch/handle/body clearance that fits4m, or retain the exact visual and use2×4.5m. Do not silently clip that overhang, shrink the GLB, or pretend a2×4m AABB contains it.
6. **Fluid/loose articles retain one-high policy.** Do not add mixed-size stack permission to barrels/canisters or unsupported extension designs from appearance. A cage/carrier may later supply its own qualified bearing interface. Inventory liquid capacity and ability to store items inside a container remain separate from physical cargo placement.
7. **Room-height specification is mandatory.** Carrier height and stack pitch are distinct from a room label. Each cargo zone must carry accepted deck base/roof limits, reserved door/airlock/traversal/vent space and per-asset operating clearance. Existing review rooms are not evidence that every future deck has2.5m clear headroom. The largest1.92m bodies with a0.15m carrier and0.15m handling allowance need2.22m before any additional roof structure.
8. **Ratings require their own approval source.** Publish tare mass, gross mass, top-load and per-patch ratings, permitted multi-support bridging and secured/restraint rules independently of visual approval. Current inventory capacity or a500kg container limit is not a structural load rating. No replacement values are assigned in this task.

The modeling agent should read AGENTS.md, the Blender migration contract and art-library WORKFLOW, preserve every approved source revision, create new carrier/revised-interface asset IDs/revisions, retain exact material/detail surfaces, and deliver measured GLBs, editable sources, nominal socket/contact JSON and pairwise0/90/180/270-degree fit evidence. Its deliverables must include the2m base→four1m→2m top assembly, a missing-corner rejection case, operating envelopes and any nonstackable variants. Owner approval and authoritative mechanical qualification remain separate gates.

## Staged authority contract

Checkpoint21478ae2 adds three private, unregistered declarations in `packages/world/src/construction-cargo-grid-tables.ts`: `constructionCargoGrid`, `constructionCargoPlacement`, `constructionCargoOperation`. The synchronous `editConstructionCargoGrid(ctx,hooks,request)` adapter is in `construction-cargo-grid.ts`.

The request names a grid, expected grid revision, operation ID and at most256 unique edits. Each edit carries the existing container UUID, expected placement/inventory revision, and either a nominal integer1/32m origin plus quarter-turn or a server-qualified staging anchor ID. Clients never supply payload mass, asset identity, interface ratings, restraint state, deck authority or an invented custody destination.

The adapter resolves live authoritative payload and exact qualified interface metadata, validates the complete existing/final stack through the common pure solver, and writes only changed placement rows plus one grid revision and the durable operation receipt. Rejected support/overlap/roof/reach/grant/CAS proposals perform zero writes. It never deletes or reallocates inventory containers, contents or item UUIDs. Removal preserves a physical placement row in qualified staging custody; unsupported lower-layer removal/movement fails atomically. Distinct removal anchors with overlapping nominal boxes also fail.

Exact replay is read-only after current access validation. No-op movement adds only its receipt. The first slice explicitly limits durable operations to4096 per principal and refuses further new edits rather than silently evicting receipt identity; a future operation-epoch policy is required before broad long-lived use. The native runtime still has no qualified interface registry entries, so the all73 audit cannot be used to activate stacking.

## Root integration prerequisites

- Keep registration out of the current release. Root owns schema/reducer/view wiring and generated bindings; use auth.gameAction, private indexed tables, expected revision and reducer transaction rollback. The adapter does not catch write exceptions or claim partial transactions are safe.
- Implement server hooks using current game-owned access or explicit Shipyard permissions and accepted instance/deck state. Source and proposed destination must be authorized and within the intended physical handling/LOS policy; an editor preview or hidden UI is not permission. Do not let a physical object be installed a second time from its original native placed-object binding: availableForPlacement requires validated custody/conversion.
- Resolve cargo-only zones from the published semantic layout, never from a room name. Pin source layout and approved grid/bearing definition hashes. No published cargo-zone declaration or carrier load registry is inferred by this staged module.
- Couple every contents, liquid and inventory transfer writer to the final whole-stack load check before a transaction can change payload mass. The adapter refuses an already-invalid stack and requires a separate recovery route; it is not safe to allow a different inventory reducer to overload a live stack first.
- Include validated collision/occupancy updates and materialized native placed-object transform mapping in the same authoritative edit. The existing Wayfarer walking qualification uses pinned placed geometry; writing only cargo placement rows without updating that representation would leave stale collisions. Preserve the immutable visual source and inventory UUID mapping.
- Server staging-anchor resolution must cover native support, scene obstacles and reserved spaces, plus other current/staged cargo. Cross-grid transfer, hauling/tractor handling and in-flight editing need their own explicit authority policy. This slice supports a grid plus validated staging custody; it does not claim those later systems.
- Add keyed minimal owned/deck-visible cargo placement/contact/diagnostic projections. Do not publish other ships’ interior inventories or room documents to remote observers. Retain global transform authority and current motion leases.
- Run real isolated spawn/place/stack/remove/inventory-weight/multiplayer/reconnect proofs after actual interfaces and hooks are installed. Current tests use explicitly synthetic approved ratings and typed in-memory tables; they are not a deployed native stacking proof.

## UI handoff

Root can stage a cargo mode with0.5m subdivision snapping, quarter-turn rotation, layer/height controls, ghost reservations and contact/support diagnostics. Show actual closed visual dimensions separately from proposed nominal carrier size and operation clearance. Label unsupported/unqualified assets rather than scaling them into a ghost. Keep the container inventory inspector and its stable UUID while moving the physical container. A failed proposal retains the last accepted placement; removal previews must show which supported containers would become invalid and require a real staging target.

The desired mixed-size stack is already executable in the pure solver and the staged table adapter tests. Live UI must send one bounded edit intent, display accepted server revisions and handle stale conflicts; local ghost positions are not gameplay transforms.

## Validation

Current gates: full TypeScript passes;20 new table-adapter tests and16 existing support-solver tests pass;4Python audit tests pass. Audit reproduced all73 source/GLB hashes and measured bounds. Current native starter smoke/reconnect remains checkpoint837d739a and is independent of these unregistered tables. No service, normal database, public art or active collision geometry was changed by the cargo-grid slice.
