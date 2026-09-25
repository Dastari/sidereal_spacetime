# First Shipyard-authored ship in the game

> Superseded in overall scope by [the multi-deck Wayfarer construction rebuild](../ship_construction_rebuild.md), owner direction2026-09-09. This first single-deck slice remains an intermediate gate only.

Owner request 2026-09-09: the game must consume authored ships and layouts. Assigned to the new integration owner (`integration_continuation`) after the current authentication/pose acceptance. A further specialist spawn was attempted but the agent thread limit was reached; no additional specialist was actually launched.

## Current verified boundary

The independent Shipyard dashboard is live at `https://sidereal.tail7a58a6.ts.net:8445/shipyard`. Its latest Hull/Objects work can import the current Wayfarer visual assembly, edit individual native placements, and save/export/recover a local draft. The Structure/Rooms compiler separately validates authored polygon floors, partition openings and semantic regions.

These are currently disconnected from authoritative ship creation. Publish/refit/capture controls intentionally remain unavailable. A visual assembly import does not recover functional rooms or walkable floor topology. The game renderer still selects `wayfarer.glb` plus global hull/equipment/floor/cargo manifests; world movement and fixtures depend on the current pilot/interior constants. Neither successful JSON export nor a correct editor preview establishes in-game authorship.

Sources: `docs/handoffs/ship_layout_editor_hull_objects.md`, `docs/handoffs/ship_layout_editor_stages_0_2.md`, `docs/releases/layout-editor-2026-09-09.md`, `docs/ship_layout_editor_design.md`.

## First delivery: a separate playable test ship

The first acceptance target is an end-to-end vertical slice: author a small single-playable-deck test ship, persist and publish its validated immutable blueprint, instantiate a separate development ship, load that ship in the actual game, walk its authored floor/doorway layout, inspect its installed objects, and reconnect without losing its identity or state.

Preserve the current Wayfarer and every existing user's state. Test creation must not overwrite the global assembly or normal starter fixture. Development creation may use explicit scoped test grants, recorded as such; it does not establish production construction economics or grant all account holders blueprint/refit rights.

## Shared authoritative contract

- Distinguish draft document ID/revision, immutable published blueprint ID/revision/content hash, and live ship instance ID/structural revision.
- Pin compiler/schema versions and approved asset IDs/revisions/hashes. A compiler fingerprint used only as a cache key is not a publication payload hash.
- Persist private owned drafts and expose only authorized fields/rows. Publication requires explicit server authoring capability; valid login and ship ownership alone are insufficient.
- Every mutation validates expected revision and operation ID with payload-bound receipts. Publication reruns admission, geometry, fitting and dependency checks on the server; a client-supplied compiled result is not trusted authority.
- Instantiate new live placed-object/fitting UUIDs once, preserving explicit mappings from blueprint placements. Repeated operation IDs return the same outcome. Asset identity is reusable; placed identity is not.
- Use the compiled authored floor union, partitions and validated openings for planar movement/collision. Render approved native assets from corresponding placements. Do not keep movement bound to the original Wayfarer constants underneath a differently shaped visual ship.
- Canonical functional definitions supply station/interactions/container/engine interfaces and approved stats. A decorative mesh, room label, pipe line or emitter cannot grant piloting, storage, thrust, pressure sealing or power by appearance.
- Respect the one-playable-plane simulation contract. Additional deck art does not silently enable vertical gameplay.

## Reconcile topology and visual assembly explicitly

The new workbench has two useful representations: semantic floor/room topology and visual asset placements. Define stable mapping between them. A moved visual floor panel must either edit its linked semantic floor placement or visibly remain decorative/unresolved; it must not silently diverge from collision.

Use existing native floor/hull/equipment assets where their nominal interfaces fit the compiled spans. Unsupported floor/wall/corner/door interfaces require actionable diagnostics and remain draft-only until an adapter exists. Do not stretch arbitrary geometry over an incompatible opening, infer collision from a GLB bounding box, or silently replace authored Blender surfaces with voxel preview meshes.

The first supported fixture can be deliberately small. It must demonstrate an authored perimeter that differs from Wayfarer, at least one partition/opening, a supported installed interaction and a non-liquid storage container. Powered control/engines require their existing authoritative definitions and clearance rules; the first slice must not invent a systems simulator to make decorative routes functional.

## Keep operations distinct

1. Save draft: recoverable authored intent, no live ship mutation.
2. Publish blueprint: new immutable validated revision, no automatic refit.
3. Create test instance: explicit development operation with its own ID and permitted placement policy.
4. Apply live refit: separate later atomic reconciliation, preserving existing cargo/items/crew/fitting IDs; occupied/unsupported changes reject safely.
5. Capture live to draft: separate authorized provenance-bearing snapshot, without duplicating resources.

The first delivery prioritizes steps1–3. Do not enable an unsafe refit button merely to make the editor appear connected. A subsequent validated Wayfarer migration can retire global fixture assumptions after the generic instance path is proven.

## Acceptance evidence

Actual browser sequence on the managed dashboard/game, with exact blueprint and instance identifiers:

- Author/edit the supported test ship; server save; refresh and recover exact document.
- Publish, then instantiate using authorized actions; reload game and render the correct pinned assets/placements.
- Walk along its changed outer boundary, stop at walls and pass through the authored opening. Verify server positions rather than camera-only movement.
- Select a fitted object by its live placement identity. Store/retrieve from its real non-liquid inventory container; reconnect and preserve contents/UUIDs.
- Prove the previous Wayfarer, its cargo, crew/control state and other user's data were not replaced.
- Isolated tests for unauthorized access/publication, private views, stale revisions, duplicate operation retry, mismatched asset hashes, invalid/unsupported geometry, no-fit placement and atomic failure.
- Record actual process-restart persistence separately from browser reconnect.

Run focused compiler/authority/runtime tests, isolated smoke, full check/build/art checks, and actual browser review. Coordinate GPU ownership with the integration agent. Preserve unrelated Shipyard, material, planet and auth edits; independent apps retain their build/deployment boundaries.

Deferred from this first slice: production construction costs, destructive live refits, full decompression/pressure propagation, resource-routing simulation, multi-deck traversal, combat hardpoint simulation and station docking mechanics. Their authored data may be preserved without claiming operational gameplay.
