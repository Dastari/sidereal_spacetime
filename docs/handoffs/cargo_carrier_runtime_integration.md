# Qualified cargo carriers: next additive integration

Status: source implementation and focused tests; **unregistered and not live**. Updated2026-09-10. Owner authorized implementation/deployment and provisional gameplay balance; native art remains awaiting owner final sign-off. Parent technical review accepted the stacked/unstacked fixture PNGs. Normal Wayfarer storage is unchanged.

## Exact fixture and native inputs

- `packages/content/src/cargo-handling-fixture.ts` pins a dedicated Shipyard station-module review: twelve native2m floor modules,8×6m floor,6×4m cargo zone, native roof underside3m. Construction SHA `b2b413fa0e924cd72cde266a2e72525c78bfa199d53f799751ce5b4f9eba3ea0`; cargo-grid definition SHA `7153e957c6e766d11089b00e202d735e1cb064f5895c44f52ba50edaacf9a5fb`.
- Exact six-assembly arrangement:2m base, four1m middle carriers,2m top. Every carrier contains one closed standard-small/red payload. Remaining2m carrier cells are reserved, not extra inventory slots. Empty stack200kg uses explicit provisional balance:1m20kg tare/250kg gross/1000kg top;2m60kg tare/1000kg gross/2000kg top; each bearing1000kg; zone5000kg.
- The prior all73GLB audit remains authoritative:13 fit this carrier height; only exact standard-small/red are positively retained by this receiver revision. Other11 envelope fits are not secured approvals; other60 do not fit.
- Native receiver cups retain existing40mm feet with44mm openings,28mm walls and less than19.751mm upward clearance under the locked frame. Fixed payload orientation only. Carrier quarters0–3 supported. This is not free6DOF physics or engineering load certification.
- Native assets are pinned in `packages/content/src/cargo-carriers.ts`; see `cargo_carrier_native_candidate.md` for full interfaces and original approved sources. All original73approved assets remain unchanged.
- `assets/art-library/designs/cargo.handling.fixture/revisions/r001/a002/` contains stacked/unstacked editable Blender scenes and PNGs. Prior a001 is retained with the failed helper-visibility review. New scenes use the exact native floor GLB group and native carriers/payloads/receivers. Roofs are cut away in the images; the paired native roof is in the construction document.
- Artifact staging only: `.runtime/release-inputs/cargo-carriers-r000-a003/`. `scripts/stage_cargo_carriers.py` verifies source hashes and prepares three GLBs. **Not yet copied into `assets/runtime`**. Proposed published location `/assets/assembly/cargo-carriers/r000-a003/`.

## Authority registration (release owner window required)

