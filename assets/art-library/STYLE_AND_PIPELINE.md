# Art style, scale and current implementation

**Current owner direction:** TypeScript voxel-solid model authoring is being phased out. Replacement visual assets are authored Blender meshes and materials, exported with their intended surfaces intact. Follow [Blender model migration](../../docs/blender_asset_migration.md). Existing sampler/mesher descriptions below identify migration inputs and separate gameplay representations; they do not require new visual art to be reduced to the old coarse voxel surface.

Read [PIVOT.md](../../PIVOT.md), the active [visual theme](../../docs/visual_theme.md), [reference guide](../../docs/art_reference_guide.md), [voxel construction](../../docs/voxel_construction.md), [assets](../../docs/assets.md), [crew](../../docs/crew_visuals.md), [equipment](../../docs/equipment_assets.md) and the owner-requested [Astra technical design](../../reference/Astra_Voxel_Space_Game_Art_Technical_Design.md). The latter was examined across its art, scale, sockets, construction, character, weapon, VFX, UI and acceptance sections. Reference files do not override the active project contract.

## Translate conflicts explicitly

| Topic | Reference proposal / image claim | Active project decision |
| --- | --- | --- |
| Construction grid | 1 m tiles; some illustrations label every stack layer 1 m | 2 m construction interfaces. Do not double all art dimensions indiscriminately. Fit 1.8 m crew, 2.5 m walls, reachable controls and passable doors. |
| Fine geometry | 0.125 m visual micro-grid | .0625 m sample pitch on Wayfarer, .03125 m on hero sampled parts; 32³ storage chunks. Visible bricks may span several samples. The visual brick, construction tile and simulation item are separate layers. |
| Ship scale | Human frigate 128 × 32 × 28 m; inconsistent on-screen thrust/mass/speed | Preserve stated concept dimensions as unvalidated. Current lab mass fixture is 12,000 kg and inertia uses a 10.8 × 22.8 m body footprint; external drives extend it. Do not replace live stats from an image. |
| Crew scale | 1.7–1.9 m in Astra; “approximately four voxels” on animation sheet | Existing generated base is 1.79 m, tallest variants 1.94 m. Start new briefs at 1.8 m, fit the actual rig and retain stable attachment frames. |
| Blender axes | Astra recommends +X right, +Y forward, +Z up | Structural sampling uses X/Y plane and Z up. Existing equipment helper arguments are glTF Y-up/-Z-forward and converted internally. Crew source has its own documented conversion. Inspect the adapter; do not rotate every asset ad hoc or change global scene handedness. |
| Runtime axes | Astra recommends a global right-handed scene | Active simulation world XY maps to renderer X/-Z; renderer Y is height. Subtract camera origin before GPU conversion. Rendering does not write simulation state. |
| Renderer | WebGPU preferred in Astra | Verified baseline is WebGL2/Babylon. WebGPU/reference hardware performance remains a separate acceptance target. |
| Damage | Astra favors authored damaged/critical meshes | Active direction includes solid material-bearing voxel damage; live authoritative destruction is still pending. Cosmetic damage states can supplement it but cannot replace permission/revision/resource checks. |
| Material direction | Mainly injection-moulded ABS-like plastic | Latest owner direction is studless construction bricks with pale metal/enamel, indigo recesses, burgundy service covers and cyan emitters; plastic, ceramic, fabric, glass and metal retain separate roles. Do not make every surface bare metal. |
| Faction names | Human Federation, Helix Mining, Riftjack, Aurelian | Source visual/lore labels only. Existing themes include Frontier Industrial, Aegis Naval, Helix Research, Corsair Salvage, Verdant Logistics and Umbra. In particular Helix Mining is not automatically Helix Research. |
| UI keybindings | Some sheets show TAB map, E heal or mismatched shortcuts | TAB changes view, E uses/exits stations and doors. View switching grants no piloting. |
| Vertical/exotic mechanics | VTOL, warp, teleport, gravity, cloak, psionics | Preserve visual concepts as proposed designs. Initial gameplay remains planar; new mechanics require their own design and authority tests. |

## Common physical style

Silhouette first, then structural courses, raised armor/service plates, seams/recesses, material response, lighting and finally small details. Smooth studless tops, small edge highlights and shallow fitted joins carry the look. No cylindrical studs, random exposed cubes, thick black border around each fine voxel or giant glowing halos.

