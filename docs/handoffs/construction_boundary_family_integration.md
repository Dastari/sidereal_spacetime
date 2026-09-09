# Shaped-room boundary family integration — 2026-09-09

Status: actual-game working checkpoint; full construction rebuild incomplete. This records native r004 family integration, not final owner art approval or pressure certification.

The optional `boundaryKit` pin selects `shipyard.structure.boundary-kit` r004 with GLB SHA256 `568d491623f03df932a9c5c120a94e4a60b00bd0fd421ae3cf928c89543505db` and interface SHA256 `136afd89f22c1cbea3ba590fca4ebc4cd81f82615f71fcadcedc2d041b73544b`. Canonical deliverables are under `assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family/`; the earlier r004 study is preserved, not installed. `scripts/install_construction_boundary_family.py` copies only the exact native GLB and projected runtime manifest into `assets/runtime/construction/boundary-r004` and the two independent apps. Editable Blender source and review images remain private.

## Implemented behavior

The bounded generic grammar matches native span lengths, node rays and end profiles using integer lattice coordinates and quarter turns. It splits T endpoints and rejects unlisted junctions, proper crossings and unsupported spans. It never stretches or mirrors the authored visual meshes to conceal a mismatch. All twelve floor-kit shapes in four rotations compile against the pinned family.

The clipped-corner floor requires a five-sided convex polygon. `lattice-shapes-2` explicitly adds that semantic shape; the editor upgrades the declared dependency only when required. Unchanged v1 layouts remain unchanged, and unknown future dependencies are rejected without overwriting drafts.

Spawn and walking use the exact native structural-core convex polygons, including acute miter extents. Decoration is not silently treated as structure. Ten independently identified native wall placements enclose the actual clipped-room proof. r001 remains the default historical kit. r004 currently supports closed-room layouts only: openings and fittings are explicitly rejected until their frame/interface compatibility is integrated. It must not replace an opening with a wall.

The editor recovers selected wall/roof kits and the last-read server revision under a key scoped to account, workspace and document. A cached revision is not advanced merely because a subscription receives another editor's update. This preserves normal revision-conflict behavior. Explicit Load updates the revision and preserves the prior local document in recovery storage.

## Actual browser gate

The named additive review database was `sidereal-spacetime-dev-review-boundaries-20260909`. Actual pointer interactions created a clipped-corner floor at nonzero local origin `[9 m, 0 m]`, selected r004 and the matching r001 roof, saved the workspace draft, published its immutable blueprint and created a new walking instance. Reload retained both kit selections; a second save reached draft revision 2 and publication after another reload passed exact saved-draft checks.

- Draft: `b3254369-8988-4916-9903-845b51030a24`.
- Blueprint: `c4bbe104-193e-4098-875a-2f080c09d9e9`, SHA256 `dde930c628b83a308c829f66e91a7b5a6826f1430bfbced5e2b46ed1f0bbc05f`.
- Instance: `1904c0dc-4aec-4a0d-a02d-9b8c3202b794`.
- Instance deck: `b4735b07-fd91-4867-9f56-36f61d5af115`.
- Footprint in metres: `[9,0], [11,0], [11,1], [10,2], [9,2]`.

Actual keyboard walking stopped at structural cores, including the diagonal boundary; recorded corner limits were approximately x=9.346875/10.653125 and y=0.346875/1.653125. Interior view cuts away near walls and hides the roof; top-down enables all ten native boundary placements and the roof. Reload preserved instance/location/door/actor position rows. Return restored the original ship and `[0,10.25]` position with all seven inventory items, containers, appearance and the three pre-existing door rows unchanged. All four named review instances remain intact.

Evidence: `output/playwright/construction-boundary-r004-{shipyard,interior,flight}.png` and `construction-boundary-r004-proof.json`. The browser used actual HTTPS applications and actual server reducers; routing changed only the database name and exposed read-only inspection handles. Software-GPU frames were manually stepped; no hardware FPS claim. `authoring-proof` was closed and its temporary provider authoring role revoked after review.

An initial Return probe sampled empty tables during authentication renewal. The repeated proof explicitly waited for an active connection and the expected nonempty inventory/instance projections before comparing rows; it passed. A stale Vite resolution of a concurrently added pose module required a managed client-only restart. Neither issue reset or reseeded the database.

## Remaining work

Native r004 has known under-wall paths over some mixed floor bevels. r005 `final-a004` supplies measured closure parts but remains uninstalled. Gasket r002, door-strip r003, persistent-atmosphere helpers and the seal-motion/renderer adapters remain staged and unregistered/unwired. No gas is initialized and no wall or door is claimed airtight from appearance. The prototype's eventual gameplay seal/flow definitions remain separate from final visual approval or real-world certification.

Operational pressure/airlocks, physical deck traversal, cargo grids and stacks, 3D services, external mounts/armor, scoped native voxel damage and the complete semantic Wayfarer template with two independent full spawns remain required. This checkpoint deliberately freezes source expansion before those integrations so the completed work can be reviewed and committed coherently.
