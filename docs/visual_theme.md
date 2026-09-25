# Sidereal visual theme — the inhabited frontier

Status: Active visual direction; first environment and voxel study implemented
Last updated: 2026-09-08
Owners: Sidereal art and rendering

**Current model-authoring direction:** the owner is retiring TypeScript voxel-solid art in favor of Blender-authored models, meshes and materials. New visual assets preserve their authored Blender surface through GLB export. Existing voxel studies remain migration references; any required sampled gameplay representation stays separate. See [Blender model migration](blender_asset_migration.md).

## Character of the world

Sidereal is a place crews inhabit, repair and build. Ships should feel like working machinery with rooms inside, readable silhouettes outside and a history expressed through fittings, paint and repairs. The chosen direction combines carefully shaped voxel architecture with a violet-blue galactic backdrop and warm, inhabited room dioramas. It is three-dimensional geometry with a deliberate small-block finish; avoid pixel filters over the whole scene.

Space is mostly dark. Localized petrol-blue and teal nebulae, broken distant galactic dust lanes and occasional warm mineral clouds give regions an identity. Keep a quiet area around the player. A bright star, planet limb or engine plume can be a focal point; they should not all compete with the ship at once. Stars illuminate exteriors with restrained neutral light. A yellow star must not recolor the cabin.

## Material and color roles

| Role | Starting color | Use |
| --- | --- | --- |
| Deep space | `#030711` | darkness between clouds and stars |
| Instrument recess | `#142730` | unpowered glass, machinery cavities |
| Structural steel | `#344550` | exposed frame, lower armor, ribs |
| Blue-gray plate | `#536b76` | main hull, deck structure |
| Ceramic edge | `#80939b` | bevel steps, raised panels, cabin walls |
| Suit / readable highlight | `#c5cbd0` | crew silhouettes and identification |
| Copper | `#cf824c` | sparse safety marks, faction identity |
| Sea glass | `#6fcabd` | interfaces, local powered detail |

Large material fields stay calm. Detail is concentrated at joins, doors, vents, nozzles, machinery and corners. Build interlocking plates and continuous hull boundaries. Do not draw a thick dark outline around every construction cell. Decals, ship names, registration numbers and faction stripes are independently authored layers; they are not baked repeatedly into every roof panel.

Keep the six existing [faction material families](../assets/themes.json): Frontier Industrial, Aegis Naval, Helix Research, Corsair Salvage, Verdant Logistics and Umbra Syndicate. Faction geometry should remain recognizable in grayscale through silhouette, spacing and construction choices. Their political ownership is separate from the selected visual theme. The first voxel study uses Frontier Industrial; the other palettes are starting libraries, not completed voxel model packs.

## Geometry language

The latest owner references favor pale metallic blocks, indigo framing, burgundy service panels, cyan instruments, warm room lights and colorful chunky crew. This takes precedence over the earlier predominantly muted Frontier study.

Use the two-meter construction grid for gameplay assembly. Author intentional stepped profiles, rounded engine bells, slopes, plate seams and chamfers in Blender at the scale the reference requires. Preserve those meshes and materials in the visual export. The existing Wayfarer gameplay/editing volume uses 32 samples across a tile (6.25 cm cells); its resolution does not prescribe the replacement visual mesh. Do not create a scene node, collider, material or draw call per fine sample. See the [migration direction](blender_asset_migration.md) and [existing voxel construction contract](voxel_construction.md).

Voxel architecture and damage geometry coexist with stepped voxel planets, smooth luminous stars, thin atmosphere shells, particles, rigged equipment and typography. The universe need not consist of equally sized cubes. Cabin detail should reward the closer view: recesses, sill height, consoles, reachable controls and clearance around doors. Current crew is a chunky, large-headed, colored-block proxy with walking leg motion; the full customizable animation rig remains open.

## One ship and two camera poses

The ship remains the same mesh hierarchy and local coordinate frame in flight and on foot. On foot, use a rotatable angled, long-lens perspective view with a Diablo-like sense of depth. Walls have thickness and visible sides. The roof and camera-facing upper wall bands fade for the local cutaway; floor, lower walls, equipment, exterior armor and engines remain the same objects. The camera follows partway toward the character while retaining spatial context.

Right-drag changes azimuth only at a fixed 35.264° elevation above the deck; wheel zooms, and the orbit button resets the pose. WASD walks relative to the displayed camera, including during camera transitions. E uses the control station: acquiring its authoritative occupancy returns smoothly overhead; leaving it returns to the remembered walk-around angle. TAB remains a view switch and grants no control authority. Reduced-motion preference makes the view change immediate and suppresses ambient animation.

Ship motion, camera tracking, character offsets and backdrop parallax share one presentation timeline. This first lab smooths incoming transforms; it is not a substitute for the scheduled M1 input acknowledgement/replay and timestamped interpolation work. Collision, ship control and character position remain server-owned.

## Environment studies now available

| Vista | Sky treatment (landmarks remain server-owned) |
| --- | --- |
| Orion Veil (default) | Violet spiral galaxy and blue dust |
| Helion Reach | Blue-gray frontier with restrained warm accents |
| Veil Expanse | Deeper cyan nebula and cold highlights |
| Ash Belt | Copper/brown dust and pale highlights |

The client combines an [original generated nebula/galaxy plate](../assets/runtime/environment/veil-nebula-v1.png), sparse procedural star layers, local dust, merged voxel 3D globes, atmosphere shells, stepped gas bands, ring geometry and restrained stellar coronae. [Prompt provenance](../assets/runtime/environment/provenance.json) is retained. Region presets are data in `packages/content/src/environment.ts`; shader code is in `packages/render/src/environment`.

