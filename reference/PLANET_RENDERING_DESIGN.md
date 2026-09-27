# Planet Rendering & Voxel World Art Specification
## Layered Voxel Planets for Babylon.js + Blender

**Status:** Authoritative implementation reference  
**Audience:** Astra / coding agent / technical art agent  
**Primary stack:** Blender on Linux, Blender Python (`bpy`), GLB/glTF, Babylon.js, TypeScript  
**Purpose:** Replace the current coarse planet rendering with a layered, fine-resolution voxel planet system that matches the established art direction of the project.

---

# 1. Goal

The current in-game planet is structurally useful but visually too coarse.

It currently reads as:

- a low-resolution spherical body;
- very large block-like terrain regions;
- oversized cloud chunks;
- little or no fine terrain detail;
- no clear distinction between ocean, land, atmosphere, vegetation, clouds, and surface decoration;
- minimal surface hierarchy;
- limited lighting depth.

The target is a planet that reads like a **tiny voxel diorama wrapped around a sphere**.

The reference style is:

- still unmistakably voxel/block-built;
- significantly finer in voxel scale;
- capable of showing small trees, cliffs, mountains, crystal formations, city lights, ruins, lava cracks, and similar secondary features;
- layered rather than monolithic;
- strongly lit with PBR materials;
- readable from both normal gameplay distance and closer cinematic/transition views;
- efficient enough for real-time use in Babylon.js.

The key art-direction shift is:

> Do not think “make the sphere more voxel-like.”  
> Think “build a small layered voxel world around a spherical core.”

---

# 2. Critical visual requirement: voxelisation must be much finer

This is the most important change.

The current voxel/chunk size is too large relative to the planet diameter.

The target planet must use a much finer surface resolution so that features such as:

- trees;
- forests;
- small cliffs;
- mountains;
- crystal clusters;
- ruined structures;
- city blocks;
- volcanic fissures;
- ice formations;
- resource nodes;

can exist as visible secondary detail on the globe.

## 2.1 Current problem

The current visual scale is roughly:

```text
PLANET DIAMETER
|--------------------------------|

terrain feature
|------|
```

Individual blocks/features occupy a large percentage of the visible sphere.

That causes:

- coarse coastlines;
- flat/uninteresting biome shapes;
- oversized clouds;
- no room for forests or micro-detail;
- poor sense of scale.

## 2.2 Target resolution

For a hero planet, the visible surface detail should feel approximately equivalent to:

```text
64–96 surface cells across a planet diameter
```

This does **not** mean literally spawning 96×96×96 cubes.

It means the *apparent* surface granularity should be fine enough that the planet can support small environmental props.

Recommended target:

```text
Planet diameter visual resolution:
64–96 fine cells

Hero/close planet:
up to ~128 equivalent surface resolution if needed

Distant planet:
far lower LOD
```

## 2.3 Practical scale target

A single visible tree should typically occupy only a very small fraction of the planet diameter.

Example visual target:

```text
planet diameter = ~96 visual cells

tree height = ~1–3 visual cells
small mountain = ~3–8 visual cells
large mountain = ~8–16 visual cells
cloud cluster = ~8–24 visual cells
```

This is the level of granularity required to produce the dense miniature-world appearance of the reference art.

---

# 3. Planet architecture

A planet must not be treated as one mesh with one material.

Implement a dedicated layered planet renderer.

Recommended conceptual structure:

```text
PlanetRenderer
├── Base Body / Ocean Sphere
├── Terrain Shell
├── Decoration Layer
├── Cloud Layer
├── Atmosphere Layer
├── Emissive / Special FX Layer
└── Optional Ring System
```

Each layer has its own responsibilities and can use independent LOD.

---

# 4. Layer 1 — base body / ocean sphere

The lowest layer should be a smooth sphere.

Its role depends on the planet type.

Examples:

### Temperate / ocean world

```text
smooth ocean sphere
+
voxel land rising above it
```

### Volcanic world

