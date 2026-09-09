# Semantic ship construction and Wayfarer template rebuild

Owner direction: 2026-09-09. This is the next highest implementation priority after authentication/account persistence and character model/rig integration. Planet and general rendering iterations are paused. This supersedes the earlier single-playable-deck **completion scope** in the Shipyard plan; a single-deck test remains only an intermediate validation step.

Status: owner requirements accepted; current implementation and asset interfaces audited; construction gameplay below is required work, not implemented merely by this document. The end result is a fully reconstructed Wayfarer authored in Shipyard and stored as a spawnable template with independent live contents and equipment for every spawn.

## What we already have

The local Shipyard stores multiple authored decks, a 1/32 m lattice, 2 m rectangular/triangular/trapezoidal floor topology, partitions/openings, semantic room labels, typed routing drafts and editable native placements. Document storage is distinct from arbitrary playable-deck support: qualified native fixtures supply their own exact geometry, traversal and safety proofs; unsupported geometry must still reject.

Draft publication and independently allocated construction review instances are connected to SpacetimeDB and the game. Exact native ladder and ordinary-intent dogleg stair adapters are registered; they are bounded fixtures, not universal stair/elevator support. The exact r006 pressure room has a registered private finite-gas/hinge/gasket adapter. It starts in vacuum and does not provide life support, resource charging, general sealed layouts or a complete powered external airlock.

The pinned full 262-placement Wayfarer visual document now has qualified conservative collision, two independently spawned static instances and actual isolated game walking/native roof/cutaway/return evidence. Its source still contains one deck. The normal live Wayfarer and its existing contents have not been migrated into a complete functional semantic template. Functional per-instance inventory/equipment, low-step support follow-up, cargo/services, native damage and live refit remain separate integration gates. See [qualified Wayfarer walking](handoffs/wayfarer_walking_integration.md); none of this grants pressure, payload, health or armor ratings merely from the meshes.

The audit at `docs/handoffs/ship_construction_asset_audit.json`, reproduced with `python3 scripts/audit_ship_construction.py`, pins the current assembly and manifest hashes. Current Wayfarer has262 placements. The native floor kit has12 shapes:2×2,2×1,1×1,4×1, several triangles, clipped corners and a taper;49 squares and2 triangles are currently installed. Hull, equipment and cargo identities/sources must be preserved throughout migration.

Cargo visuals are not already a standardized stack system: Standard Small bounds are about0.661×0.486×0.512m; Medium1.061×0.796×0.952m; Large1.941×1.316×1.720m; Oversized1.941×3.916×1.920m. These are **visual AABBs**, including details. They do not define nominal packing pitch, load surfaces, clearance or payload ratings. Current asset records do not expose a top-level standardized support/stack interface. Native sources can be reused, but compatible variants/frames and gameplay metadata need an explicit pass. Do not silently scale approved GLBs to force a fit.

## One semantic construction model

The [tileset interface contract](ship_tileset_interface_contract.md) defines the owner's additional requirement: an asset agent can receive exact named shapes/dimensions and produce a independently validated, interchangeable kit. Implement versioned nominal footprints, datums, edge/mount/service interfaces and an assembly validator before broad new kit authoring. Preserve the 2 m structural grid with explicit subdivisions; do not silently adopt the illustrative reference's 1 m module.

Blueprint intent, compiled topology, native visual representations and live state are separate, linked by stable identifiers. A published ship cannot have a floor mesh in one place and its collision floor somewhere else.

