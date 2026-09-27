# External implementation agent prompt — complete Shipyard

## Adopted boundary-treatment architecture — owner confirmation 2026-09-11

The owner explicitly confirmed adoption of `reference/sidereal_ship_editor_structural_envelope.md` with the reviewed corrections. Floor polygon union generates structural boundaries; each boundary resolves a treatment, which may be a wall, glazed/sill assembly, opening, interface or deliberate open edge. Independent internal partitions use the same geometric vocabulary. Authored intent, compiled boundaries, native geometry, collision, seal coverage and runtime state remain distinct.

Corrections governing the reference: structural wall thickness is 250 mm **inward** of the fixed tile edge; the 2 m module and supported subdivisions remain; navigation is separate from structural floor coverage; physical properties derive from qualified adapters and server state rather than editor booleans; native Blender families provide supported geometry; edge splits/merges retain explicit lineage and report attachment conflicts; labels remain independent from pressure compartments; A/B/C1 minimum completion retains multi-deck traversal, rooms and pressure before later contracts.

The standard vertical profile is now **owner-approved**: 0.1875 m floor + 3 m clear height + 0.125 m roof + 0.1875 m service void = 3.5 m pitch. Standard opaque wall heights are 0.75/1.5/2.25/3 m. Smaller deck/space profiles must be representable explicitly for ducts, connecting bridges and small craft, with their own native interfaces and actor-clearance qualification. Earlier statements that these dimensions are pending are historical and superseded.

This confirmation resumes implementation after the owner's requested pause. It does not approve new art or change existing live native/collision pins. The straight-wall request remains a bounded initial treatment-family task, not the architecture for every boundary.


**2026-09-11 owner override:** new boundary walls occupy 250 mm inward, inside the floor tile, with their external mating plane fixed to the nominal tile perimeter. This supersedes the outward-wall instructions below. Read the owner-override section at the top of the outcome plan; vertical dimensions and fractional-height native variants remain pending owner freeze.

Work in `/root/sidereal_spacetime`.

/goal Complete the Shipyard implementation and authoritative game integration specified
in `docs/handoffs/shipyard_completion_plan_20260911.md`, delivered as the four contracts
in its section 1a: A tileset specification and wall family, B editor and semantic model,
C gameplay integrations in four gates, D Wayfarer rebuild, live migration and release.
Reach the plan's minimum viable completion first. Stop for the owner check-in named at
each contract gate; do not run past a gate that requires one. Do not stop at a proposal
or a mock preview inside a contract.

Read `AGENTS.md`, `PIVOT.md`, the complete plan and its referenced current contracts.
Inspect actual source and deployed manifests before relying on historical status claims;
the plan's section 3 lists the construction reducers and tables that already exist and
must be reused. Read `docs/handoffs/shipyard_wall_pressure_preview_20260911.md` and
`docs/handoffs/cockpit_boundary_variants_20260911.md` carefully. Open all five
`reference/art/editor-mockup-{1,2,3,4,5}.png` references; mockup 5 is the owner's
chosen basis for the Creator theme and all future routes (plan section 2).

You are the integration owner for this task. The owner explicitly authorizes using
subagents, including Blender specialists to repair or create walls, floors, roofs,
hull/armor, windows, doors, airlocks and other incompatible geometry. Establish file
ownership and the shared versioned dimensional specification first. Do not let model
agents independently choose incompatible dimensions, pivots or mating profiles.
Review their exported geometry, actual assembled visuals and validation evidence.
Only the integration owner updates shared catalogs, schema registration, generated
bindings and release assembly; subagents must not deploy independently. Keep at most
three subagents active at once and record each one's file ownership in the progress
document before it starts.

Decisions you must escalate to the owner rather than make are listed in the plan's
section 1a: exterior wall family and thickness, deck pitch and clear height, hull
class envelope values, anything altering the live Wayfarer's collision revision or
native pins before Contract D, any validator you want to relax, any art revision you
want to treat as approved, and any non-additive schema change. When blocked on one,
write the question and your proposed default into the progress document, continue
independent work, and hold the dependent gate.

The essential requirements are:

- A coherent Creator theme and canvas-first editor that can design ships from empty
  floorplans and fully edit a converted Wayfarer without undeletable legacy walls.
- Editable hull-size limits; multiple decks; 2 m structural modules with compatible
  subdivisions and diagonal/tapered shapes; generated floors, exterior boundaries
  and roofs; editable internal wall graph, junctions, face finishes and door openings.
- Exterior walls extend outward from usable floor boundaries; internal walls reserve
  their thickness across graph lines. Exact interfaces must join without per-object
  nudges, silent scaling, gaps or z-fighting. Use the plan's machine-readable tileset
  specification for Blender exports, editor snapping and server validation. The old
  wall family stays installable until the rebuilt Wayfarer is accepted.
- Preserve the existing low cockpit sill/swept glazing/frame as boundary variants.
  Do not place opaque full-height walls across the windshield. Separate structural
  support/enclosure from the bow's nonwalkable reservations. Retain diagonal modules
  for other ships. Exact current native mappings are in the cockpit handoff.
- Small object grids down to 0.0625 m (optional advanced 1/32 m), finite rotation steps
  of 5°,15°,30°,45°,90° where the asset permits them, and complete rotation persistence
  across semantic/assembly conversion, undo, save, publish and game installation.
  No arbitrary unbounded rotation, quarter-turn rounding loss or floating placement.
- Informational room labels plus all named/unnamed pressure regions; native qualified
  doors/glazing/enclosure, real external airlock, stairs/ladders. Powered lifts are
  Contract C4, after the minimum viable completion.
- Validated exterior mounts; interior equipment reservations; cargo-only regions and
  supported mixed-size stacks; connected power/fuel/coolant/data/ventilation through
  underfloor routes, wall risers and qualified cross-deck feedthroughs.
- The same semantic design publishes to independent game instances. Distinguish
  draft, blueprint publication, spawn, capture and live refit. Preserve Dastari's
  character, inventory, fittings, resources and gameplay state during conversion,
  and do not touch the live ship before the owner approves the conservation report.
- Server-authoritative permissions, transforms, resources, pressure and damage;
  private access-controlled data; separate native visual/proxy representations;
  structural voxel damage versus interior-entity health; coarse ship-world collision
  and exterior-only rendering of other ships.
- The performance budget in the plan's section 8 holds throughout: record F3 counters
  before and after each contract, and treat a regression over 10% on draw calls or
  Render CPU as a gate blocker.

Preserve the shared working tree and other owners' character, inventory, login and
rendering work. Do not blanket stage/reset/clean, apply stale patches, reset the live
database, copy old assembly snapshots over player changes or change Orchard. Keep
normal game/dashboard applications and their releases independent. Disk capacity has
been restored and is not a constraint; the plan's storage rules still apply.

Start by creating `docs/handoffs/shipyard_completion_progress.md` with current evidence,
owners, exact pins, acceptance state, open owner questions and next actions, one row per
deliverable grouped by contract. Execute the phases in the plan's section 10 order;
request/assign missing native asset work early and continue independent work while it
progresses. Reuse existing qualified traversal, cargo, pressure, refit and service code
instead of rebuilding from obsolete handoffs. Keep incomplete adapters explicit. The
plan is a required outcome contract, not permission to invent capabilities, resource
ratings or artistic approval.

Run focused tests and the combined `npm run check`, `npm run build`, relevant lint/
format/Python/asset checks and isolated authoritative smoke tests. Review the actual
Shipyard and game with two independent instances/accounts and actual server-restart
persistence. Coordinate the single software-GPU slot; use a named browser session and
blank/close it afterwards. Capture evidence from the exact candidate.

The owner has authorized validated implementation and deployment. Follow the managed
service/release workflow, recheck current releases before activation, preserve state
and publish only the tested compatible artifacts. New art final sign-off remains a
separate explicit record.

At each owner check-in, and if you become blocked for any other reason, deliver: the
progress document current to that point, exact deployed locations/pins, acceptance
evidence, state-conservation results, the list of open owner decisions with your
proposed defaults, and any remaining unsupported families. Do not call the whole task
complete while required editor-to-game paths remain placeholders.