```text
emissive lava sphere
+
dark voxel crust above it
```

### Rocky world

```text
dark base rock sphere
+
voxel crust and craters
```

### Ice world

```text
dark blue frozen core/ocean
+
ice voxel terrain
```

This base sphere provides:

- global curvature;
- smooth water/lava where required;
- a guaranteed closed planet silhouette;
- cheaper distant LOD.

---

# 5. Layer 2 — voxel terrain shell

The terrain shell creates the actual block-built world.

This should be a dense surface mesh wrapped around the base sphere.

## 5.1 Recommended topology: cube-sphere

Use a cube-sphere rather than UV-sphere terrain sampling.

Process:

```text
cube
↓
six square faces
↓
subdivide each face into a 2D grid
↓
project vertices to sphere
↓
apply quantized radial height
```

Benefits:

- even distribution;
- easier chunking;
- straightforward face-local coordinates;
- easier procedural generation;
- better compatibility with tile-like terrain logic.

## 5.2 Example face resolution

Start with:

```text
64 × 64 cells per cube face
```

For higher quality:

```text
96 × 96
```

For hero close-up:

```text
128 × 128
```

Do not default every planet to maximum resolution.

Use LOD and per-planet quality.

---

# 6. Terrain height must be quantized

The terrain should not be a smooth displaced sphere.

Height should step in discrete increments.

Conceptually:

```text
rawNoise = 0.38192

quantizedHeight =
round(rawNoise / step) * step
```

This creates voxel-like radial terraces.

Visual result:

```text
      ███
    ███████
  ███████████
███████████████
```

rather than:

```text
       /\
     /    \
   /        \
```

The quantization is essential to the style.

---

# 7. Terrain meshing strategy

Do not create one Babylon mesh per terrain cube.

That would be inefficient.

Instead:

```text
Planet Face
↓
Surface Grid
↓
Chunk Grid
↓
Merged render meshes
```

Recommended starting chunk size:

```text
8 × 8 surface cells
```

or:

```text
16 × 16 surface cells
```

depending on final resolution and profiling.

Example:

```text
96 × 96 face

split into:
12 × 12 chunks at 8×8
```

Rear-facing chunks may be:

- culled;
- reduced in LOD;
- skipped entirely at distant view.

---

# 8. Blender-first hero planet workflow

Hero planets should preferably be generated or authored in Blender.

This allows:

- better visual validation;
- proper bevels;
- PBR material tuning;
- authored vegetation;
- offline mesh merging;
- clean GLB output.

Recommended command pattern:

```bash
blender \
  --background \
  --factory-startup \
  --python assets/blender/scripts/generate_planet.py \
  -- \
  --type temperate \
  --seed 348112 \
  --resolution 96 \
  --output assets/glb/planets/temperate_348112.glb
```

The Astra agent should generate deterministic results from a seed.

---

# 9. Planet definition schema

Recommended data structure:

```json
{
  "id": "planet_temperate_01",
  "type": "temperate",
  "seed": 348112,
  "radius": 100,

  "terrain": {
    "resolution": 96,
    "heightSteps": 12,
    "heightScale": 0.08,
    "continentScale": 0.42,
    "mountainStrength": 0.17
  },

  "biomes": {
    "ocean": 0.58,
    "grass": 0.20,
    "forest": 0.10,
    "rock": 0.07,
    "snow": 0.05
  },

  "clouds": {
    "coverage": 0.32,
    "altitude": 0.04,
    "rotationSpeed": 0.002
  },

  "atmosphere": {
    "color": "#73caff",
    "strength": 0.65,
    "radiusScale": 1.07
  },

  "decorations": {
    "trees": true,
    "mountains": true,
    "cities": false
  }
}
```

---

# 10. Fine surface detail and vegetation

This section is mandatory.

The reference look depends heavily on tiny surface features.

The planet must support a second level of surface decoration above the terrain itself.

## 10.1 Decoration categories

Examples:

```text
trees
bushes
crystal clusters
rock spires
snow caps
ice spikes
ruins
small city clusters
radio towers
lava vents
mining sites
resource formations
alien growths
```

## 10.2 Trees

Trees must be small voxel props.

They should not be painted as flat green textures.

A simple tree can be:

```text
      ▓
     ▓▓▓
    ▓▓▓▓▓
      ▓
      ▓
```

or equivalent 3D voxel geometry.

Recommended size:

```text
1–3 fine visual cells tall
```

A forest is produced by scattering many small tree instances.

The target from normal gameplay distance is not to identify individual leaves.

The target is:

- irregular green silhouette;
- tiny height variation;
- believable forest clustering;
- better light breakup;
- sense of scale.

## 10.3 Tree rendering method

Trees are ideal for:

```text
Babylon Thin Instances
```

or merged Blender geometry for authored planets.

Base library example:

```text
tree_temperate_a
tree_temperate_b
tree_temperate_c
tree_pine_a
tree_pine_b
tree_alien_a
```

Variation via:

```text
rotation
scale
slight color variation
cluster density
```

Do not create a unique tree mesh for every tree.

---

# 11. Forest generation

Forest placement should depend on biome masks.

Example:

```text
if biome == grass
and moisture > 0.6
and temperature between 0.35 and 0.8
and slope < threshold:
    spawn tree candidate
```

Use noise-based clustering so forests form groups rather than uniform scatter.

Example:

```text
forestNoise > 0.62
```

Then randomly thin the result.

Forests should be visibly clustered from orbit.

---

# 12. Mountains and cliffs

Mountains should not only be painted darker terrain.

Use:

- quantized radial height;
- small secondary rock spires;
- snow caps;
- exposed rock bands.

Mountain silhouette matters.

Recommended hierarchy:

```text
terrain elevation
+
rock micro-props
+
optional snow cap
```

This allows a mountain region to look structurally richer than a flat raised plateau.

---

# 13. Clouds must be independent

The current clouds are too large and too tied to the planet surface.

Clouds should use a separate shell.

Recommended radii:

```text
terrain radius      = 1.00
cloud radius        = 1.035–1.055
atmosphere radius   = 1.06–1.10
```

Exact values depend on visual scale.

Clouds should be:

- smaller than current;
- flatter;
- tangential to the sphere;
- scattered in bands/clusters;
- softer and rougher;
- slightly translucent where appropriate.

Do not use massive jagged white mountains as clouds.

---

# 14. Cloud geometry

Clouds can use:

- small voxel blobs;
- merged voxel sheets;
- instanced cloud chunks.

Recommended cloud base assets:

```text
cloud_small_a
cloud_small_b
cloud_medium_a
cloud_medium_b
cloud_long_a
```

Each cloud should be oriented to the local surface normal/tangent.

---

# 15. Cloud motion

Rotate the cloud shell independently.

Example:

```ts
cloudShell.rotation.y += deltaTime * cloudRotationSpeed;
```

Very slow movement is sufficient.

The goal is subtle life, not obvious spinning.

---

# 16. Atmosphere shell

Add a transparent atmosphere sphere.

Use a Fresnel/rim-light style material.

The atmosphere should:

- glow strongest at the limb;
- remain subtle on the front face;
- use planet-specific tint;
- help visually separate the planet from the background.

Conceptual shader:

```text
fresnel =
pow(
    1 - dot(normal, viewDirection),
    falloff
)
```

Then:

```text
alpha = fresnel * strength
color = atmosphereColor
```

The atmosphere should not become a giant bloom halo.

---

# 17. Lighting requirements

The planet must have a clear light direction.

Use:

```text
Directional Sun
+
Environment / IBL Fill
+
Optional Nebula Tint
```

The current near-flat lighting should be avoided.

Target:

- one side clearly illuminated;
- one side clearly darker;
- dark side still readable;
- atmosphere rim visible;
- terrain edges catching highlights.

---

# 18. PBR surface families

Planet materials should use the same stylised PBR philosophy as ships.

Suggested roughness ranges:

| Surface | Metallic | Roughness |
|---|---:|---:|
| Rock | 0.0 | 0.60–0.80 |
| Grass | 0.0 | 0.55–0.75 |
| Soil | 0.0 | 0.65–0.85 |
| Ice | 0.0 | 0.20–0.40 |
| Ocean | 0.0 | 0.10–0.25 |
| Crystal | 0.0–0.1 | 0.15–0.30 |
| Cloud | 0.0 | 0.75–0.95 |
| Lava | 0.0 | emissive |

Avoid flat unlit colours.

---

# 19. Bevel planet voxel geometry

Fine terrain geometry should still have small bevels.

Do not render perfectly sharp cubes everywhere.

Recommended:

```text
bevel ≈ 3–5% of visible block dimension
segments = 1–2
```

The goal is subtle edge highlights.

This is especially important for:

- terrain terraces;
- crystal formations;
- ice blocks;
- cliffs;
- small architecture.

---

# 20. World type profiles

Each world type should have its own rendering rules.

## 20.1 Rocky World

Layers:

```text
dark rock base sphere
+
gray voxel terrain
+
craters
+
orange/mineral seams
+
sparse atmosphere
```

Decoration:

- boulders;
- rock spires;
- mining nodes.

## 20.2 Temperate World

Layers:

```text
smooth blue ocean
+
green/brown voxel land
+
rock/mountain terrain
+
voxel trees
+
small cloud shell
+
blue atmosphere
```

This should be the first milestone planet.

Required fine details:

- trees;
- forest clusters;
- mountains;
- cliffs;
- snow peaks where appropriate.

## 20.3 Desert World

Layers:

```text
orange/brown base
+
terraced desert terrain
+
mesas
+
canyons
+
minimal clouds
+
warm atmosphere
```

Decoration:

- rock pillars;
- ruins;
- settlements;
- mining sites.

## 20.4 Ice World

Layers:

```text
dark blue base
+
white/cyan ice shell
+
ice shelves
+
ice spikes
+
cracks
+
cyan atmosphere
```

Material:

- lower roughness;
- subtle reflective treatment.

## 20.5 Volcanic World

Use a dual-layer concept.

```text
emissive lava sphere
+
dark crust terrain shell
```

Terrain shell should have gaps/fissures.

Those gaps reveal the emissive layer below.

Add:

- lava cracks;
- volcanic mountains;
- smoke;
- sparks;
- orange local light;
- heat haze if appropriate.

## 20.6 Gas Giant

Do not voxelize it like rocky terrain.

Use:

```text
smooth sphere
+
banded stylised shader
+
quantized colour bands
+
storm regions
+
atmosphere
+
optional rings
```

The voxel language can instead appear in:

- band segmentation;
- storm shapes;
- ring particles;
- nearby moons.

## 20.7 Ocean World

Use:

```text
dominant smooth ocean sphere
+
small island voxel terrain
+
dense clouds
+
blue atmosphere
```

Fine decoration:

- trees;
- cliffs;
- coastal settlements;
- reefs if stylised enough.

## 20.8 Toxic World

Layers:

```text
dark terrain
+
green emissive/tinted regions
+
toxic atmosphere
+
gas plumes
```

Decoration:

- alien growth;
- spires;
- pools;
- industrial ruins.

## 20.9 Crystal World

Layers:

```text
dark purple/gray terrain
+
large crystal formations
+
small crystal clusters
+
purple atmosphere
+
glowing seams
```

Crystal props should use:

- a few base meshes;
- thin instances;
- scale/rotation variation.

---

# 21. PlanetRenderer design

Recommended runtime class:

```ts
class PlanetRenderer {
  root: TransformNode;

  body: Mesh;
  terrain?: PlanetTerrainRenderer;
  decorations?: PlanetDecorationRenderer;
  clouds?: PlanetCloudRenderer;
  atmosphere?: PlanetAtmosphereRenderer;
  rings?: PlanetRingRenderer;
  effects?: PlanetEffectRenderer;

  setLOD(level: PlanetLOD): void;
  update(deltaTime: number): void;
  dispose(): void;
}
```

