# Studio spatial and template workflows

Status: implementation authorized by owner request, 2026-09-21. Dedicated test ships explicitly selected; normal ships and inventories must be preserved.

## Outcomes

- One persistent left icon rail provides Workspaces, Map editor, Shipyard, Genesis, components, help and game links. Accessible names, selected state, keyboard focus and narrow-screen operation remain available. Remove duplicate top navigation and Shipyard rules that hide the rail.
- Deep space is the normal stars-only fallback, including outside system bounds. It contains no nebula image or procedural gas. A system chooses a background; each field can inherit or override it. Both map and game use the same bounded deterministic region-weight rules with inward feather bands.
- A system can anchor its center to its primary star and author a radius. Existing explicit centers remain preserved until an explicit anchor selection; new seeded maps anchor to their star. Parent links identify planets and moons, reject cycles, and generate static orbit guides through child positions. Parent moves preserve descendant relative placement in one undoable edit. No orbital simulation is added.
- Map markers show packaged 192px portraits from hash-matched renders of the actual celestial assets, with independent physical-radius outlines and accessible fallback indicators. The 29 portraits total 152,534 bytes; source image and asset hashes are retained in a manifest. Planet portraits use reference seed117, while placement/seed stays separate. No per-marker renderer or runtime mesh loading. Background rasterization runs in a disposable worker with precomputed field ordering/bounds.
- Shipyard stage review covers structure/decks, objects, hull, services, validation and named template publication. Preserve full construction metadata across open/edit/save. Unsupported gameplay must be identified by validation rather than granted by visuals.
- Saved immutable templates create independent test ships. The normal game exposes the owned test-ship library without a query gate. Atomic test-ship switching preserves the original home return record, rejects unsafe/occupied/traversing transitions, checks expected revisions and supports idempotent retries. Returning home restores the existing home state. Publishing a template never edits an existing ship.

## Contracts

Retain private base tables, explicit construction/map grants, source fingerprints, revision checks and operation receipts. Region projection contains only public presentation choices and geometry permitted to the actor; omit resources, authoring history and undiscovered body data. Membership in a visual background is not world admission, discovery or flight authority. Preserve world XY meters and renderer X/-Z mapping.

Extend version-1 map documents with optional backward-compatible metadata; absent fields keep historical explicit centers/backgrounds. Pure content normalization supplies known parent/appearance metadata without changing stored coordinates. Validate new fields on authority consumption, including numeric budgets, hierarchy and deterministic priorities. The game must reset to Deep space when its authorized region projection disappears.

Background resolution: deep-space base, then system weight inside sphere, then ordered field overrides inside both system and field. Smoothstep over an inward band, clamped to finite normalized weights. Ellipsoids use normalized boundary distance; boxes and concave polygon prisms use nearest-edge/depth distance. Equal-priority overlaps sort by stable ID. The chart samples those same rules over world XY at the chosen height; the game samples accepted ship position.

## Design

Retain Barlow/Barlow Condensed and existing Creator themes: canvas #06141f, surface #0a202d, raised #102c3d, text #e4eff7, muted #9cb7c9 and accent #36c8f4. A compact left rail contains navigation; the chart/ship viewport remains the largest surface. Hierarchy tree left, spatial canvas center, selected properties right. Use selected-item emphasis and clear validation messages; avoid decorative dashboard cards. Existing per-workspace controls remain in their workspace.

## Execution and acceptance

1. Integrate existing map PR source in an isolated branch from upstream main; inspect newer Shipyard changes before porting workflow fixes.
2. Implement navigation and pure map/background contracts with tests for defaults, off-origin anchor, legacy preservation, hierarchy, overlap, polygon feathering and invalid input.
3. Wire sanitized server projections and shared game/editor presentation; validate actual snapshots and map controls in a browser.
4. Repair template round-trip/readiness and dedicated review switching. Test stale/replayed requests, grant loss, independent UUID/state, unsafe transitions and A → B → home.
5. Run check/build and isolated authority smoke; real browser review across navigation, map and all Shipyard stages, including save/reload and template entry/switch/return. Record baseline failures honestly. Keep runtime publications separate; no production database or public release activation is implied.

Success: an authored field override is visible with feathering in map and game; new system boundary is centered on its chosen star; moons appear under planets with orbit guides; two saved test designs can be entered/switched without changing home inventory. Geometry/flight qualifications remain explicit, never bypassed to make the UI appear complete.
