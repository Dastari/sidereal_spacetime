# Astra Implementation Design Specification
## Modular Voxel/Plastic Space Game Art, Asset, Rendering, UI, and Blender→Babylon.js Pipeline

**Status:** Authoritative project reference  
**Audience:** Astra coding/art agent, gameplay/rendering engineers, technical artists, content-generation scripts  
**Primary tools:** Blender on Linux, Blender Python (`bpy`), Babylon.js, TypeScript/Vite, GLB/glTF  
**Target visual:** Tiny-voxel/block-built sci-fi rendered as premium injection-moulded miniature plastic: small bevels, clean PBR highlights, deep contact shadows, emissive technology, restrained wear, strong colour discipline, readable silhouettes, modular ship construction.

---

# 0. How the Astra agent must use this document

This document is the art and rendering contract for the project.

When generating, modifying, exporting, importing, or rendering any asset, the Astra agent should:

1. Read the relevant section before creating the asset.
2. Prefer the established dimensions, naming, materials, socket conventions, and performance budgets over ad-hoc decisions.
3. Treat **visual micro-voxels**, **construction tiles**, and **gameplay modules** as separate layers.
4. Never solve visual detail by spawning thousands of independent runtime cube meshes.
5. Generate assets in Blender, validate them, export GLB, then verify them in Babylon.js.
6. Reuse master materials and modular geometry aggressively.
7. Keep the style readable at both the close angled interior/RPG camera and the zoomed-out top-down space-ARPG camera.
8. Build and validate a small vertical slice before bulk-generating the asset library.
9. Prefer deterministic Blender scripts for repeated or generated content.
10. Do not introduce a new art rule, scale rule, material family, or socket convention unless the existing system cannot support the requirement.

If there is disagreement between an old asset and this document, bring the old asset into compliance unless there is a specific gameplay reason not to.

---

# 1. Core visual goal

The project should not look like raw Minecraft cubes, flat low-poly primitives, or realistic hard-surface sci-fi.

The target is:

> **Tiny modular voxel geometry rendered like premium injection-moulded sci-fi miniatures: softly bevelled ABS-like plastic, selected metal parts, restrained surface imperfection, strong PBR edge highlights, deep ambient/contact shadowing, glowing emissive technology, and modular construction that remains readable from a top-down camera.**

The visual language should combine:

- block-built/voxel geometry;
- premium toy/model-kit material response;
- clean sci-fi panel construction;
- high readability;
- deliberately limited palettes;
- small emissive colour accents;
- physically plausible light direction;
- exaggerated but controlled combat VFX.

The game should feel as though every ship, room, machine, character, crate, asteroid station, and weapon belongs to the same miniature construction system.

---

# 2. What is wrong with the current blockout and what must change

The current ship blockout is structurally useful and should **not** be discarded.

It already has:

- readable rooms;
- modular wall/floor construction;
- useful colour blocking;
- coherent ship proportions;
- obvious corridor spaces;
- exterior hull mass;
- a good basis for snapping and procedural assembly.

The visual gap is mostly caused by:

- mathematically sharp edges;
- large uninterrupted flat faces;
- too little secondary geometry;
- flat-colour materials;
- insufficient roughness/specular variation;
- cyan elements reading as coloured plastic instead of luminous technology;
- weak contact shadows;
- insufficient distinction between plastic, metal, glass, rubber, fabric, and emissive surfaces;
- too little micro-structure on hull and interior surfaces;
- not enough intentional seams, recesses, frames, caps, vents, and utility channels.

The migration strategy is therefore:

**Keep the large forms. Replace the surface language.**

Do not remodel the whole game at once.

Start with one representative room/corridor slice and one exterior hull section. Bring those to target quality, reproduce the same result in Babylon.js, then propagate the rules.

---

# 3. The three-layer construction architecture

This is the most important architectural rule in the project.

## 3.1 Layer A — visual micro-voxel grid

Purpose: art only.

Recommended visual unit:

```text
MICRO_VOXEL = 0.125 m
```

This gives 8 micro-voxels per metre.

It provides a strong enough voxel feel without forcing gameplay to reason about tiny cubes.

Typical uses:

- panel ribs;
- vents;
- light strips;
- tiny hull protrusions;
- cable trays;
- structural braces;
- crate details;
- small character details;
- turret housings;
- engine rings;
- asteroid facets.

Micro-voxels are **not** individually simulated by default.

They are merged into meaningful meshes.

## 3.2 Layer B — construction grid

Purpose: ship building and placement.

Recommended construction unit:

```text
CONSTRUCTION_TILE = 1.0 m
```

A wall, floor, door, console, hull section, or machine advertises occupancy in whole or half construction units.

A standard wall section might occupy:

```text
1 m wide × 0.125–0.25 m deep × 1 m high
```

A room module could be:

```text
3 × 4 × 3 construction cells
```

The player modifies the ship on this layer.

## 3.3 Layer C — gameplay module

Purpose: simulation.

Examples:

- Reactor MK II
- Crew Cabin
- Cargo Hold
- Medical Bay
- Shield Generator
- Medium Engine
- Point-Defense Turret
- Missile Rack
- Tractor Beam
- Sensor Array

Gameplay knows:

- footprint;
- health;
- mass;
- power consumption/generation;
- heat;
- crew requirements;
- atmosphere;
- storage;
- weapon statistics;
- connectivity;
- damage state.

Gameplay does **not** care how many micro-voxels make up the mesh.

## 3.4 Hard rule

Never equate:

```text
visual voxel == runtime entity
```

unless the object explicitly requires per-voxel simulation.

A 1 m wall might visually contain hundreds of tiny block surfaces and still be one renderable mesh plus one gameplay tile.

---

# 4. Coordinate system and scene scale

Use a single convention throughout Blender, metadata, and game code.

## 4.1 Blender authoring convention

Use:

```text
+X = starboard/right
+Y = forward
+Z = up
```

Use metric units.

```text
1 Blender unit = 1 metre
```

Recommended scene settings:

- Unit System: Metric
- Unit Scale: 1.0
- Length: Metres

## 4.2 Babylon.js convention

Prefer:

```ts
scene.useRightHandedSystem = true;
```

when the project is built around glTF/GLB assets.

This reduces mental translation between DCC-authored glTF assets and Babylon.

Do not manually rotate every imported asset to “fix” coordinate systems. Fix the pipeline once.

## 4.3 Origins

Every reusable asset must have a meaningful origin.

Examples:

- floor tile: lower centre or lower grid corner, project-standard choice;
- wall tile: bottom-centre on the construction plane;
- door: bottom-centre of frame;
- engine: module connection plane;
- weapon: hardpoint mount centre;
- character weapon: grip/socket reference;
- crate: bottom-centre;
- asteroid: centre of mass.

Pick one convention per category and never vary it casually.

---

# 5. Blender on Linux: production workflow

Blender is the source-of-truth asset authoring environment.

The project should support both:

- interactive Blender work;
- deterministic headless Blender generation/validation/export.

## 5.1 Pin Blender version

Do not let local machines, CI, and Astra use arbitrary Blender versions.

Pin a specific stable Blender release/minor version in project documentation and CI.

Example project convention:

```text
Blender: 4.x.y
```

Update intentionally, not automatically.

## 5.2 Recommended project structure

```text
/assets
  /blender
    /source
      /core_tiles
      /interiors
      /ship_systems
      /characters
      /weapons
      /cargo
      /asteroids
      /factions
      /vfx_meshes
    /scripts
      build_material_library.py
      validate_asset.py
      export_asset.py
      generate_*.py
    /templates
      asset_template.blend
      material_library.blend
  /glb
    /core_tiles
    /ships
    /characters
    /props
    /weapons
    /space
  /textures
    /shared
    /decals
    /damage
    /ui
```

## 5.3 Headless generation

Generated assets should be reproducible with commands similar to:

```bash
blender \
  --background \
  --factory-startup \
  --python assets/blender/scripts/generate_asset.py \
  -- \
  --asset hf_wall_straight_a \
  --output assets/blender/source/core_tiles/hf_wall_straight_a.blend
```

Validation:

```bash
blender \
  --background \
  assets/blender/source/core_tiles/hf_wall_straight_a.blend \
  --python assets/blender/scripts/validate_asset.py
```

Export:

```bash
blender \
  --background \
  assets/blender/source/core_tiles/hf_wall_straight_a.blend \
  --python assets/blender/scripts/export_asset.py \
  -- \
  --output assets/glb/core_tiles/hf_wall_straight_a.glb
```

The Astra agent should prefer scripts for:

- bulk generation;
- palettes;
- material assignment;
- grid snapping;
- socket placement;
- repeated greebles;
- validation;
- export.

Do not generate final meshes by manipulating the `.blend` binary directly.

---

# 6. Geometry language

## 6.1 Silhouette first

Every object must read at the intended gameplay camera distance.

Before detail, confirm:

- ship faction;
- front/back orientation;
- function;
- danger level;
- size class.

If a turret, crate, engine, and sensor all become similar grey rectangles at top-down scale, the silhouettes are wrong.

## 6.2 Three geometric detail scales

### Level 1 — silhouette

- hull outline;
- engine mass;
- room shape;
- major wing;
- large turret;
- bridge;
- cargo pod.

### Level 2 — construction language

- armour plates;
- wall frames;
- structural ribs;
- recessed panels;
- window frames;
- door casings;
- machine housings;
- engine rings;
- roof caps.

### Level 3 — greebles

- tiny vents;
- warning lights;
- conduit clips;
- cable covers;
- micro panels;
- handles;
- sensor nubs;
- antennas;
- status indicators.

A production asset should not rely on Level 3 to compensate for a weak Level 1 silhouette.

---

# 7. Bevel rule — critical to the art style

Mathematically sharp edges are not acceptable on normal visible plastic/metal parts.

The material only looks premium if geometry gives lighting a highlight to catch.

For a 1 m-scale piece, start around:

```text
bevel width: 0.02–0.04 m
segments:    2
profile:     ~0.5
```

For tiny pieces:

```text
bevel width ≈ 2–5% of the smallest visible dimension
```

Do not over-round.

Target:

- flat major faces;
- tiny softened edges;
- readable specular highlight.

Avoid:

- balloon-like rounded cubes;
- high segment counts;
- bevels larger than the design detail.

## 7.1 Blender modifier stack

Typical hard-surface piece:

1. model at final scale;
2. apply scale;
3. bevel modifier;
4. smooth shading/smooth-by-angle;
5. optional weighted normal strategy if required for the pinned Blender version.

Always visually inspect the result.

---

# 8. Seams, gaps, recesses, and layered surfaces

Large uninterrupted flat faces make the current model feel unfinished.

The target style needs purposeful layering.

## 8.1 Panel separation

Adjacent armour panels should often have a tiny dark seam.

Conceptually:

```text
panel | seam | panel | seam | panel
```

Use either:

- actual small geometry gap;
- recessed strip;
- dark inlay geometry.

Do not depend solely on a texture line when the seam is important to form.

## 8.2 Raised armour

Secondary panels may sit slightly proud of the base hull:

```text
      armour plate
    ┌────────────┐
────┘            └──── base hull
```

Small offsets create natural contact shadows.

## 8.3 Recessed panels

Walls should frequently use:

- outer frame;
- inset central panel;
- top light/service strip;
- lower utility channel.

A good 1 m wall tile might only need 10–20 meaningful geometry pieces.

## 8.4 Visible dark structure

Use dark internal structural elements between lighter panels.

This makes the object feel assembled rather than carved from one block.

---

# 9. Material strategy

The target is **stylised PBR**, not toon shading.

Most ship surfaces should look like moulded or painted plastic. Mechanical internals use selected metals.

## 9.1 Master material families

Create a shared library such as:

```text
MAT_Plastic_Light
MAT_Plastic_Mid
MAT_Plastic_Dark
MAT_Plastic_Red
MAT_Plastic_Orange
MAT_Plastic_Blue
MAT_Plastic_Green
MAT_Plastic_Purple

MAT_Metal_Dark
MAT_Metal_Bare
MAT_Metal_Heat

MAT_Rubber
MAT_Fabric
MAT_Glass

MAT_Emissive_Cyan
MAT_Emissive_Blue
MAT_Emissive_Orange
MAT_Emissive_Red
MAT_Emissive_Green
MAT_Emissive_Purple
```

Avoid hundreds of bespoke materials.

## 9.2 Base plastic starting values

Blender Principled BSDF starting point:

```text
Metallic        0.00
Roughness       0.30
IOR             1.46
Coat Weight     0.08
Coat Roughness  0.20
```

These are starting values, not immutable laws.

Suggested roughness ranges:

```text
light hull plastic       0.28–0.36
dark structural polymer  0.34–0.42
painted accent plates    0.22–0.32
rubber                   0.55–0.75
fabric                   0.65–0.90
bare metal               0.18–0.38
```