Pale shells sit over dark indigo frames. Burgundy plates indicate service access. Copper/orange identifies selective utility or hazard details. Cyan technology must be luminous but still legible with bloom off. Crew quarters and medical rooms use warm neutral light; the nebula must not recolor the cabin. A pressure wall's decorative grooves must not create a leak.

| Family | Shape and material treatment | Reference emphasis |
| --- | --- | --- |
| Pale studless | Layered pale enamel/metal, indigo cavities, burgundy access plates, sparse copper and cyan | Core kit, human ships, crew, interior props |
| Industrial mining | Heavy braces, squared housings, orange panels, charcoal machinery, restrained scuffs/heat staining | Prospector, drills, refinery and cargo |
| Raider | Deliberate asymmetry, mismatched plates, red/black marks, spikes, chain, exposed orange conduit | Riftjack sheet, salvage weapons |
| Crystalline alien | Curved stepped arcs, crescents, pale shell, purple/cyan energy, crystal nodes and limited gold | Aurelian ship and alien parts |
| Stepped environment | Coherent rock/globe silhouette with discrete material relief, limited facets and purposeful emissive veins | Planets, ore, asteroids |
| Interface | Calm navy surface, clear type, thin cyan emphasis; red/amber/green states with a second non-color cue | UI kits and screen compositions |

## Blender source conventions

Use metric units and one Blender unit per metre. Start with dimensions and origin from the selected **refined** design specification, not a crop's pixel aspect ratio. Name objects `GEO-<semantic-name>` and group them under a stable asset root with `GEO`, `SOCKETS`, `COLLISION` and `LOD` collections. Save each meaningful part separately before any export batching.

Apply scale before bevel. For 1 m pieces, Astra suggests .02–.04 m bevels with two segments; smaller details use 2–5% of their smallest visible dimension. Preserve the authored mesh and material treatment in the visual export. Where gameplay requires solid sampling, use closed source/proxy solids and retain the sampled volume separately; the fine voxel pitch must not erase visual bevels by becoming the default replacement surface. Do not automatically apply the generic modeling skill's subdivision recipe to studless machinery; preserve flat faces, deliberate construction courses and bounded geometry.

Use oriented empty nodes for mounts, power/data/air/fluid ports, hand/seat anchors and effect origins. Names such as `SOCK_POWER`, `SOCK_DATA`, `HP_WEAPON_MEDIUM_01` and `FX_MUZZLE_01` in the briefs are proposed semantic names. Map them explicitly to actual project adapters (`handR`, `handL`, `back`, etc.) rather than asserting that every example name is already supported.

For elongated weapons show the useful broad face; a rail rifle viewed along its narrow edge is not a useful reference render. Rigged equipment must fit the actual 16 cm crew glove and current grip dimensions. Joint clearance and support-hand/muzzle anchors need in-game review.

## Material/export gates

- Portable Principled/PBR inputs: base color, metallic, roughness and emission color/strength. Use shared material families. Plastic/enamel generally starts near metallic 0, roughness .28–.42; exposed steel around metallic .8 with a controlled reflection. These are starting points, not an approved universal material file.
- Shared baked roughness/normal maps can add restrained finish. Procedural Blender node graphs do not automatically reproduce in GLB/Babylon.
- The current generalized sampler preserves constant Principled color, metallic, roughness and emission. Linked material inputs and transparent/transmissive materials must fail unsupported export rather than silently flattening them.
- Glass remains occupied, collidable and potentially pressure-sealing. A transparent pane needs material-preserving optical-boundary meshing and a supported rendering path; same-material internal glass faces and glass/air/glass/opaque interfaces require distinct handling. This gate is still pending.
- Export logical meshes/parts, not one mesh or collider per fine voxel. Preserve asset identity, source hash, palette and samples independently of GPU batches. Aim for few shared material slots; record actual primitive/material/texture costs rather than claiming fleet performance from a small scene.
- Export only intended geometry/rigs/sockets; no reference images, authoring lights/cameras or hidden scratch meshes. Check finite bounds, normals, transforms, manifold source solids, material preservation, collision, sockets, LOD and external GLB resources.

## Existing implementation to inspect during migration