| Layer | Authoring meaning | Runtime responsibility |
| --- | --- | --- |
| Deck floor/superstructure | Nominal2m module shapes, thickness, height datum, load interfaces, enclosure edges | Walk support, structural boundary, inter-deck separation, pressure boundary where rated |
| Internal partitions/openings | Wall segments, junctions, doors, windows, bulkheads and airlocks | Collision, seal/leak state, access and topology changes |
| Room labels | Names, colors and organizational tags on areas | Convenience only; never pressure, ownership or power authority |
| Exterior armor | Faction-shaped plates attached outside structural envelope | Independent armor protection/damage, silhouette, exposed surface; no automatic pressure seal |
| Exterior decorations | Fins, trim, decals and purely aesthetic parts | Appearance; no invented armor/thrust/stat grant |
| External mounted systems | Engines, thrusters, sensors/scanners, turret bases, tractor beams, missile pods | Validated mount and clearance, functional definition and required service ports |
| Internal fittings/cargo grids | Furniture, appliances, life support and cargo-only placement zones | Collision, interactions, storage, support/load and reservations |
| Systems routes | Power/data/fuel/coolant/ventilation nodes, ports and3D runs | Actual bounded connectivity/supply and failure; crossings alone do not connect |
| Roof/ceiling panels | Same nominal polygon family as floors, enclosing tops and deck undersides | Roof visible in exterior/top-down view; real structural/pressure boundary independent of cutaway |

The floor union establishes the structural footprint. Generated boundary walls, corners and deck slabs enclose it; partitions meet those boundaries with validated seals. Roof polygons follow the footprint, including triangular/trapezoidal edges and declared penetrations. Exterior armor adds shape beyond that core. A presentation cutaway never opens the pressure hull or removes collision.

Curved shapes are a future catalog extension with explicit nominal edges/tessellation tolerance and collision/pressure interfaces. Do not approximate them invisibly with incompatible polygon seals. The initial complete Wayfarer can use the existing polygon family.

## Multiple floors must work in gameplay

A deck has a stable ID, structural datum, walking surface elevation, clear room height, slab/ceiling thickness and valid transition points. Clear cargo height excludes slab thickness, beams, fixtures and reserved service volume. Do not confuse floor-to-floor spacing with clear height. The current draft default ceiling96 lattice units is3m; that is a starting draft value, not certification that every existing asset fits.

Characters and objects retain ship-local planar coordinates **plus authoritative deck identity**. Validated stair, ladder or lift transitions change deck through a controlled traversal state with occupancy, collision, permission and interruption rules. Initial movement can remain planar within each deck; this does not require six-degree-of-freedom ship flight. Renderer elevation derives from the authoritative deck/traversal state. Neither camera orbit nor clicking a deck tab may teleport a character.

**Owner stairs/elevators addition — 2026-09-09:** larger ships and stations require both ordinary walkable stairs and functional elevators. The ladder is the first bounded proof, not the final traversal vocabulary. The next concrete slice is one native dogleg stair with supported treads, a real intermediate landing, actual slab openings and measured headroom. Existing planar walking intent must enter, stop, reverse and exit it through server-derived support/elevation; a renamed automatic ladder ride or click teleport does not satisfy stairs. Elevator native/platform/shaft/landing-door design proceeds with its utility and cargo dependencies: multiple passengers and cargo, persistent platform attachments, calls/queue, door interlocks, continuous obstruction checks, accounted power and defined brake/loss/recovery behavior. An unpowered geometry review is not an operating elevator. See [stairs/elevators interfaces and acceptance](handoffs/construction_stairs_elevators.md).

Vertical shafts and open stairs connect gas volumes unless enclosed. Sealed hatches and lift/airlock doors control those connections. The view shows the occupied deck/cutaway and external roofs appropriately; off-camera decks keep their simulation state.

## Pressure and airlocks

Pressure compartments are computed from structural enclosures and effective seals, independently of named rooms. Closed sealed walls/windows/floors/roofs block gas. Openings, open doors, vents, unsealed cable penetrations and structural breaches create flow edges. Exterior space is a vacuum boundary, not a room label.

Use a bounded server-side finite-volume gas model: compartment volume in m³; gas amount/species in moles or consistently documented mass units; temperature in kelvin; pressure in pascals. Define a conservative transfer solver with bounded timestep/substeps, nonnegative quantities and tested flow conductance. Keep pressure change gradual according to opening/volume rather than instantly equalizing arbitrary rooms. A fixed-temperature first solver is acceptable if explicitly modeled; thermal simulation is separate. Topology splits/merges must conserve contained gas, not duplicate full pressure into every new region.

