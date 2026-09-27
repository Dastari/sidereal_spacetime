# Native boundary placement planner

Status: pure geometry-fit foundation; parent integrates publication, instance authority and rendering. Updated 2026-09-09.

## API and ownership

`packages/sim/src/construction-boundaries.ts` exports `planNativeBoundaries(layout, deckId, { floorTopUnits, obstacles? })`, `NativeBoundaryError`, the placement/obstacle/reservation types, and explicit kit and workload limits. Inputs pass the existing layout reader and compiler. The planner imports the content package's explicit `ship-layout` and `construction-boundary-interfaces.json` exports; it does not edit catalogs, world state or visual meshes.

A successful result contains the selected deck, compiled layout fingerprint, exact candidate kit pin, sorted native placements and door swing reservations. Each placement has a deterministic semantic `key`, `partId`, asset UUID, GLB `nodePrefix`, `[x, y, deckElevation]` lattice origin, quarter-turn rotation and optional source `openingId`. Keys are allocation inputs, not authoritative placed-object UUIDs: the instance owner allocates and persists those separately. Existing source object identities are preserved, not replaced by the visual part IDs.

Coordinates use 32 lattice units per metre. The current candidate requires floor top 6 (0.1875 m) and a ceiling/structural wall-top plane of 96 (3 m above deck origin), giving 2.8125 m clear standing height. Door reservation heights are relative to deck origin. The caller must independently establish the native floor binding and its exact source revision; this layout-only API does not infer floor data from visuals.

## Exact candidate

Design: `assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001/`.

- GLB SHA-256: `4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426`.
- Interface JSON SHA-256: `33347b32b1675fee00d36046a05de37013fa32eca6e2a4d671464da3499972d9`.
- Explicit selectors cover wall-2m, wall-1m, join-straight, closure-end, closure-corner, closure-t, door-frame-2m and door-leaf.

The planner checks the imported revision, per-part GLB pin, critical datums and swing radius. It carries the interface hash as an exact bundle contract; it does not perform runtime cryptographic hashing of imported JSON bytes. Artifact verification remains the publication owner’s responsibility.

## Supported geometry

The planner uses compiled perimeter boundaries and original unsplit partitions. Harmless collinear tile boundaries coalesce, while perpendicular endpoint/intersection nodes split runs before module placement. Complete 2 m and 1 m modules fill each supported run. Every span endpoint has one shared closure; closed loops, corners, straight joins, T junctions and free partition ends have explicit native parts. It never stretches an asset or builds a wall across only the compiler's remaining door-gap fragments.

Interior door apertures must be exactly 40 units (1.25 m), zero sill, and admit a centered 64-unit frame with 12 units of jamb reservation at each end. The frame and separately movable leaf retain one opening identity. Existing junctions cannot lie inside a frame. Frame reservations cannot overlap; adjacent frames can share one endpoint node. Authored opening direction a→b determines the frame orientation and swing toward its negative local Y side.

The door's pinned conservative sweep radius is 1.3119895197752154 m. Its authored axis-aligned sweep envelope is transformed by the placement quarter-turn. Full floor-union intersection area must support the entire envelope: checking only its corners would miss holes. The reservation rejects intersections with other wall spans, closures, height-relevant explicit obstacles and other door reservations. This envelope is deliberately conservative and can reject narrow rooms that clear a less conservative angular sweep.

Explicit obstacles contain a stable ID, deck ID, explicit definition ID, strictly convex polygon and bottom/top heights relative to deck origin. Every selected-deck fitting requires its corresponding obstacle binding. Legacy assembly objects also require explicit bindings, because the legacy assembly alone has no deck identity. Art AABBs and model appearances are never treated as authority-approved obstruction geometry. Objects are also checked against nominal walls and closed doors, independently of swing clearance.

## Rejections and limits

Unsupported diagonal spans, partial module lengths, four-way junctions, open dividers, different deck datums, passages and airlocks fail explicitly. Door frames must lie on their source partition; external doorway adapters are not implemented. Obstacle polygons must be bounded, finite, strictly convex and non-self-intersecting. Touching interfaces are permitted; positive overlap is rejected.

Limits are 512 source tiles, 2,048 raw boundary segments, 1,000,000 pair checks, 4,096 placements, 128 openings, 512 obstacles and 16 vertices per obstacle. Obstacle coordinates/heights are bounded to ±8,192 units. Existing layout reader/compiler limits apply first. Errors are `NativeBoundaryError` with a specific `code` and relevant IDs. These caps are admission limits, not a claim that the maximum scene meets a particular render budget.

A successful result explicitly returns `geometryFit: true`, `pressureApproved: false`, `damageApproved: false` and `ownerArtApproved: false`. Native clipping, pressure seals and material damage ratings are not certified. In particular the current leaf has 2 mm fitting gaps and no gasket; it must not be described as an airtight airlock. The health-only interior equipment versus voxel structural/exterior damage contract remains unchanged. There is no mesh-derived health, strength, mass or pressure rating.

## Validation

Focused command: `npx vitest run packages/sim/src/construction-boundaries.test.ts`.

19 tests pass after switching to the package-export imports and formatting both owned files. Coverage includes closed loops and unique joins, collinear tile seam coalescing, T splits, 1 m runs, exact jamb alignment, reversed authored door swing, narrow floor/partition clearance rejection, overlapping and adjacent frame reservations, X junction rejection, order invariance, multiple deck elevations, hidden floor holes, explicit object bindings and wall penetration, self-intersecting obstacle rejection, unsupported shapes/datums and a 256-tile bounded fixture plus over-budget admission rejection.

The parent owns aggregate check/build and browser evidence for the integrated candidate. Pure planner tests do not prove installed game behavior, final art acceptance, pressure simulation or damage authority.