TypeScript-generated model shapes in this table are legacy migration references. Reuse appropriate runtime adapters, identities, material contracts and gameplay rules; reconstruct replacement visual geometry and materials in Blender. The carried/worn equipment and Shipyard furniture paths are distinct.

| Area | Existing sources/recipes | Current limit |
| --- | --- | --- |
| Structural kit | `scripts/build_bulkhead_source.py`; `assets/source/bulkhead.blend`, `airlock.blend`; `npm run art:bulkheads` | 2 m interface, 2.5 m height, .03125 m sampling. Door artwork does not prove functional animation/atmosphere. |
| Engine | `scripts/build_engine_source.py`; `assets/source/engine_pod.blend`; `npm run art:engine` | Mount/thrust and resources require installation definitions; plume must reflect achieved thrust. |
| Furnished ship | `packages/content/src/voxel-wayfarer*.ts`; `scripts/build_interior_prop_source.py`; `npm run art:voxels` | Existing local art/collision fixture, not fully functional rooms or construction. |
| Sampling/meshing | `scripts/voxelize_blender.py`, `export_sampled_asset.py`, `mesh_sampled_asset.ts`, `packages/sim/src/voxels.ts` | Solid and material validation; unsupported optical/linked-material inputs rejected. |
| Surface finish | `scripts/build_metal_materials.py`, `voxel_visual_surface.py` | Preserve source/recipe hashes; validate Blender-to-runtime response. |
| Crew | `scripts/build_crew_source.py`, `build_crew_variants.py`, `packages/render/src/crew`; `npm run art:crew` | Existing modular rig/appearance proof; refer to latest crew docs for exact implemented clips and slots. |
| Equipment | `scripts/build_equipment_source.py`, `assets/source/equipment-kit.blend`, `packages/render/src/equipment`; `npm run art:equipment` | Twelve original visual preview assets and per-asset metadata; no inventory/combat grant. |
| Assembly editor | `packages/content/src/assembly.ts`, dashboard Shipyard | Fine placement snap is 1/32 m, independent of the 2 m tile. Asset IDs and placement UUIDs stay separate; unsupported drafts are preserved. |
| Planets/environment | `packages/render/src/environment`, `packages/content/src/environment.ts`, dashboard Planet Studio | Stepped visual bodies and authored presets; astronomical scale, landing and public discovery remain separate. |
| UI | `packages/ui`, `packages/canvas-ui`; separate client and dashboard composition | Use native components and existing input arbitration; apps keep independent entrypoints and releases. |

This library is **not** under `assets/runtime` and is not a runtime asset package. Do not publish owner references or draft reconstructions incidentally. Existing related source files are starting points, not evidence that a specific library revision has passed reference review.

## Capture and acceptance

Use the same asset/source revision and material configuration in Blender and Babylon. Record Blender version, asset and material hashes, export command, repository commit, actual viewport, camera azimuth/elevation/FOV, exposure/lighting, renderer and hardware/software rendering. Retain a neutral lit close view, actual gameplay angled view at fixed 35.264° elevation, overhead and optional material-debug/LOD comparison.

The same ship hierarchy must remain in both camera modes. Cutaway visibility is presentation and not an authorization mechanism. UI captures must show actual controls with visible keyboard focus and ordinary viewports; concept screenshots cannot satisfy this requirement. Review a single object, two joined modules, a corner/door transition and one furnished scene before accepting propagation of a style.

## Stats and size discipline

Each initial reference brief contains a starting profile, explicit dimensions and units, function, mass/health where meaningful, relevant proposed stats, sockets and clearance. **These are design proposals, not measurements or live values.** A UI glyph has no mass/health. An animation pose inherits its actor. A room or ship compiles mass, inventory, berths, power and other capacities from independently placed children; assigning it a second summed mass duplicates matter. A resource image cannot reveal its composition, amount, grade, value or permission to loot it.

Before final acceptance, choose an actual variant and replace generic proposals with validated dimensions/bounds, physical and inventory footprint, collision/interaction envelope, material IDs, socket transforms, mass/balance basis and approved gameplay definition linkage. Keep `approved-design` distinct from `implemented`. Health, damage, power/fuel/heat, capacity, prices, progression and access rules are never inferred automatically from rendered geometry or source labels.