Atmosphere supply, vents, pumps, leaks and oxygen availability act through validated systems. A closed door can have a specified leakage rate; damage changes seal state. Breaking an exterior armor plate alone does not decompress a still-intact structural shell. Breaching the pressure shell creates exposure even if a decorative panel remains visible.

An external airlock is a real bounded chamber with an inner and outer pressure door, pump/vent path, power state and interlock. Opening requires the configured pressure differential and clearance checks. Normal cycling prevents both doors opening together. Power loss, obstruction, breach, manual emergency actions and overrides need explicit validated outcomes. Emergency override may intentionally cause gas loss; it cannot bypass authority or silently preserve air.

The first Wayfarer template includes a designated external airlock entrance and an internal path to it. Disembark/reentry needs a supported exterior movement/transfer mode with server frame mapping; initial planar EVA can be bounded without inventing full3D flight. Do not present an opening animation as completed ship entry/exit.

## Cargo grids and mixed-size stacking

A cargo grid defines allowed container interfaces, deck/base elevation, footprint polygon, overhead clearance, access/handling reservations and approved support/load limits. It accepts cargo containers only; fitting arbitrary furniture inside that area must reject. Grid occupancy is **3D**, separate from each container's internal inventory grid and from fluid capacity.

Nominal containers must be compatible with a common horizontal submodule (at least1×1 and2×2m footprints) and authored vertical tiers derived from deck clear height. Smaller sizes may use explicit subdivisions. Real geometry fits inside the nominal envelope with handling gaps; decorations/latches cannot intrude into neighboring placements or lid/door sweeps. Reusable assets specify bottom/top bearing patches, allowed orientation, stacking clearance, loaded mass/load rating and tie-down/lock points. Existing visual labels are not approved numeric ratings.

Support validation uses the **union of actual coplanar bearing/contact patches**, not just the largest lower bounding box or sum of unrelated areas. It must accept the owner's example when rated: one2×2 container supports four1×1 containers, and their combined top interfaces support another2×2 container. It must reject a missing corner, uneven tier heights, forbidden bridging, insufficient contact, overload, blocked doors and roof intersection. Any permitted cantilever/bridge needs an explicit interface rule.

The support graph is acyclic and ultimately reaches an approved deck/rack. Propagate payload and container mass through it; moving/removing a supporting container revalidates dependent loads atomically. Cargo remains restrained under ship motion. Stacking identity and contents persist; changing a paint variant does not create a second inventory. Liquid containers can have physical stacking interfaces if rated but remain separate from item-grid storage.

Stage revised native cargo variants with preserved originals, exact references and nominal-interface evidence. Adjust model/source/frame interfaces explicitly rather than applying arbitrary runtime scale to the approved collection.

## Systems routing is spatial and functional

Routes use ship-local3D coordinates, explicit endpoint/junction IDs, medium/type, direction, capacity and compartment/deck membership. Floor service channels, wall runs, risers and ceiling runs are distinct supported paths. Lines that merely cross in3D do not join. Cross-deck risers consume shaft/wall clearance; a cable passing through a pressure wall needs a rated sealed penetration/gland, or it creates a leak.

Functional definitions declare required power/fuel/coolant/data/ventilation ports and operating thresholds. Engines cannot produce normal thrust with a missing required fuel/power path; coolers/pumps/airlocks react to supply loss. Data does not substitute for power, and fuel/fluid mediums cannot connect through an incompatible port. Establish deterministic priority/allocation, isolation valves/breakers and bounded network evaluation with conserved quantities. Do not simulate each wire as its own light or scene object.

External components use the same service graph through structural feedthroughs. Mounts also validate load direction, hull clearance, exhaust corridors, turret sweep/muzzle paths, sensor field and access. These interfaces enable the named component families; specialized combat/tractor behavior still needs its own implemented functional definition.

## Armor and damage

### Owner damage-scope refinement — 2026-09-09