Recommended planet definition:

```ts
interface PlanetDefinition {
  id: string;
  type: PlanetType;
  radius: number;
  asset?: string;

  terrain?: TerrainDefinition;
  ocean?: OceanDefinition;
  atmosphere?: AtmosphereDefinition;
  clouds?: CloudDefinition;
  decorations?: DecorationDefinition;
  rings?: RingDefinition;
}
```

---

# 22. LOD requirements

Planets may appear from very far away to very close.

Implement at least three visual LODs.

## LOD2 — distant

Use:

```text
simple sphere
+
baked/stylised color map
+
optional simple atmosphere
```

No trees.  
No fine terrain.  
No detailed clouds.

## LOD1 — normal gameplay

Use:

```text
medium terrain mesh
+
cloud shell
+
atmosphere
+
major vegetation clusters
+
major crystal/mountain props
```

This should be the primary space-flight view.

## LOD0 — close / hero

Use:

```text
full-resolution terrain
+
fine voxel detail
+
trees
+
forests
+
small cliffs
+
full clouds
+
full atmosphere
+
cities/crystals/ruins
+
higher-quality shadows
```

Trees and similar micro-detail are required here.

---

# 23. LOD transition

Avoid obvious popping.

Use:

- dithered crossfade;
- alpha crossfade;
- overlapping visibility ranges;
- staged decoration fade-in.

Example:

```text
LOD2 visible:
1000+ units

LOD1 transition:
700–1100

LOD0 transition:
250–800
```

Actual distances must be tuned to camera scale.

---

# 24. Decoration LOD

Do not treat all decoration equally.

Recommended:

```text
trees:
fade in at LOD1/LOD0

small bushes:
LOD0 only

cities:
visible even at LOD1

large crystals:
LOD1/LOD0

tiny crystals:
LOD0

large mountains:
part of terrain mesh
```

This keeps performance sensible while preserving the reference look.

---

# 25. Ring systems

Ring systems should fit the voxel style.

Avoid only using a smooth alpha-textured disc.

Preferred:

```text
large-scale ring band
+
many small instanced rock/ice chunks
```

Use:

- thin instances;
- varied size;
- varied rotation;
- varied height;
- material variation.

At distance, these can collapse to a simpler ring mesh.

---

# 26. Performance rules

## Never

```text
spawn one Babylon mesh per terrain voxel
```

## Prefer

```text
merged terrain chunks
thin instances for trees/crystals
shared materials
LOD
frustum culling
back-side suppression where useful
```

## Good candidates for thin instances

```text
trees
small rocks
crystals
ice spikes
city blocks
ring particles
volcanic vents
resource props
```

---

# 27. Blender asset structure

Suggested planet GLB hierarchy:

```text
PLANET_temperate_01
├── BODY
│   └── ocean_sphere
├── TERRAIN
│   ├── terrain_lod0
│   ├── terrain_lod1
│   └── terrain_lod2
├── DECOR
│   ├── trees
│   ├── rocks
│   └── structures
├── CLOUDS
│   ├── clouds_lod0
│   └── clouds_lod1
├── ATMOSPHERE
│   └── atmosphere_shell
└── SOCKETS
    └── optional markers
```

Atmosphere may alternatively be generated dynamically in Babylon.

---

# 28. Blender generation pipeline

Recommended generator stages:

```text
1. create base sphere
2. create cube-sphere terrain grid
3. generate height map
4. quantize heights
5. classify biomes
6. create terrain mesh
7. create water/ocean
8. generate mountain regions
9. scatter vegetation
10. scatter secondary detail
11. generate cloud shell
12. assign PBR materials
13. bevel terrain
14. generate LODs
15. validate
16. export GLB
```

---

# 29. Example Blender generation logic

Conceptual pseudo-code:

```python
planet = create_planet(radius=100)

terrain = create_cube_sphere(
    radius=100,
    resolution=96
)

for cell in terrain.cells:
    n = sample_continent_noise(cell.direction)
    m = sample_mountain_noise(cell.direction)

    raw_height = n + m
    height = quantize(raw_height, step=0.5)

    biome = classify_biome(
        height=height,
        temperature=sample_temperature(cell.direction),
        moisture=sample_moisture(cell.direction)
    )

    cell.height = height
    cell.biome = biome

build_chunk_meshes(terrain)
scatter_trees(terrain)
scatter_rocks(terrain)
scatter_clouds(planet)
build_lods()
export_glb()
```

---

# 30. Tree scattering pseudo-code

Example:

```python
for cell in terrain.surface_cells:

    if cell.biome not in ["grass", "forest"]:
        continue

    if cell.slope > MAX_TREE_SLOPE:
        continue

    density = forest_noise(cell.position)

    if density < FOREST_THRESHOLD:
        continue

    if random() < density:
        spawn_tree(
            type=random_tree_variant(),
            position=cell.surface_position,
            normal=cell.normal,
            scale=random_range(0.8, 1.25),
            rotation=random_range(0, 360)
        )
```

Tree density should be lower near:

- steep cliffs;
- snow;
- desert;
- coast edges where inappropriate.

---

# 31. Surface normals and decoration placement

Every decoration object should align with the local planet surface.

For a placement point:

```text
surfaceNormal = normalized position from planet center
```

Use this normal as local “up”.

Trees, crystals, towers, ruins, and rocks should rotate so their vertical axis follows the surface normal.

---

# 32. Clouds must follow tangent orientation

Cloud meshes should not point outward like spikes.

They should lie tangent to the sphere.

For each cloud:

```text
up = planet surface normal
forward = tangent direction
right = cross(up, forward)
```

Build a local orientation from those vectors.

This is essential to avoid the current “white rock attached to globe” appearance.

---

# 33. Visual scale rules

To preserve miniature-world detail:

```text
small tree:
1–3 fine cells tall

large tree:
2–4 fine cells tall

small rock:
1–2 cells

large rock:
3–6 cells

small building:
2–5 cells

city cluster:
8–20 cells

cloud:
8–24 cells wide

major mountain:
8–16 cells high/large
```

Do not create surface props that are absurdly large relative to the planet.

---

# 34. Lighting integration with ships

Planets and ships should share the same primary sun direction.

If the ship is lit from camera-left, the planet should not appear lit from camera-right unless there is an explicit secondary source.

This creates a coherent solar system scene.

---

# 35. Environment lighting

Use:

```text
global environment texture / IBL
+
directional sun
+
weak nebula ambient tint
```

The planet's dark side should be:

- darker;
- still readable;
- slightly reflective;
- not pure black.

---

# 36. Atmosphere color by world type

Example palette:

```text
temperate    blue/cyan
ocean        bright cyan-blue
desert       warm orange
ice          pale cyan
volcanic     red/orange haze
toxic        green/yellow
crystal      purple/magenta
rocky        nearly none
gas giant    color derived from planet bands
```

---

# 37. Emissive surface details

Selected planet types should have emissive features.

Examples:

```text
volcanic lava
crystal glow
city lights
toxic fissures
alien ruins
energy storms
```

Do not emissively light ordinary grass/rock.

---

# 38. City and civilisation details

Optional for inhabited worlds.

Use simple voxel clusters.

From orbit, cities can be represented by:

- tiny block clusters;
- orange/yellow emissive windows;
- roads as thin dark/light lines;
- spaceport pad;
- beacon.

The city should remain small enough to reinforce planetary scale.

---

# 39. Terrain material batching

Do not create one material per biome instance.

Prefer a small shared set:

```text
MAT_Planet_Rock
MAT_Planet_Grass
MAT_Planet_Soil
MAT_Planet_Snow
MAT_Planet_Ice
MAT_Planet_Sand
MAT_Planet_Crystal
MAT_Planet_Lava
```