## 9.3 Surface imperfection

Perfectly uniform roughness looks synthetic in the wrong way.

Use extremely subtle roughness variation.

The effect should mostly break reflections, not become obvious visible dirt.

Example:

```text
roughness base 0.30
local variation approximately ±0.03
```

Small bump/noise may be used at low strength.

If the noise pattern is clearly visible from normal gameplay camera distance, reduce it.

## 9.4 Edge wear

Wear is faction- and age-specific.

### Human Federation
- very clean;
- light polishing;
- rare scratches;
- minimal grime.

### Industrial/mining
- dust;
- edge scuffs;
- heat staining;
- functional grime.

### Pirates/raiders
- mismatched panels;
- scraped paint;
- rust-like staining where stylistically appropriate;
- repairs;
- burn marks;
- exposed conduits.

### Alien/high technology
- minimal conventional wear;
- iridescent, crystalline, or bio-organic variation;
- luminous seams.

Do not use one universal grime shader on every faction.

---

# 10. Blender procedural materials vs exported game materials

Use procedural materials for Blender look-development if useful.

Do **not** assume complex Blender node networks will survive GLB exactly.

The production export should resolve primarily to standard PBR concepts:

- base colour;
- metallic;
- roughness;
- normal;
- ambient occlusion;
- emissive;
- alpha/transmission where supported and required.

If a procedural effect matters in game:

1. bake it into reusable maps; or
2. recreate it intentionally in Babylon.js.

Keep critical visual identity out of unsupported Blender-only nodes.

---

# 11. Texture strategy

The style should be geometry-led.

Do not paint panel lines that should really be geometry.

Use textures mainly for:

- subtle shared roughness;
- subtle normal noise;
- AO where useful;
- decals;
- faction insignia;
- hazard marks;
- warning labels;
- tiny screens;
- damage/burn masks;
- selected character face details.

## 11.1 Prefer shared atlases

Use shared material/trim atlases where practical.

Benefits:

- fewer materials;
- fewer textures;
- stronger art consistency;
- better batching.

## 11.2 Avoid unique 4K textures on small props

A 0.5 m crate should not need a unique 4K texture.

Use:

- shared material atlas;
- decals;
- vertex colour or material variants;
- small unique masks only when necessary.

---

# 12. Emissive technology

Cyan, blue, red, orange, green, and purple accents should often be true emissive surfaces.

Examples:

- door strips;
- engine cores;
- reactor windows;
- console screens;
- shield emitters;
- beacons;
- weapon charging elements;
- warning lights;
- alien crystals.

The geometry should render bright, while real lights can be placed selectively to create actual illumination.

## 12.1 Important distinction

The emissive texture/material creates the visual source.

A point/spot/area light creates the environmental illumination.

Do not rely on emissive shading alone to illuminate the scene unless the chosen renderer feature explicitly supports that workflow.

## 12.2 Bloom

Bloom should be controlled.

Target:

```text
bright source + small halo
```

Avoid:

```text
large washed-out neon fog around every light
```

---

# 13. Lighting philosophy

This art style depends heavily on lighting.

## 13.1 Exterior space lighting

Use:

- one readable key/sun direction;
- environment/IBL fill;
- restrained nebula tint;
- emissive ship lights;
- selective local lights.

The ship must have a clear light side and shadow side.

## 13.2 Important: visible sky and lighting environment are separate concepts

A beautiful dark starfield is not necessarily a good PBR lighting environment.

Use:

- visible skybox/skydome: nebulae, stars, planets;
- environment reflection/IBL: controlled HDR-style lighting.

This provides visible specular structure even in space.

## 13.3 Interior lighting

Rooms can cheat.

Examples:

- reactor has a blue point light inside even if its mesh is emissive;
- medical bay has soft neutral light plus cool screens;
- corridor has repeated ceiling/strip lights;
- emergency mode reduces ambient light and enables red warning flashes;
- hydroponics uses green-biased local lighting, but do not saturate the entire room.

---

# 14. Babylon.js rendering baseline

Use Babylon.js as the real-time renderer and gameplay presentation layer.

Prefer WebGPU when available, with project-supported fallback if required.

## 14.1 Scene setup principles

- use right-handed system for glTF consistency;
- load GLB/AssetContainer;
- use PBR materials;
- assign environment texture;
- enable appropriate anti-aliasing;
- enable modest bloom;
- enable AO/contact shading where performance allows;
- use shadows selectively;
- keep exposure/tone mapping consistent.

Conceptual setup:

```ts
scene.useRightHandedSystem = true;

// Environment texture / IBL
scene.environmentTexture = environmentTexture;
scene.environmentIntensity = 0.7;

// Directional/key lighting
const sun = new DirectionalLight("sun", sunDirection, scene);

// Post-processing
// Enable modest bloom, tone mapping, AA, etc.
// Pin actual values after visual calibration.
```

Do not copy arbitrary post-processing values from prototypes into production without testing at both camera modes.

---

# 15. Babylon material policy

The normal runtime surface should use standard PBR unless a special effect demands otherwise.

Use PBR for:

- hull plastic;
- structural plastic;
- metals;
- glass;
- rubber;
- fabric;
- most props.

Use custom/node/shader materials only for:

- shield fields;
- tractor beams;
- holograms;
- animated force fields;
- scan pulses;
- special alien materials;
- special damage effects.

Do not make the entire art style dependent on a custom shader.

---

# 16. Ambient occlusion and contact shading

AO/contact shadows are extremely important.

They visually separate:

- panel from hull;
- floor tile from neighbour;
- pipe from wall;
- armour plate from frame;
- crate from cargo deck;
- character boot from floor.

Use AO aggressively enough to reveal construction, but not enough to make the whole game dirty.

The target is depth and contact, not black creases everywhere.

---

# 17. Asset naming conventions

Use predictable lowercase IDs.

Examples:

```text
hf_wall_straight_a
hf_wall_corner_inner_a
hf_floor_panel_a
hf_door_standard_a
hf_console_engineering_a

helix_engine_medium_a
helix_cargo_pod_large_a

riftjack_hull_spiked_a
riftjack_weapon_scrap_cannon_a

aurelian_wall_curve_a
aurelian_crystal_reactor_a
```

Recommended prefixes:

```text
hf_         Human Federation
helix_      Industrial/mining
riftjack_   Raider/pirate
aurelian_   Alien faction
generic_    Neutral/common
```

Recommended suffix roles:

```text
_a, _b, _c        visual variants
_dmg1             damaged
_dmg2             critical
_destroyed        destroyed state
_lod0
_lod1
_lod2
```

---

# 18. Blender collection convention

A reusable asset `.blend` should contain a predictable hierarchy.

Example:

```text
ASSET_hf_engine_medium_a
  GEO
    hull
    casing
    internals
    emissive
  SOCKETS
    SOCK_FRONT
    SOCK_REAR
    SOCK_POWER
    SOCK_DATA
    FX_THRUSTER
    FX_DAMAGE_01
  COLLISION
    COL_MAIN
  LOD
    LOD0
    LOD1
    LOD2
```

Do not hide production-critical objects under arbitrary collection names.

---

# 19. Socket and hardpoint conventions

Use Blender empties for attachment points.

Naming examples:

```text
SOCK_NORTH
SOCK_SOUTH
SOCK_EAST
SOCK_WEST
SOCK_TOP
SOCK_BOTTOM

SOCK_POWER
SOCK_DATA
SOCK_AIR

HP_WEAPON_SMALL_01
HP_WEAPON_MEDIUM_01
HP_UTILITY_01
HP_DOCK_01

FX_ENGINE_01
FX_DAMAGE_01
FX_MUZZLE_01
FX_LIGHT_01
```

The Astra agent should preserve socket orientation and location exactly.

Babylon reads node transforms and attaches runtime objects to those transforms.

---

# 20. Gameplay metadata schema

Every gameplay-relevant exported asset should have metadata.

This can live in:

- adjacent JSON; or
- glTF extras/custom metadata, if project tooling supports it reliably.

Recommended JSON shape:

```json
{
  "assetId": "hf_engine_medium_a",
  "category": "ship_module",
  "faction": "human_federation",
  "grid": {
    "size": [3, 5, 3],
    "origin": [1.5, 0.0, 1.5]
  },
  "gameplay": {
    "mass": 12000,
    "health": 800,
    "powerGeneration": 0,
    "powerUse": 24,
    "heat": 45
  },
  "sockets": [
    { "name": "SOCK_FRONT", "type": "structural" },
    { "name": "SOCK_POWER", "type": "power" },
    { "name": "FX_ENGINE_01", "type": "fx" }
  ],
  "lod": [
    "hf_engine_medium_a_lod0.glb",
    "hf_engine_medium_a_lod1.glb",
    "hf_engine_medium_a_lod2.glb"
  ]
}
```

Do not infer gameplay properties from mesh dimensions at runtime if the asset can define them explicitly.

---

# 21. Core tile kit

The project should establish a canonical construction library before creating dozens of rooms.

Minimum core structural set:

```text
floor_standard
floor_reinforced
floor_grate
floor_glass
floor_hazard

wall_straight
wall_corner_inner
wall_corner_outer
wall_window
wall_service
wall_damaged

door_standard
door_security
door_airlock
door_bulkhead

ceiling_standard
roof_cap
roof_vent
roof_hatch

corridor_straight
corridor_corner
corridor_t
corridor_cross
corridor_end

hull_straight
hull_corner
hull_slope
hull_end
hull_reinforced
hull_damaged

utility_channel
pipe_straight
pipe_corner
pipe_t
cable_tray
vent
light_strip
```

Each faction can skin/replace these while maintaining compatible logical sockets where gameplay requires interoperability.

---

# 22. Room construction language

Rooms should be built from reusable components rather than one-off monoliths whenever possible.

Examples:

## Crew quarters
- wall kit;
- bunk;
- locker;
- table;
- personal screen;
- light;
- decor slot.

## Medical bay
- bed;
- diagnostic console;
- cabinet;
- IV/medical prop;
- lighting;
- wall medical marker.

## Engineering
- reactor/engine machine;
- maintenance console;
- conduit;
- cable tray;
- pipe manifold;
- warning lights.

## Hydroponics
- grow tray;
- grow light;
- water unit;
- wall console;
- plant variants.

A room may ship as a prebuilt module for convenience, but its pieces should use the same library.

---

# 23. Ship module system

Ship construction should operate on functional modules.

Examples:

```text
Bridge
Crew Quarters
Medbay
Cargo Hold
Reactor
Engine
Shield
Hydroponics
Science Lab
Airlock
Docking Module
Corridor
Weapon Mount
Tractor Beam
Sensor Array
```

Each module should define:

- grid footprint;
- connection faces;
- structural connection requirements;
- optional utility requirements;
- allowed hardpoints;
- atmosphere status;
- hit points;
- damage visuals;
- mass;
- gameplay function.

---

# 24. Damage-state strategy

Do not require arbitrary real-time fracture for ordinary ship damage.

Author controlled states.

Recommended:

```text
healthy
damaged
critical
destroyed
```

A damaged state may:

- hide panels;
- expose internal frame;
- reveal pipes;
- add darkened/burnt material;
- activate sparks;
- activate smoke;
- disable selected emissive lights.

A critical state may add:

- larger missing panels;
- fire;
- stronger smoke;
- intermittent arcs;
- warning emissive;
- loose debris.

Destroyed state may:

- swap to destroyed mesh;
- spawn detached debris;
- disable gameplay module;
- retain recognizable silhouette.

This is more art-directable and usually more performant than full per-voxel structural destruction.

---

# 25. Faction visual languages

## 25.1 Human Federation

Keywords:

- clean;
- modular;
- white/light-grey;
- navy/charcoal structure;
- red accents;
- cyan/blue technology;
- rounded micro-bevels;
- clinical but friendly.

Shapes:

- rectangular modules;
- chamfered corners;
- consistent repeating panels;
- glass cockpit/observation windows.

## 25.2 Helix Industrial/Mining

Keywords:

- heavy;
- practical;
- orange;
- charcoal;
- exposed machinery;
- hazard markings;
- large braces;
- replaceable pods.

Shapes:

- square engine blocks;
- cranes;
- drill arms;
- refinery modules;
- cargo cages.

Wear:

- medium/high.

## 25.3 Riftjack Raiders

Keywords:

- scavenged;
- aggressive;
- asymmetrical;
- red/black;
- spikes;
- exposed conduits;
- mismatched armour;
- improvised weapons.

Shapes:

- jagged armour;
- external frame;
- welded modules;
- oversized weapon housings.

Wear:

- high.

## 25.4 Aurelian/Alien

Keywords:

- curved modular arcs;
- purple/cyan;
- crystal technology;
- symmetry with organic variation;
- clean;
- luminous seams.