1. Register private `constructionCargoAssembly` from `construction-cargo-assembly-tables.ts` plus `constructionCargoGrid`, `constructionCargoPlacement`, `constructionCargoOperation` from `construction-cargo-grid-tables.ts`. No old table replacement, UUID conversion, default spawn changes or tick polling.
2. Add `install_cargo_handling_fixture` reducer: `instanceId:string`, `expectedInstanceRevision:u64`, `operationId:string`, calls `installCargoHandlingFixture(ctx,args)` in `construction-cargo-fixture.ts`. It requires game authentication, exact owner/fixture hash and current `instance.spawn` authoring grant. Create the fixture through existing draft/publish/spawn APIs first. Installation allocates one grid and24fresh assembly/carrier/container/placed IDs; six empty inventory roots reuse the existing14×14/500kg inventory definition. The narrower carrier load rules additionally apply. No extra starter items or copied inventories are minted. Existing instance JSON/revision, characters, private ships and personal kit stay unchanged. Replays retain exact IDs.
3. Add `move_cargo_carrier` reducer with scalar fields: `gridId`, `expectedGridRevision:u64`, `operationId`, `containerId`, `expectedPlacementRevision:u64`, `expectedInventoryRevision:u64`, `originX/Y/Z:i32`, `quarterTurns:u8`. Construct one `CargoGridRequest` edit of kind`move`. Coordinates are proposals on a1/32m lattice; validators own final placement. Other edit kinds remain unsupported by this runtime adapter.
4. Add `own_cargo_carriers` using `auth.gameView(ownCargoCarriers)` and `t.array(cargoCarrierProjection)`, and `own_cargo_grids` with corresponding functions/types in `construction-cargo-carrier-views.ts`. Keys are carrierId/gridId. Both require accepted current instance/deck and current interior read access. Sitting does not hide geometry; inventory contents remain separately reach-filtered. No public table and no remote interior disclosure.
5. Append `cargoCarrierCollision(ctx, frame)` after native walls, door leafs and refit/fuel collision in `constructionCollision`. It does not need sender or inventory reads. Replace only exact adopted payload identities and prior carrier overlays, preserve every unrelated wall/door/fuel obstacle, and include placement revision in the fingerprint. Do not cache away dynamic placement changes. Native floor/roof meshes remain distinct from collision.
6. In `readCargo`, wrap the completed reader with `withCargoCarrierApproaches(ctx, reader)` from `construction-cargo-access.ts`. This derives the nearest qualified standing approach around a secured carrier for the current actor; it neither grants access nor writes transforms. Non-carrier roots are unchanged. Existing actor/deck/grant/reach/LOS validators still run. The move adapter currently wraps its reader directly; remove that duplicate wrapper when the shared reader owns it.
7. In `moveScopedCargo`, capture source and destination root IDs from `inventoryContainerScope` **before** `transferScopedCargo` changes memberships. After a successful non-replay transfer call `assertCargoStackMass(ctx, capturedRoots)`. Let errors propagate: SpacetimeDB must roll back item/container/revision/receipt changes together. Never catch and commit a partial transfer. All nested items and actual liquid volumes/densities count. Unknown/invalid liquid mass rejects. Current mounted-fuel pour requires its other reservoir to be carried character scope, so cannot change carrier payload in place; preserve that boundary unless adding the same mass guard.
8. Generate bindings once after registration. Update mocks with additive empty tables as needed. No hand edits to generated bindings.

## Handling and limits

`planCargoCarrierHandling` validates the complete one-carrier lift, axis-aligned translation, lowering and quarter-turn swept envelope before writes. It rejects moving a support while cargo rests on it, final/intermediate collisions, floor gaps, insufficient ceiling headroom, unsafe rotation and unsupported destinations. The whole-stack solver applies actual bearing patches and provisional loads. Current actor/source/destination approach, grant/deck, stationary ship and occupant clearance checks are separate authority requirements. The dedicated exact fixture is explicitly static without ship motion rows; no arbitrary review ship gets that exception.

Runtime placement preserves container/item UUIDs and updates only changed placement/grid/container revisions and root presentation/approach. Replays cause no extra revision writes. Unloading uses free supported cells inside the same cargo grid. Deletion, arbitrary detached staging, cross-grid teleport, carrying large assemblies through doors, human lifting strength, cargo hoists and animated handling are not implemented. Normal Wayfarer storage lacks a second2m staging pad, so it is **not** claimed to support this complete unloading sequence and is not expanded by this slice.

## Client contract

`ownCargoCarriers`: carrierIdPK, containerId, placedObjectId, instanceId, deckId, gridId, carrierSize, payloadAssetId, carrierGlbSha256, receiverGlbSha256, payloadGlbSha256, originX/Y/Z integerunits, quarterTurns, placementRevision, assemblyRevision, inventoryRevision, gridRevision, secured, payloadMassKg, maxGrossMassKg.

`ownCargoGrids`: gridIdPK, instanceId, deckId, definitionSha256, footprintUnitsJson, baseZ, roofZ, horizontalStepUnits, snapOriginX/Y, maxLoadKg, revision. Small geometry projection only, not the full private construction document.

Render one independent root per carrierId. Native payload retains placedObjectId, inventory selection retains containerId. Use `cargoAssemblyTransforms` for lower-left nominal origin and exact payload/receiver offsets. Combine compatible geometry by material **within** each carrier identity to control draw calls; shared immutable GLB geometry is allowed. Suppress the original payload placed mesh only when this exact accepted overlay replaces it. No new point lights. Respect equipment debug hiding, roof/cutaway/top-down policies, accepted deck, revoke/disposal and camera-relative coordinates. Prefer shared native mesh import and do not rebuild these visuals as voxel solids.