The selectors change sky treatment. Known planets/stars and physical rocks now come from private server-owned lab rows with stable world XY, not from the selector. Celestial heights and sizes remain an art-scale fixture; full discoveries, astronomical scale, Firmament/Genesis publishing and orbit/landing mechanics remain open. See [spatial environment](space_environment.md). Never infer hidden contacts from sky decoration.

## Art and rendering acceptance

Review the same asset overhead, angled, in cutaway and at ordinary play zoom. Check that the player and action points read against the floor, corners are solid, neighboring surfaces join, and no texture contains duplicate identification marks. Test one moving ship before a station/fleet stress scene. Keep dynamic shadows, bloom and particle count bounded; do not depend on bloom to make the silhouette readable.

Current mesh evidence: roughly 1.73 million occupied voxel samples become 65,736 triangles in 18 semantic layer/room batches (material splitting adds draw primitives). Those are asset counts, not a frame-rate claim. Browser verification on this host uses software WebGL2. Reference-hardware GPU, fleet, LOD, download and frame-time budgets still require measurement.

## Earlier 2026-09-08 metal material study

The earlier study combined voxel geometry with brushed micro-normal detail, variable roughness and metal reflections. Its broad metallic-wall recommendation is superseded by the owner's later molded-plastic direction below. Exposed steel still uses stronger metal response, while cloth/plants/soft furniture stay matte. The source metal maps and neutral HDR reflection rig were created and baked in Blender by `scripts/build_metal_materials.py`; these remain appropriate for explicit metal parts rather than all structural surfaces.

## Current owner refinement: molded miniature plastic

The owner explicitly adopted `reference/Astra_Voxel_Space_Game_Art_Technical_Design.md` and reiterated that the ship still lacks its required plastic finish. Most hull, wall and structural surfaces should read as premium injection-molded, pigmented plastic with visible small edge bevels. The ceramic/light edge palette is not bare steel. Reserve metallic response and brushed normals for explicit mechanical metal roles.

Starting material values are metallic 0, IOR 1.46, roughness around .30, coat .08 and coat roughness .20. Light hull, dark structure and colored accent panels need distinct restrained roughness ranges (.28–.36, .34–.42 and .22–.32 respectively). Subtle variation should break reflections without visible grain or dirt at gameplay scale. Preserve matte rubber, fabric and plants, and keep emissive parts separate. These are visual starting points, not authority or damage material changes.

The ship has real two-segment convex bevel geometry, but that alone does not establish the required finish. A dedicated material and lighting-response pass is in progress, judged from matched-camera in-game closeups against the reference. The older metal study and triangle counts are not evidence that the current plastic target has been accepted.

The newer [Orion background](../assets/runtime/environment/orion-veil-v1.png) and [provenance](../assets/runtime/environment/orion-provenance.json) accompany the earlier teal plate. Neither background is an emitter onto the cabin. Current furnished rooms, trim, recessed panels, cyan instruments and voxel asteroid meshes are an art prototype approaching the references, not a claim to match their finished production detail.

## 2026-09-08 construction-brick direction

The owner describes the target as **LEGO-like construction without studs**: tactile, tightly fitted small bricks, readable courses and stepped silhouettes, smooth studless tops, subtle edge highlights and purposeful joins. This is the visual language of a built object, not a cube-shaped texture or a pixel filter. Avoid cylindrical studs, toy branding, scattered cubes, thick black outlines around every voxel, and deep gaps that make a sealed wall appear porous. Neighboring modules share edge profiles, metal response and brick-course alignment. Panel seams and decorative relief must not accidentally cut through the pressure core.

A construction tile is a modular assembly unit; its fine voxels form destructible matter. A visible brick can cover multiple fine voxels. Bevels, shallow seams and micro-normal maps describe its finish while solid voxel occupancy describes what can be destroyed. Removing material must reveal its real thickness and permit a hole once the remaining pressure core has been penetrated.

Bricks are not restricted to painted metal. The material library must accommodate brushed/exposed metal, painted enamel, ceramic, matte soft material, transparent or tinted glass, translucent light diffusers, self-emitting light bricks and strongly glowing energy elements. Material identity survives source modeling, voxelization, chunk edits and exposed-face rebuilding. Glass is occupied material, not empty space; visible transparency does not imply passage, lack of collision, loss of airtightness or permission to receive hidden interior data. Emission color/strength and optical transmission are independent properties. Bloom is optional presentation; important lights must remain readable without it.

Implemented today: opaque palette materials, PBR metal/roughness and emissive source materials; the sampled kit has real emissive voxels. Transparent/transmissive brick export, transparent-neighbor face meshing, glass fracture and bounded voxel-emitter light clustering remain implementation gates. The current Blender sampler rejects unsupported transparency instead of silently turning glass into opaque material. See [voxel construction](voxel_construction.md) for the required material and destruction contract.

## 2026-09-08 voxel planet refinement

The planet reference now drives real grid-aligned geometry: stepped globe silhouettes, blue oceans with raised green land shelves, pale cloud blocks and crater depressions on rocky/moon appearances. Gas worlds retain jewel-colored bands and rings. Surface cells share one vertex-colored material batch, avoiding per-brick draw calls; stars remain luminous smooth geometry. Cloud blocks are a separate slowly rotating shell, frozen by reduced motion. See [spatial environment](space_environment.md) for measured mesh counts and the remaining art/simulation limits. This is a procedural art study, not finished reference-equivalent trees, cities or volumetric weather.