Use atlases/vertex colors/masks if helpful.

---

# 40. Validation requirements

Every generated planet must pass:

```text
[ ] sphere is closed
[ ] terrain resolution matches definition
[ ] quantized height is visible
[ ] terrain is chunked/merged
[ ] no individual runtime mesh per voxel
[ ] cloud layer is independent
[ ] clouds lie tangent to sphere
[ ] atmosphere is independent
[ ] material count is reasonable
[ ] vegetation scale is appropriate
[ ] trees are visibly smaller than mountains
[ ] LOD0 contains fine detail
[ ] LOD1 preserves major biome detail
[ ] LOD2 preserves silhouette and colour identity
[ ] GLB exports cleanly
[ ] Babylon scene loads correctly
[ ] lighting direction matches scene sun
```

---

# 41. First implementation milestone

Do not implement all planet types first.

The first target should be one **Temperate World**.

The completion sequence should be:

```text
CURRENT PLANET
↓
1. finer terrain resolution
↓
2. quantized cube-sphere terrain
↓
3. smooth ocean sphere
↓
4. biome classification
↓
5. small mountains/cliffs
↓
6. tree and forest layer
↓
7. independent cloud shell
↓
8. atmosphere shell
↓
9. PBR materials
↓
10. proper directional lighting
↓
11. LOD implementation
↓
12. Babylon validation
```

Only after this planet visually approaches the reference should the agent generalize to the remaining planet types.

---

# 42. Reference acceptance criteria for the Temperate World

The planet is acceptable when:

- coastlines are significantly finer than the current build;
- the globe reads as round despite the voxel terrain;
- the ocean is visually distinct from land;
- terrain has obvious stepped height;
- individual tree clusters can be seen;
- forests create visibly rough green regions;
- mountain regions rise above forests;
- clouds are much smaller and flatter than current clouds;
- atmosphere creates a clean rim;
- sun direction creates a readable bright and dark hemisphere;
- the planet looks like a miniature voxel world rather than a coarse voxel sphere.

---

# 43. What not to do

Do not:

- simply increase the number of giant cloud chunks;
- keep the current voxel scale and rely on textures;
- use one mesh per voxel;
- use one monolithic planet mesh for all effects;
- make trees part of a flat green texture only;
- make clouds point radially outward;
- use uniform lighting across the whole sphere;
- add bloom around the entire planet;
- force gas giants through the rocky terrain generator;
- render every planet at hero resolution at all distances.

---

# 44. Agent instruction block

Use the following instruction when assigning the task:

> Read `/docs/PLANET_RENDERING_DESIGN.md` before modifying the planet system. Replace the current coarse planet rendering with the layered planet architecture defined in that document. The voxelisation must be significantly finer than the current implementation so that small secondary features — especially trees, forests, small mountains, crystals, ruins, and city clusters — can exist visibly on the surface at the same relative scale as the reference art. Do not create individual Babylon meshes for every terrain voxel. Use merged terrain chunks, thin instances for repeated decoration, independent cloud and atmosphere shells, stylised PBR materials, quantized terrain height, and three LOD levels. Implement and visually validate the Temperate World first before generalizing to other world types.

---

# 45. Final implementation principle

The planet system should be thought of as:

```text
smooth planetary core
+
fine voxel terrain
+
tiny world-scale decoration
+
independent clouds
+
atmosphere
+
lighting
+
special effects
```

not:

```text
one coarse voxel sphere
```

The finer surface resolution is essential.

Without it, the engine cannot produce the visual scale seen in the reference art.

With it, the same planet can support:

- forests;
- mountains;
- crystal fields;
- volcanic fissures;
- cities;
- snow lines;
- cloud systems;
- ruins;
- industrial sites;

while still remaining recognizably voxel-based and efficient enough for the Babylon.js renderer.

The first goal is therefore not “more planet detail” in the abstract.

The first goal is:

> **Reduce the apparent voxel scale enough that the planet becomes a miniature world with readable small-scale surface features.**