Shapes:

- crescents;
- rings;
- hex/curved connectors;
- crystal cores;
- bio-labs;
- energy wings.

Wear:

- minimal conventional grime.

---

# 26. Characters

Characters should share the same block-built material world.

Recommended height:

```text
~1.7–1.9 m gameplay height
```

Using a 0.125 m micro-grid yields roughly 14–15 visual micro-voxels in height, which is sufficient for a chunky stylised character.

## 26.1 Character modular parts

Use separate/swap-compatible components:

```text
Head/Hair
Helmet
Visor
Chest
Shoulders
Arms
Gloves
Belt
Legs
Boots
Backpack
Oxygen pack
Jetpack
Primary weapon
Secondary/tool
```

## 26.2 Rig sockets

Minimum:

```text
SOCK_HAND_R
SOCK_HAND_L
SOCK_BACK
SOCK_HEAD
SOCK_CHEST
SOCK_HIP
SOCK_TOOL
```

## 26.3 Weapons

Character weapons should remain visually simple and easy to swap.

Guideline:

- 1–2 micro-voxels thick for most weapon bodies;
- clear grip location;
- strong silhouette;
- shared material palette;
- separate muzzle FX socket.

Do not create a 200-piece gun if the player only sees it 30 pixels wide.

---

# 27. Character animation baseline

Recommended initial animation set:

```text
idle
walk
run
aim
shoot
reload
melee
pick_up
carry
interact
repair
use_console
throw
hurt
knocked_down
death
revive
wave
point
celebrate
sit
crouch
```

Direction requirements depend on camera system.

If full 3D skeletal animation is used, one animation can naturally render from any camera direction.

Keep motion readable and slightly exaggerated.

Do not over-animate tiny secondary details.

---

# 28. Cargo, resources, and tractor-beam objects

Cargo should use a standardized shape and socket language.

Categories:

```text
standard crate
reinforced crate
refrigerated pod
vacuum pod
salvage canister
cargo pallet
liquid tank
cryogenic tank
fuel drum
gas bundle
chemical drum
water container
ore chunk
metal ingot pallet
rare metal bars
crystal canister
medical cargo
data-core container
high-value tech crate
```

Each tractor-compatible object should define:

```text
mass
size class
tractor point
cargo category
stackability
hazard type
value
```

Use:

```text
FX_TRACTOR_TARGET
```

or equivalent locator if the beam should attach somewhere other than object origin.

---

# 29. Asteroids and space props

Asteroids should be authored as a limited base library with substantial variation via:

- scale;
- rotation;
- material tint;
- embedded resource crystals;
- damage;
- decals;
- resource node geometry.

Suggested families:

```text
rocky
iron-rich
copper-rich
crystal
ice
exotic
volcanic
derelict debris
```

Do not create thousands of unique asteroid meshes.

Use instancing/thin instancing for large fields.

Other space props:

- relay beacon;
- navigation buoy;
- communications relay;
- salvage pod;
- probe;
- drone;
- wreck fragment;
- docking marker;
- station frame;
- cargo container;
- mine;
- sensor buoy.

---

# 30. Ship-mounted weapons

Weapon assets should share standard hardpoints.

Initial families:

```text
point-defense turret
autocannon
laser cannon
railgun
flak turret
plasma turret
gauss cannon
ion emitter
beam emitter
missile pod
torpedo launcher
swarm rocket rack
mine layer
drone launcher
tractor beam
shield emitter
sensor dish
```

A weapon should usually be decomposed into:

```text
mount/base
rotation base
elevation assembly
weapon housing
barrel/emitter
ammo/energy module
sensor
muzzle socket
```

This makes:

- animation easier;
- faction variants easier;
- damage easier;
- hardpoint swapping easier.

---

# 31. Missiles and ordnance

Ordnance families:

```text
interceptor
guided missile
heavy missile
torpedo
cluster missile
EMP missile
incendiary rocket
kinetic slug
plasma charge
proximity mine
breaching charge
drone payload
```

Keep silhouettes distinct at top-down scale.

Use emissive tips, trail colour, and trail shape to reinforce role.

---

# 32. VFX design rules

VFX must remain legible in the top-down combat view.

## 32.1 Muzzle flashes

- short duration;
- strong brightness;
- compact;
- weapon-family colour identity.

## 32.2 Projectiles

- kinetic: small bright streak;
- laser: crisp coloured bolt/beam;
- plasma: larger glowing orb/bolt;
- missile: physical projectile + smoke/energy trail.

## 32.3 Explosions

Author size classes:

```text
small
medium
large
capital
```

Each may combine:

- bright flash;
- expanding fire/plasma;
- smoke;
- sparks;
- debris;
- optional shock ring.

Do not make every hit a huge explosion.

## 32.4 Shield impacts

Use:

- local impact flash;
- brief shield surface ripple;
- geometric/hex visual if faction style supports it.

## 32.5 Tractor beam

Recommended composition:

```text
transparent outer cone/cylinder
+
bright inner beam
+
animated noise
+
particles moving toward source
+
impact/target glow
+
modest bloom
```

It does not need expensive true volumetric ray marching.

## 32.6 Thrusters

Use:

- emissive nozzle;
- short energy cone;
- particle streaks;
- optional heat/distortion;
- local point light for close view;
- LOD simplification in top-down view.

---

# 33. Space background and volumetric illusion

The “skybox” should feel layered and volumetric without being an expensive fully volumetric universe.

Use multiple depth layers:

1. very distant static stars/nebula sky;
2. slow parallax nebula cloud cards or skydome layers;
3. distant planets;
4. far asteroid silhouettes;
5. gameplay asteroid layer;
6. near debris particles.

Camera movement should create slight differential motion between layers.

Avoid obviously flat billboard walls.

## 33.1 Planets

Planet art should match the voxel language.

Families:

```text
rocky
temperate
desert
ice
volcanic
gas giant
ocean
toxic
crystal/exotic
```

Planets can be normal spheres with voxelized/materialized surface detail rather than literal millions of cubes.

Use:

- blocky surface relief;
- stylized cloud layers;
- emissive city/volcanic regions;
- atmosphere rim;
- ring systems where appropriate.

---

# 34. Camera system

The project has two major gameplay presentation modes.

## 34.1 Interior / RPG angled mode

Features:

- close angled 3D camera;
- open-roof/roof-hidden ship interior;
- character movement;
- room interaction;
- readable furniture and consoles.

## 34.2 Space ARPG top-down mode

Features:

- significantly higher camera;
- narrow perspective or orthographic-like feel;
- ships become tactical silhouettes;
- UI becomes combat-oriented;
- missiles/weapon fire readable;
- asteroids simplified via LOD.

## 34.3 Seamless transition

The transition should animate:

- camera position;
- camera target;
- camera FOV;
- roof visibility;
- exterior shell visibility;
- interior detail LOD;
- space-object visibility/LOD;
- UI mode;
- post-processing intensity.

The player should perceive that the same physical ship is being viewed from farther away.

Do not load a completely unrelated visual representation unless performance requires a deliberate LOD mesh.

---

# 35. Roof/interior visibility

In interior mode:

- roof/caps hidden or faded;
- interior walls remain;
- occluding exterior sections may fade or cut away.

In space mode:

- roof/exterior shell returns;
- interior props can LOD out;
- windows may retain tiny emissive/interior hints.

Use explicit layer or mesh-group ownership so roof visibility is not managed by fragile material-name hacks.

---

# 36. UI architecture

For large menus and information-heavy UI, prefer a normal web UI layer over forcing everything into 3D.

Recommended:

```text
Babylon canvas = world rendering
DOM/CSS/TypeScript = major HUD and menus
Babylon GUI/world-space UI = in-world labels, markers, diegetic screens where useful
```

Use React only if the project is already using React or benefits from it. Otherwise ordinary TypeScript + DOM is acceptable.

Major UI systems:

- inventory;
- crate opening;
- vendor/shop;
- character paper doll;
- stats;
- skills;
- hotbar;
- ship console;
- ship module list;
- power distribution;
- cargo;
- weapons;
- targeting;
- objectives;
- tactical map;
- minimap;
- status bars.

---

# 37. UI visual language

UI should match the art without becoming noisy.

Use:

- dark navy/black translucent surfaces;
- cyan/blue frame lines;
- restrained magenta/purple highlights;
- red danger;
- green success;
- orange warning;
- strong spacing;
- clear panel hierarchy.

Avoid putting a glowing outline around every single component.

Information hierarchy is more important than decoration.

---

# 38. Top-down combat HUD baseline

Core player ship HUD:

```text
Hull
Shield
Energy
Heat
Fuel/Oxygen where relevant
Ammo/missiles
Selected weapon/ability
Cooldowns
Cargo/tractor status
Target lock
Minimap/tactical radar
Objectives
```

Enemy ship bars should be compact and readable.

Do not flood the world with labels.

Use distance/importance rules to hide minor indicators.

---

# 39. Ship console UI

The ship console should expose:

- ship overview;
- hull/shield/reactor/engine status;
- crew;
- cargo;
- installed modules;
- hardpoints;
- power distribution;
- weapon systems;
- sensors;
- engineering;
- repair;
- refit;
- launch.

The 3D ship preview may highlight selected modules and hardpoints.

Use stable screen-space UI for data-heavy panels.

---

# 40. Inventory and equipment

Inventory system should support:

- item grid/list;
- categories;
- stack counts;
- rarity;
- weight;
- cargo capacity;
- drag/drop;
- compare;
- quick-transfer;
- equipment slots;
- hotbar;
- filtering/search.

Paper doll slots:

```text
helmet
visor
shoulders
chest
gloves
belt
legs
boots
backpack
primary
secondary/tool
```

Stats should be separated into understandable groups:

```text
survival
combat
defense
utility
resistances
```

---

# 41. Vendor/shop UI

A vendor screen should show:

- vendor inventory;
- player inventory;
- buy/sell/barter mode;
- item preview;
- item stats;
- comparison to equipped;
- price;
- quantity;
- cart/transaction summary;
- faction reputation where relevant.

Avoid presenting every possible stat for an item when only a subset matters.

---

# 42. Crate/loot UI

Crate opening should be satisfying but fast.

Show:

- crate type/grade;
- contents;
- rarity colour;
- stack amount;
- take all;
- quick transfer;
- dismantle where allowed.

Do not turn normal loot into a mandatory long animation.

Rare/special crates may have a short enhanced reveal.

---

# 43. Performance strategy

This is a web game. Visual density must be achieved through batching, instancing, LOD, and shared materials.

## 43.1 Never create one Babylon mesh per micro-voxel

This is the most important performance rule.

Micro-voxel pieces should be merged into logical meshes during Blender authoring or build processing.

Runtime entities should correspond to gameplay-relevant objects, not every tiny cube.

## 43.2 Mesh boundaries

Good mesh units:

- wall tile;
- floor tile;
- console;
- engine module;
- room module;
- turret;
- crate;
- character equipment piece;
- asteroid instance.

Bad mesh unit:

- every tiny panel cube.

## 43.3 Instancing

Use Babylon instances/thin instances for repeated objects such as:

- asteroids;
- debris;
- crates;
- pipes;
- repeated wall greebles;
- identical lights;
- cargo;
- small space props.

## 43.4 Material budgets

Target shared materials.

A normal module should not need 20 materials.

Prefer approximately:

```text
1–4 shared material slots per ordinary module
```

Special hero modules may justify more.

## 43.5 Draw-call target

Measure on the actual target hardware/browser.

As an initial engineering target, keep normal gameplay comfortably below the point where CPU submission becomes a bottleneck.

Prefer:

- merged logical meshes;
- shared materials;
- instancing;
- LOD.

Do not “optimize” by destroying modularity before profiling.

---

# 44. LOD strategy

Every frequently visible large asset should have intentional LOD.

Example:

## LOD0
- full bevels;
- greebles;
- close interior detail.

## LOD1
- fewer greebles;
- simplified bevel geometry;
- simplified internals.

## LOD2
- silhouette + major panels;
- simplified material;
- top-down readable lights.

For tiny top-down ships, the game should spend geometry on silhouette and emissive cues, not invisible interior detail.

Asteroids should also have LOD.

---

# 45. Collision strategy

Render geometry and collision geometry are separate concerns.

Use simple collision primitives/meshes.

Examples:

- character floor collision: simple walkable planes/volumes;
- wall: box/convex collision;
- ship module: simplified hull;
- asteroid: sphere/convex hull;
- crate: box.

Do not use dense greeble geometry as collision.

---

# 46. Blender validation rules

Every exported asset should pass automated validation.

Checks:

```text
[ ] scale is correct
[ ] transforms applied as required
[ ] origin is correct
[ ] normals valid
[ ] no unexpected negative scale
[ ] no non-manifold geometry where prohibited
[ ] material count within budget
[ ] asset uses approved material library
[ ] emissive pieces use approved convention
[ ] sockets exist and are correctly named
[ ] collision object exists if required
[ ] LODs exist if required
[ ] no hidden accidental objects
[ ] no test cameras/lights exported unless intentional
[ ] bounding box matches metadata
[ ] construction-grid occupancy is valid
[ ] bevel rule visually satisfied
[ ] GLB export succeeds
```

Validation failure should stop automated bulk generation.

---

# 47. Export rules

Preferred format:

```text
.glb
```

Export only production collections.

Do not export:

- reference images;
- modelling helpers;
- unnecessary cameras;
- unnecessary lights;
- hidden scratch meshes;
- simulation caches.

Apply transforms carefully.

Preserve:

- hierarchy;
- empties/nodes used as sockets;
- material assignments;
- animation rigs;
- animation clips.

---

# 48. Babylon import rules

Create one centralized asset loading layer.

Do not scatter direct GLB imports through gameplay code.

Recommended concepts:

```text
AssetRegistry
AssetContainer cache
ModuleFactory
CharacterFactory
MaterialRegistry
VfxRegistry
```

The loader should:

1. load GLB once;
2. validate expected root/socket nodes;
3. attach metadata;
4. clone/instance as appropriate;
5. apply runtime material overrides if necessary;
6. register LOD and effects.

---

# 49. Damage rendering in Babylon

A module state change should not require rebuilding the entire ship.

Recommended logic:

```ts
module.setDamageState("critical");
```

Renderer may then:

- swap or reveal damage mesh;
- alter emissive lights;
- start smoke emitter;
- start sparks;
- attach fire effect;
- hide destroyed panel group.

Keep damage FX tied to named `FX_DAMAGE_*` sockets.

---

# 50. Material variation at runtime

Faction and item variation should preferably use:

- shared material instances;
- controlled colour parameters;
- decal variants;
- small texture masks.

Do not duplicate entire large texture sets just to make a red version and a blue version.

Astra should prefer parameterized variants.

---

# 51. Content-generation rules for Astra

When Astra is asked to generate a new asset:

1. Identify category and faction.
2. Determine construction footprint.
3. Choose existing material families.
4. Choose existing socket conventions.
5. Model silhouette.
6. Add secondary construction detail.
7. Add restrained greebles.
8. Apply bevel policy.
9. Assign material palette.
10. Add emissives.
11. Add collision.
12. Add sockets.
13. Generate LOD if required.
14. Validate.
15. Export GLB.
16. Load in Babylon test scene.
17. Compare at close and top-down camera.
18. Only then mark complete.

---

# 52. Blender Python generation guidance

Generated hard-surface pieces should be built with explicit dimensions and grid snapping.

Example pseudo-structure:

```python
def make_wall_tile(width=1.0, height=1.0, depth=0.125):
    frame = create_box(...)
    inset = create_box(...)
    light = create_emissive_strip(...)
    add_bevel(frame, 0.025)
    add_bevel(inset, 0.015)
    create_socket("SOCK_NORTH", ...)
    create_socket("SOCK_SOUTH", ...)
    return assemble(...)
```

Prefer small reusable generator functions over one enormous procedural script.

Important functions:

```text
create_box
create_panel
create_frame
create_bevelled_block
create_emissive_strip
create_pipe
create_socket
assign_material
snap_to_micro_grid
validate_bounds
export_glb
```

---

# 53. Visual comparison test scene

Create a permanent Blender and Babylon reference scene containing:

- one light hull panel;
- one dark structure panel;
- one red accent plate;
- one floor;
- one wall;
- one door;
- one window;
- one console;
- one bed;
- one crate;
- one character;
- one engine;
- one weapon;
- one asteroid.

This becomes the project’s visual calibration set.

Any material or lighting change must be checked against this scene.

---

# 54. Initial vertical slice

Before mass asset production, complete this exact slice.

## Interior slice

Create:

- 3×4 room;
- corridor connection;
- wall/window/door;
- bed;
- locker;
- small console;
- floor panels;
- utility strip;
- one character.

Validate:

- plastic PBR;
- bevel quality;
- emissive strips;
- contact shadows;
- top-down readability.

## Exterior slice

Create:

- 4–6 m hull section;
- armour paneling;
- one engine;
- one turret hardpoint;
- one sensor;
- one damage-state panel.

Validate:

- environment reflections;
- sun direction;
- bloom;
- damage FX;
- space background.

Only after both slices match target quality should bulk asset generation begin.

---

# 55. Migration plan from the existing ship

## Phase 1 — preserve current blockout

Do not remodel major room layout yet.

Freeze:

- dimensions;
- major room positions;
- corridor layout;
- basic exterior shape.

## Phase 2 — replace one room’s surface language

Take one bedroom/crew area.

Upgrade:

- floor seams;
- wall frames;
- recessed panels;
- partitions;
- bed materials;
- cyan emissive;
- tiny utility detail;
- bevels.

## Phase 3 — reproduce in Babylon

Export to GLB and match:

- roughness;
- specular;
- bloom;
- exposure;
- AO;
- shadowing.

The Babylon result should be visually close enough that asset authors can trust Blender look-development.

## Phase 4 — create shared core tile kit

Rebuild the rest of the ship from the validated pieces.

## Phase 5 — exterior hull

Add:

- armour plate layer;
- seams;
- vents;
- greebles;
- engine treatment;
- hardpoints;
- damage meshes.

## Phase 6 — faction variants

Only after the Human Federation kit is stable.

---

# 56. Definition of Done: art asset

An art asset is done only when:

```text
[ ] belongs to an approved category/faction
[ ] uses project scale
[ ] snaps to micro/construction grid where required
[ ] has correct origin
[ ] silhouette reads from gameplay camera
[ ] major visible edges are appropriately bevelled
[ ] surfaces use approved material family
[ ] material response is PBR, not flat colour
[ ] emissive areas actually read as luminous
[ ] seams/recesses provide depth
[ ] has collision if gameplay relevant
[ ] has sockets/hardpoints if required
[ ] has damage state if required
[ ] has LOD if required
[ ] passes Blender validation
[ ] exports clean GLB
[ ] renders correctly in Babylon
[ ] works in both close angled and top-down views
```

---

# 57. Definition of Done: renderer feature

A rendering feature is done only when:

```text
[ ] works in WebGPU target
[ ] has acceptable fallback strategy if required
[ ] tested in both camera modes
[ ] does not break shared material pipeline
[ ] measured for performance
[ ] has a reasonable LOD/quality fallback
[ ] does not rely on editor-only Blender behavior
```