UI exposes the explicit fixture installation and cargo-grid placement mode, selected carrier/item stats and rejected-move reason. Moves send all three revisions. Reuse current inventory panels for reachable cargo. Bulk inventory transfers remain sequential per-item commits; no false batch atomicity claim.

## Evidence and next gate

Focused tests cover actual paired native floor compilation, fresh six-root installation, grant/occupant rejection, replay, actual ctx.db moves, full unload/rebuild from supported reachable actor positions, retained item IDs and private documents, actual nested-liquid mass, carrier overload, support/removal rules, rotation/ceiling/wall sweeps, collision identity preservation and admitted/revoked/deck projection filtering. The test table adapter proves preflight and writes; it is not the SpacetimeDB transaction engine.

Required before activation: combined check/build/art gates; fresh isolated publication; real-provider explicit fixture creation/entry; item store/move/reload/reconnect/unload/rebuild; deliberately overloaded transfer proving **actual database rollback including receipt/revisions**; second-account privacy and revoked access; root browser review and draw-call measurement; matched immutable release manifest. Parent owns browser GPU and final client integration. Current release owner controls world/index and generation until the refit candidate is pinned.

## Reserved authored envelope and structural clearance correction

The owner requires the entire exported asset to fit its declared footprint and
height at a consistent authored pivot. A 2 m reservation cannot admit a 2.04 m
mesh. Handles, feet, latches and bevels count. `scripts/art_library/validate_reserved_envelope.py`
now enforces that contract on every cargo carrier staging operation, before any
copy. The exact three inputs pass; their declared polygons, heights, measured
native bounds and hashes are retained in
`docs/handoffs/cargo_reserved_envelope_qualification.json`. Qualification applies
to convex declared footprints; concave shapes must use a separately validated
convex decomposition. No automatic scaling, recentering or placement repair is
performed. The 1e-6 m tolerance only accommodates GLB float32 encoding.

Placement validation separately permits the explicit floor bearing interface and
requires 1/32 m clearance from non-mount structure in the handling fixture.
It now checks the full wall segment thickness and polygon edge intersections;
checking only wall centerlines or contained vertices missed real penetrations.
Three regressions cover those cases. This clearance is not a remedy for oversized
art. Walls belong outside usable floor envelopes, while approved equipment mounts
need their own explicit mating and clearance contract.

The six Python reserved-envelope tests include the actual pinned native exports
and rejection of oversized geometry, a protruding foot, a triangle's empty half,
an incorrect pivot and invalid metadata. These checks and the source-only
clearance correction do not register cargo runtime or change the pinned release.


## Exact native rotation and assembled envelope

`cargoAssemblyTransforms` now distinguishes the unchanged nominal lower-left
`carrierOriginM` from `carrierMeshOriginM` / `receiverMeshOriginM`. Apply the latter
translation plus `quarterTurns` to native GLB coordinates. `carrierPivotLocalM`
is the explicitly declared reservation center. This is ordinary rotation around
an authored pivot; no mesh-bounds recentering, rescaling or oversized-asset repair
occurs. The payload keeps its exact qualified receiver socket and rotates with
the assembly. Independent container/placed/carrier IDs are unchanged.

`scripts/art_library/qualify_cargo_assembly_envelope.py` checks all 16 combinations
(two carrier sizes × two secured payload variants × four quarter turns). It
verifies the exact source hashes, complete native geometry, receiver socket,
reserved payload cell and whole assembled volume. All pass with no source model
changes. Evidence: `docs/handoffs/cargo_assembled_envelope_qualification.json`.
This does not extend securing approval to the other 11 envelope-compatible cargo
variants or the 60 taller/larger variants.

The staged registration keeps a base inventory reader for geometry-independent
mass calculations. Only normal inspection/interaction reads derive a dynamic
walking approach; mass validation must never depend on where the caller stands.
The isolated proof preparation is under `.runtime/cargo-carrier-review`; its
current scripts are staged and have not yet executed against a registered world.
