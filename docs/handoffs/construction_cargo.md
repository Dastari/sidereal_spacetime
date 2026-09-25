# Construction cargo support foundation

Status: pure nominal validator and atomic placement proposal implemented, 2026-09-09. This is an intermediate construction prerequisite, not installed cargo-grid gameplay or approval of new cargo art/stat definitions.

## Files and verification

- `packages/sim/src/construction-cargo.ts`
- `packages/sim/src/construction-cargo.test.ts`

Sixteen focused tests pass; full TypeScript check passes. The tests include a 2×2 container supporting four 1×1 containers whose combined top interfaces support another 2×2 container. The exact patch union and mass propagated through every layer are asserted. Further tests cover missing corners, inset support gaps, uneven heights, bridge permission, gross/patch/top/grid overloads, collisions, roof and lid clearance, invalid interfaces, explicit grid subdivisions, restraint, move/removal identity preservation and deterministic ordering.

Only these new pure modules and this handoff were changed. The parent retains full aggregate check/build and later authority smoke responsibilities. No current native assets, world rows, shared entrypoints, UI, services or browser sessions were changed.

## Units and explicit interfaces

All geometric dimensions are integer 1/32 m lattice units; masses are kg. `CargoGrid` declares a convex nominal footprint, deck identity, base/roof heights, horizontal subdivision and snap origin, accepted bearing families, rated deck/rack bearing patches, aggregate load capacity and reserved service/handling volumes. Horizontal subdivision must divide the 64-unit structural module; 32 units permits 1×1 and 2×2 m containers and 16 units permits explicitly authored half-metre subdivisions. No runtime mesh scaling occurs.

`CargoInterface` pins a definition ID/revision, cargo/equipment classification, nominal box size, approved quarter-turn orientations, bearing family, tare/gross/top-load ratings, bottom/top rectangular bearing patches with individual ratings, permission for multiple supporting containers, and required operating-clearance boxes. Patches are planar on the nominal bottom/top surfaces. They cannot overlap on one surface or extend outside its footprint. Empty top interfaces are allowed; empty bottom interfaces are not.

Every number is supplied by an explicit functional/interface definition. The validator does not resolve approval records itself. The caller must look up approved metadata and current payload mass. The 73 existing visual cargo assets are not automatically assigned these interfaces from their AABBs, names or materials. Equipment such as beds and reactors is rejected by the cargo-only grid even if its box would fit. A physical liquid-container definition may use this same stacking adapter; that grants no item-grid inventory behavior.

`CargoPlacement` uses the existing stable container ID, interface ID, nominal origin/orientation, current payload mass and authoritative restraint state. It deliberately contains no copied item inventory or client-authored liquid balance.

## APIs and support mechanics

`validateCargoStack(grid, catalog, placements)` returns diagnostics, contact edges with transmitted loads, per-container gross/supported/transmitted mass, and total grid load.

The validator first checks physical volumes, allowed orientations, grid subdivision, families, restraint and roof/handling envelopes. Body intersections and blocked lid/door/handling sweeps reject. The nominal footprint is distinct from those operating-clearance volumes. Clearances may intersect the same container body but may not intersect another container body or reserved grid space. Simultaneous operation scheduling is not modeled; two otherwise unoccupied clearance volumes may overlap.

For support, only compatible top patches at exactly the bottom height can contribute. `cargoContactUnionArea` computes exact rectangular union area by slicing and merging intervals. Each bottom bearing patch requires full union coverage. A missing corner or small gap rejects; summing unrelated/overlapping areas never substitutes for actual coverage. Multiple supports require `allowMultipleSupports`. This does not permit cantilevering over an uncovered bottom patch.

The DAG is derived from contact geometry, not supplied arbitrary support IDs. Every edge descends by a strictly positive nominal container height, so cycles cannot be admitted. Floating roots reject unless their bottom patches reach the grid/rack's rated base patches. Different-height tops cannot jointly support one planar base.

Loads propagate from higher to lower containers, including each container's tare and actual payload. The fixed static approximation distributes transmitted load in proportion to actual contact area. It checks each bottom patch, receiving top patch, total top load, grid patch and total grid rating. This is not a centre-of-mass, tipping, flexure, impact or acceleration solver. The `secured` flag must come from a validated restraint adapter; this module does not implement tie-down hardware or boarding permissions.

`proposeCargoChanges(grid, catalog, placements, changes)` accepts a bounded batch of moves/removals and validates the complete resulting stack before returning it. Moves preserve interface, payload, restraint and container ID. Unknown/repeated identities reject. Removing or moving a lower support rejects if dependents become unsupported or overloaded. A valid removal returns detached container IDs for a separate custody/handling transaction; it never deletes containers or their inventories. Removing a whole supported group in one proposal is possible, subject to that authority transaction finding valid destinations for all detached entities.

## Limits and remaining work

Current bounds: 256 containers, 256 interface definitions, 16 patches per container surface, 64 grid patches, eight operating-clearance boxes per definition, 128 reserved grid volumes, 4,096 total contact edges and 256 contact patches per bottom patch. Coordinates are bounded to ±8,192 lattice units and each supplied mass/rating to 10¹² kg. These are admission caps, not measured safe per-tick throughput or approved cargo capacities. Geometry/coverage validation belongs on topology/placement changes; the server must benchmark worst-case requests before enabling the maximum caps.

The API is typed and has domain validation; it is not a general untrusted-JSON decoder. The authority layer still needs bounded decoding, approved metadata resolution, ship/deck/custody checks, operation IDs and expected revisions, resources/permissions, destination validation and atomic persistence. An invalid existing stack rejects mutation; no automatic repair drops unsupported containers or erases contents.

Not yet implemented: native nominal interface authoring/approval, instantiation of current asset variants, renderer overlays, actual grid placement UI, inventory binding, fluid handling, permission-backed cargo transfers, moving-platform/acceleration restraints, partial-tier racks, arbitrary non-convex grids, nonrectangular bearing patches, arbitrary-angle rotation, actual two-client/restart validation or live-game integration. The current model's full support and static load distribution are explicit constraints, not claims of comprehensive structural mechanics.