Use two explicit damage representations. **Voxel damage** applies to internal/external structural walls, structural floors/roofs, hull/armor and external mounted components. Floors/roofs remain structural hull elements because localized breaches affect deck support and enclosure. External component adapters must declare their damage volume and how surviving cells affect component health/function; do not infer operational capability merely from remaining voxel count.

**Entity health** applies to interior fittings and containers: crates/cargo pods, beds, chairs/couches, hydroponics, reactors and other internal equipment. They do not require voxel deformation. Later authored damaged/destroyed variants can reflect health state. Explicit per-definition damage representation takes precedence over location: putting a crate outside does not make it voxel-destructible, and a reactor retains its entity-health behavior. Unresolved definitions must be classified before publication, never silently assigned a voxel volume.

Both representations use authoritative hit validation and persistent per-instance state. Health failure can disable services, leak approved stored fluids or trigger explicitly defined hazards without mesh deformation. A destroyed container must follow an explicit contents/recovery rule; do not delete or duplicate its inventory as a rendering side effect. Changing to a damage variant preserves the same entity, inventory and fitting IDs. Destruction/repair updates collision or support only according to the definition's validated state rules. Gameplay consequences and numeric ratings require their own definitions; reactor explosions are not implied by this scope decision.

The localized voxel acceptance requirements below apply to voxel-damage assets only. They do not require all 73 cargo assets or interior furniture to receive damage volumes. Add health-damage acceptance for an interior fixture and loaded container, including functional failure, contents preservation/disposition, reconnect and separate spawned-instance state.

**Owner reconfirmation: voxel destructibility is required, 2026-09-09.** The Blender/tileset migration must retain localized material-cell destruction; whole-part health or disappearing an entire tile is not a substitute. Preserve the rules and persistence contract in [voxel construction and destruction](voxel_construction.md). Existing voxel removal/meshing primitives are implemented, but live authoritative destruction and its native-mesh damage adapter still need integration and validation.

Each destructible structural/armor asset needs a versioned material/occupancy damage volume, resolution and local transform aligned with its nominal interfaces and native visual surfaces. Construction modules, snapping lattice and damage-cell resolution are separate. Immutable volumes can be shared; sparse revisioned damage overrides belong to the spawned instance/part. Never mutate the template or another instance when damaging a ship.

Server-validated impacts remove/damage bounded cells through installed armor and structural layers. The committed result must update collision/passability, pressure breaches, support and affected service paths consistently. Renderer damage adapters must expose matching holes and cut interiors while preserving unaffected native surfaces/materials; a collision hole hidden by an intact GLB fails acceptance. Choose and validate the localized clipping/rebuild representation before accepting native assets as destruction-ready. Batch/instance optimizations must retain part/chunk provenance and support selective invalidation.

Acceptance includes a localized shot through a native armor/wall assembly, an actual visible and collidable breach, consequent air loss/service interruption where intersected, repair, synchronized authorized clients, reconnect/process restart and isolation between two ships spawned from one template. Bound dirty-chunk rebuilds and debris; damage cells are not individual scene objects. This is required for the completed construction milestone, even when earlier publication/spawn slices precede damage integration.

Structural pressure panels and outer armor have separate IDs, material definitions, coverage and authoritative damage state. Resolve impact/protection through actual installed layer order and material rules; decorative fins/decals are not automatically rated armor. Penetration can stop in armor, continue into structure, and ultimately open a breach. A source-approved visual asset does not itself approve protection values.

Keep damage/collision representations separate from preserved native surfaces. Runtime damaged visuals need explicit adapters and debris/repair rules; do not replace all native art with old voxel solids as a shortcut. Breach, service damage and compartment response must agree with the authoritative result and survive reconnect.

## Wayfarer conversion and templates

