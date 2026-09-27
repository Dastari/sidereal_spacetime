# Art reference translation and reusable component kit

Status: Active direction; original source and voxel kit studies available
Last updated: 2026-09-08
Owners: Sidereal art and assembly

**Current authoring direction:** reconstruct replacement models in Blender, with authored meshes and materials. The owner is phasing out TypeScript voxel-solid model generators. Studless construction remains the visual language; it does not mandate voxel-meshed visual exports. Follow [Blender model migration](blender_asset_migration.md). Sampling descriptions below document existing studies and any separate gameplay representation.

## Reference priorities

The owner-supplied images in `reference/art` are visual references, not runtime assets or permission to distribute third-party artwork. They favor richly inhabited cutaway rooms, pale metal construction, indigo machinery cavities, burgundy access plates, cyan emitters, copper conduit and chunky crew. The exploded ship reference makes modularity explicit: roof, walls, engines, rooms, corridors and objects remain independently authored pieces. Source filenames are labels only; examine the actual image before using it as a design brief.

The latest owner clarification is decisive: **LEGO-like, studless construction bricks**. Visible brick courses and interlocking forms should carry the look. Tops are smooth; there are no studs. Metal, glass, translucent and emissive bricks belong to one material-bearing construction system. See the [theme](visual_theme.md) and [voxel contract](voxel_construction.md) for current optical support and the remaining glass pass.

## Translate detail into reusable geometry

- Hull and bulkhead: continuous pressure core, shallow brick relief, dark recessed frame, raised enamel plates, replaceable access panels, fasteners, vents and conduit. A decorative seam must not create an accidental pressure leak.
- Joins: matching two-meter interfaces, continuous brick-course height and metal finish, corners with one owner, no doubled coplanar faces. Different module widths use the same alignment datum.
- Doors/airlocks: frame, leaves, seals, indicator bricks and interaction component have distinct roles. Blender leaves remain named source solids. The current closed art study has no operational animation, interaction or atmosphere logic.
- Cargo/furniture: preserve each crate, tank, bed, couch and console as one independently placed object. Small visual details may batch inside that object; they do not merge its gameplay identity with the room.
- Engines: real pressure vessels, stepped bells, luminous throat, piping, mounts and service shrouds. Nozzle direction, mount sockets and supplied thrust stats belong to the installation definition.

The new pressure bulkhead/airlock sources are sampled at 64 cells per two-meter tile. The Wayfarer uses 32. Visible bricks contain multiple fine cells; destruction can cut a brick rather than remove only entire construction tiles. Exposed faces remesh from occupied material data.

## Review without overstating completion

Review a single part close up, two joined copies, a corner/door transition, the whole ship overhead, then the same ship in cutaway. Check bright metal against the neutral light rig and confirm emissive details remain readable without bloom. The current source kit demonstrates these material and solid-voxel foundations; it is not a complete production faction library or a reference-quality finished ship. Glass, corner families, animated doors, rigged crew, functional fitting rules and live persistent damage retain their separate acceptance gates.
