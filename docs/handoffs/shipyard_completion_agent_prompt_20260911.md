# External implementation agent prompt — complete Shipyard

Work in `/root/sidereal_spacetime`.

/goal Complete the Shipyard implementation and authoritative game integration specified
in `docs/handoffs/shipyard_completion_plan_20260911.md`, including the semantic Wayfarer
rebuild, native tileset compatibility, bounded fine object placement, multiplayer
persistence, visual review and validated release. Keep the goal active until its
required acceptance gates are met; do not stop at a proposal or a mock preview.

Read `AGENTS.md`, `PIVOT.md`, the complete plan above and its referenced current
contracts. Inspect actual source and deployed manifests before relying on historical
status claims. Read `docs/handoffs/shipyard_wall_pressure_preview_20260911.md` and
`docs/handoffs/cockpit_boundary_variants_20260911.md` carefully. Open all four
`reference/art/editor-mockup-{1,2,3,4}.png` references.

You are the integration owner for this task. The owner explicitly authorizes using
subagents, including Blender specialists to repair or create walls, floors, roofs,
hull/armor, windows, doors, airlocks and other incompatible geometry. Establish file
ownership and a shared versioned dimensional specification first. Do not let model
agents independently choose incompatible dimensions, pivots or mating profiles.
Review their exported geometry, actual assembled visuals and validation evidence.
Only the integration owner updates shared catalogs, schema registration, generated
bindings and release assembly; subagents must not deploy independently.

The essential requirements are:

- A coherent Creator theme and canvas-first editor that can design ships from empty
  floorplans and fully edit a converted Wayfarer without undeletable legacy walls.
- Editable hull-size limits; multiple decks; 2 m structural modules with compatible
  subdivisions and diagonal/tapered shapes; generated floors, exterior boundaries
  and roofs; editable internal wall graph, junctions, face finishes and door openings.
- Exterior walls extend outward from usable floor boundaries; internal walls reserve
  their thickness across graph lines. Exact interfaces must join without per-object
  nudges, silent scaling, gaps or z-fighting. Use the plan's machine-readable tileset
  specification for Blender exports, editor snapping and server validation.
- Preserve the existing low cockpit sill/swept glazing/frame as boundary variants.
  Do not place opaque full-height walls across the windshield. Separate structural
  support/enclosure from the bow's nonwalkable reservations. Retain diagonal modules
  for other ships. Exact current native mappings are in the cockpit handoff.
- Small object grids down to 0.0625 m (optional advanced 1/32 m), finite rotation steps
  of 5°,15°,30°,45°,90° where the asset permits them, and complete rotation persistence
  across semantic/assembly conversion, undo, save, publish and game installation.
  No arbitrary unbounded rotation, quarter-turn rounding loss or floating placement.
- Informational room labels plus all named/unnamed pressure regions; native qualified
  doors/glazing/enclosure, real external airlock, stairs/ladders and powered lifts.
- Validated exterior mounts; interior equipment reservations; cargo-only regions and
  supported mixed-size stacks; connected power/fuel/coolant/data/ventilation through
  underfloor routes, wall risers and qualified cross-deck feedthroughs.
- The same semantic design publishes to independent game instances. Distinguish
  draft, blueprint publication, spawn, capture and live refit. Preserve Dastari's
  character, inventory, fittings, resources and gameplay state during conversion.
- Server-authoritative permissions, transforms, resources, pressure and damage;
  private access-controlled data; separate native visual/proxy representations;
  structural voxel damage versus interior-entity health; coarse ship-world collision
  and exterior-only rendering of other ships.

Preserve the shared working tree and other owners' character, inventory, login and
rendering work. Do not blanket stage/reset/clean, apply stale patches, reset the live
database, copy old assembly snapshots over player changes or change Orchard. Keep
normal game/dashboard applications and their releases independent.

Start by creating `docs/handoffs/shipyard_completion_progress.md` with current evidence,
owners, exact pins, acceptance state and next actions. Execute the plan's phases in
order; request/assign missing native asset work early and continue independent work
while it progresses. Reuse existing qualified traversal, cargo, pressure, refit and
service code instead of rebuilding from obsolete handoffs. Keep incomplete adapters
explicit. The plan is a required outcome contract, not permission to invent capabilities,
resource ratings or artistic approval.

Run focused tests and the combined `npm run check`, `npm run build`, relevant lint/
format/Python/asset checks and isolated authoritative smoke tests. Review the actual
Shipyard and game with two independent instances/accounts and actual server-restart
persistence. Coordinate the single software-GPU slot; use a named browser session and
blank/close it afterwards. Capture evidence from the exact candidate.

The owner has authorized validated implementation and deployment. Follow the managed
service/release workflow, recheck current releases before activation, preserve state
and publish only the tested compatible artifacts. New art final sign-off remains a
separate explicit record. Return exact deployed locations/pins, acceptance evidence,
state-conservation results and any remaining unsupported families. Do not call the
whole task complete while required editor-to-game paths remain placeholders.