1. Pin the current262-placement assembly, every consumed native revision and live UUID associations. Produce a per-placement classification: structural floor/roof/pressure wall, armor, decoration, functional fitting, cargo or unresolved. Preserve original drafts/source bytes.
2. Reconstruct the exact structural floor topology, enclosing boundary and roof polygons. Infer nothing functional merely from GLB bounds. Add explicit authored mappings/nominal interfaces and resolve current bow/floor joins, doorway clearance and roof ownership.
3. Recreate partitions, doors and pressure compartments from actual wall geometry. Room labels describe those areas but do not define seals. Plan a usable external airlock and validated deck transitions. Keep the existing layout recognizable; extra floors need purposeful authored space, not invented duplicate rooms just to demonstrate a feature.
4. Bind existing native armor/equipment to validated mounts, dimensions and functional definitions. Mark missing interface models for a narrow Blender revision. Preserve the approved clean/worn materials during construction work; broad finish iteration is paused.
5. Establish cargo grids, standardized stack interfaces and complete required3D service routes. Validate load paths, pressure enclosure, clearance, reachability and systems readiness before publication.
6. Save the complete semantic Wayfarer document as a versioned Shipyard template. Publication pins source/compiler/asset dependencies. Instantiation creates a **new ship, fitting/container/item UUID set every time**, using template-local IDs only for mappings. Template containers are empty unless an explicit approved loadout specifies new contents; never copy a live player's resources or balances.
7. Spawn two independent instances. Moving cargo, damage, opening doors, toggling equipment or editing one must not alter the other or the blueprint. Reload/restart must retain each instance's state. Converting an existing live Wayfarer is a separate atomic migration preserving its current inventory/crew/fitting IDs and state; do not treat it as a fresh template spawn.

## Implementation order and completion gates

Authentication/identity and character/rig integration are prerequisites. Design/audit can proceed while those finish. Implementation ownership remains with the coordinating integration agent; shared renderer/world/net/App entrypoints stay explicitly assigned. The former planet agent has been told to stop and preserve its drafts.

A. Lock structural/nominal interfaces, deck/traversal schema and asset compatibility report. Establish server-owned blueprint/instance references, private grants and revision/operation receipts.

B. Connect Shipyard save/publish/instantiate to the actual game using the compiled authored topology and native assets. First single-deck proof is intermediate, not completion. Remove dependency on Wayfarer-global collision/fixture constants for authored instances.

C. Add playable deck transitions and matching roof/slab structure: first the exact ladder proof, then ordinary authoritative stair walking. Define actual elevator platforms/shafts/landing doors and interlocks here; powered multi-passenger/cargo operation depends on D. Add functional doors, pressure solver and external airlock. Test pressure isolation and actual egress/reentry. A stair/lift fixture does not inherit an enclosure qualification.

D. Add cargo-only grids, supported mixed-size stacks, ceiling/load checks and state-preserving handling. Add3D utility routes/penetrations and functional supply checks. Complete elevators using actual passenger/cargo support, conserved drive/door power, persistent calls/attachments, interlocks and tested power-loss/brake/recovery outcomes. Retain localized voxel destruction for structural stairs, shafts, floors/roofs and explicitly classified lift structure; internal drive/control fixtures use their authored damage representation.

E. Add validated armor/penetration-to-breach behavior and required external-system mount interfaces. Rebuild and publish the complete Wayfarer template through the same Shipyard path, not a separate hardcoded exporter.

F. Prove two independent template spawns and persistence, then perform any separately requested no-loss existing-ship conversion. Save actual dashboard/game evidence and exact source/revision hashes.

Required tests include wrong-account/grant rejection, stale/concurrent edits and exact retry, invalid geometry, deck transition denial/interruption, pressure gas conservation/split/merge/breach, airlock interlocks/failure, stack union support/overload/removal, ceiling/lid access, disconnected service effects, sealed versus unsealed risers, armor protection versus structural breach, inventory isolation and actual process restart. Browser review must use the real published template/instance, not a preview substitute. Run full checks/build/art validation and isolated authority smoke; normal DB migrations remain non-destructive and coordinated.

The system is complete for this milestone only when the authored Wayfarer template is genuinely playable and reproducibly spawnable with these supported construction behaviors. Editor labels, nominal dimensions, diagrams and passing static asset checks alone do not establish that outcome.