---

# 58. Definition of Done: UI feature

A UI feature is done only when:

```text
[ ] keyboard/mouse navigation works
[ ] key gameplay values are visible without clutter
[ ] layout works at target resolutions
[ ] dangerous/warning/success states are visually distinct
[ ] item/ship terminology is consistent
[ ] drag/drop and comparison behavior is predictable
[ ] UI does not obscure the game unnecessarily
```

---

# 59. Recommended material palette philosophy

Use a small common material vocabulary across the game.

Example Human Federation:

```text
Light Hull      warm light grey
Structure       navy/charcoal
Secondary       cool grey
Primary Accent  muted crimson
Utility Accent  orange
Active Tech     cyan
Powered Tech    blue
Warning         amber
Critical        red
Medical         white/red
```

Do not assign colours randomly to props.

Colour should communicate:

- faction;
- function;
- state;
- rarity;
- hazard.

---

# 60. What NOT to do

Do not:

- create every visible voxel as an independent runtime mesh;
- make every surface metallic;
- use sharp un-bevelled edges everywhere;
- bake all panel structure into flat textures;
- use huge bloom;
- apply heavy dirt to every faction;
- add greebles before silhouette is correct;
- use unique high-resolution textures on trivial props;
- create one-off socket names;
- manually “fix” GLB orientation per asset;
- export Blender-only procedural nodes and assume Babylon will reproduce them;
- use dense render meshes as collision;
- create UI entirely in world-space 3D if DOM UI is simpler;
- build the entire asset library before proving the reference slice;
- optimize blindly without profiling;
- sacrifice readability for microscopic detail.

---

# 61. Priority order for achieving the target look

When an asset looks too flat or prototype-like, fix it in this order:

1. silhouette;
2. bevels;
3. seams/recesses;
4. material roughness/specular response;
5. environment lighting;
6. AO/contact shadow;
7. emissive treatment;
8. secondary geometry;
9. greebles;
10. wear/dirt.

Do not jump straight to detailed textures.

---

# 62. Astra decision rules

When uncertain, Astra should choose:

### Geometry vs texture
If the detail changes silhouette or catches meaningful light: **geometry**.

If it is a tiny label, scratch, or subtle surface variation: **texture/decal**.

### Unique mesh vs instance
If gameplay or deformation differs: **unique/clone**.

If only transform/material parameter differs: **instance/thin instance**.

### Real light vs emissive
If nearby surfaces must visibly receive coloured illumination: **use a real light, possibly with emissive source**.

If the source only needs to glow: **emissive may be enough**.

### Full detail vs LOD
If the object is small in the top-down view: **remove invisible detail**.

### Procedural Blender shader vs portable PBR
For final game appearance: **portable PBR first**.

---

# 63. Suggested asset implementation sequence

Build in this order.

## Milestone A — rendering foundation
1. environment/IBL;
2. sun/key light;
3. PBR plastic materials;
4. bloom;
5. AO/contact shadow;
6. GLB loader;
7. validation scene.

## Milestone B — construction kit
1. floor;
2. wall;
3. corner;
4. door;
5. window;
6. roof;
7. corridor;
8. hull;
9. utility channel.

## Milestone C — interior props
1. console;
2. bed;
3. locker;
4. table/chair;
5. crate;
6. medical prop;
7. hydroponic prop.

## Milestone D — ship systems
1. reactor;
2. engine;
3. shield;
4. sensor;
5. tractor;
6. hardpoint;
7. turret;
8. missile rack.

## Milestone E — character
1. base body;
2. rig;
3. helmet;
4. armour;
5. weapon;
6. animation set.

## Milestone F — space environment
1. asteroids;
2. beacons;
3. cargo;
4. sky layers;
5. planets;
6. combat VFX.

## Milestone G — factions
1. industrial;
2. raider;
3. alien.

---

# 64. Acceptance screenshot checklist

For every major visual milestone, capture:

1. Blender close angled render;
2. Babylon close angled render;
3. Babylon top-down render;
4. unlit/material-debug render if needed;
5. wireframe/LOD comparison if performance-sensitive.

Compare:

- edge highlights;
- roughness;
- emissive intensity;
- shadow depth;
- colour palette;
- silhouette;
- tiny-detail readability.

---

# 65. Suggested repository reference file

Keep this document at a stable project path, for example:

```text
/docs/ART_TECHNICAL_DESIGN.md
```

Astra should be told:

> Read `/docs/ART_TECHNICAL_DESIGN.md` before generating or modifying Blender assets, GLB exports, Babylon materials, ship modules, characters, props, VFX, or UI. Treat it as the source of truth for scale, materials, naming, asset hierarchy, sockets, rendering, and acceptance criteria.

---

# 66. Short prompt to prepend to Astra asset tasks

Use this when delegating an art/technical task:

```text
Before starting, read /docs/ART_TECHNICAL_DESIGN.md and follow it as the authoritative art/rendering specification.

Use Blender on Linux for asset generation and GLB export. Preserve the 0.125 m visual micro-voxel grid and 1 m construction grid. Use the approved stylised PBR/plastic material system, small bevels, shared material families, standard socket naming, and Babylon-compatible GLB output. Validate the asset in both close angled and top-down gameplay views before considering the task complete.

Do not create individual runtime meshes for micro-voxels. Keep visual geometry, construction-grid occupancy, and gameplay module logic separate.
```

---

# 67. Final art-direction summary

The game should feel like a playable collection of premium modular sci-fi miniatures.

The geometry is deliberately block-built, but it should not look cheap.

The style is created by the combination of:

```text
tiny modular geometry
+ small bevels
+ layered panel construction
+ ABS-like stylised PBR
+ selected metals
+ restrained roughness variation
+ clean emissive technology
+ strong environment reflections
+ readable key lighting
+ deep contact shadow
+ disciplined palette
+ deliberate faction shape language
+ controlled LOD
```

The existing blockout already contains much of the correct structural thinking.

The project does **not** need a radically different engine or a magical voxel shader.

The required transformation is mostly an art-production and rendering discipline:

> Keep the current modular design logic, increase the geometric surface hierarchy, bevel the pieces, standardize the material family, light it like a premium miniature, and export it through a strict Blender→GLB→Babylon pipeline.

If this document is followed consistently, assets generated by Astra, manually authored Blender assets, and runtime Babylon rendering should converge on the same visual language rather than slowly drifting into incompatible styles.
