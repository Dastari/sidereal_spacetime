# Ship molded-plastic finish: status and completion plan

Root assessment, 2026-09-09. The finish is partially installed. The complete reference appearance has not passed visual acceptance. This document supersedes the installation-status wording in older material study introductions; historical experiments remain preserved.

## What is actually active

| Area | Current state | Evidence / limitation |
| --- | --- | --- |
| Revised native R006 hull | `native-r006-polymer-04` derivatives installed for 15 assets / 23 placements | Current manifest and all canonical/client/dashboard GLB hashes rechecked and matched. Dielectric paint, clearcoat, rounded edges are present. |
| Native floor r002 | Its own mapped polymer materials, normal and packed occlusion/roughness/metal maps | Compatible with the goal, but not included in the hull finish substitution. |
| Native equipment | Preserved author materials, including pale enamel, indigo frames, steel, cushions, glass and emission | No common finish pass applied to all equipment. Authored role separation exists. |
| Approved cargo collection | Preserved author materials/variants | Enamel and metallic frame choices differ from the hull palette. Not remapped by the hull finish installer. |
| Older ship structure/engines | Existing export/material treatments | The first legacy structural plastic experiment was staged and never accepted/installed. It does not affect the native hull loader. |
| Renderer | Babylon PBR, HDR environment, directional sunlight, filtered shadows, native GLB materials | These capabilities are active. A new universal plastic shader is not waiting to be switched on. Shared appearance is not yet calibrated across asset families. |

Direct file audit: hull paint metallic0, clearcoat0.16; red paint metallic0, roughness0.29, coat0.12; seals roughness0.60. The hull's scalar roughness0.60 multiplies the packed texture's130/255 channel, giving **effective roughness0.306**. Reading the scalar alone incorrectly diagnoses this as matte paint.

The native floor likewise has scalar metallic1/roughness1 because its packed texture supplies the values. Decoding that texture gives mean effective roughness0.350 and metal0.0037 (localized metallic details remain). It is predominantly dielectric polymer, not a fully metallic floor. These are texture means, not a visual quality score.

Representative equipment enamel is metallic0.05/roughness0.36, indigo frame0.10/0.48, cushions0/0.82; representative cargo enamel0.08/0.32 and frame0.40/0.36. These numbers show independently authored finish families. A metal cargo frame is not intrinsically wrong; roles need intentional shared definitions.

Current renderer support retains environment intensity0.28, sun specular0.30, sun radius0.04 and1024 PCF-low shadows. These settings are not proof of adequate highlight composition. The installed finish adds25,632 placed triangles over approved R006; the often-cited1,008 is only the final increment over an intermediate rounded study. No new hardware-FPS claim follows from either count.

## Why the whole ship still does not read like the reference

The actual study04 game-lighting image shows softer front armor/vent borders, while broad surfaces still read flat. Its close and whole-ship comparisons explicitly describe a restrained gain. The finish work has progressed as several isolated material/bevel studies and a scoped hull installation; it has not completed one sustained ship-wide acceptance pass.

There are three related gaps:

1. **Coverage and consistent roles.** Hull, floor, cargo, equipment and older structural exports retain independent palettes/roughness/metal conventions. Each is individually valid GLB art, but their combined finish has not been reviewed as one kit.
2. **Highlight-bearing geometry at play scale.** Study04 adds20mm, three-segment front-edge bevels to23 prominent native surfaces. Most large faces and older structural geometry retain their previous shapes. Fine bevels can improve a close-up while contributing little at the ordinary camera distance. Normal maps help small relief; they cannot supply a rounded silhouette or a manufactured edge that occupies visible screen space.
3. **Lighting and contact definition.** The game needs a controlled key/reflection response that describes those curves, with clear seams/contact shadows and restrained fill. Broad ambient or user brightness boosts do not establish material separation. The recent Graphics controls are player display preferences, not completion of the art direction.

## Compatibility with other Blender work

Continue native Blender modeling. Its editable geometry, separate materials, UVs, normals and preserved GLB export are the correct foundation. The work does not need a blanket rebuild. Collision, fitting, rig sockets, equipment UUIDs and inventories remain independent of a finish revision.

The integration risk is inconsistent authoring, not Blender: sharp panels with no usable bevel, painted panels assigned metallic response, baked strong highlights/dirt, unbounded bespoke materials, or replacement exports silently losing the selected finish. Conversely glass, rubber, fabric and exposed machinery should keep their distinct response; setting every surface to the same glossy plastic would also fail the reference.

For future deliveries, require the existing reference's material families (light/mid/dark/accent polymer, bare metal, rubber, fabric, glass and emitter) and meaningful bevel profiles on visible edges. Use shared Blender master materials/node groups, then preserve native GLB PBR channels and material-role metadata. Faction colors and clean/worn variants remain explicit. Keep painted materials dielectric by default; map actual bare-metal components deliberately.

## Concrete next pass

The root integration continuation is delegated to `/root/integration_continuation`; root is responsible for this visual/material assessment. The next dedicated finish pass should have one acceptance target, not another isolated roughness experiment:

1. **Freeze a representative kit:** one native hull/shoulder panel, one floor, one interior wall, one couch/seat and one cargo pod. Pin their current source/export hashes and preserve approved originals.
2. **Calibrate one shared source material library** against the existing technical reference. Start with polymer roughness0.28–0.36, metallic0, IOR1.46 and subtle coat; use role-specific ranges and restrained variation. Validate effective packed texture channels, normals/tangents, transmission and emission after GLB export. These starting numbers already largely exist on the hull; geometry/light response must be judged alongside them.
3. **Resolve visible edge and light response together:** matched baseline/candidate frames under the actual ship sun/environment, both ordinary play zoom and close-up. Adjust only bounded presentation/authoring variables, preserve mating surfaces and keep black/white highlight clipping under control. Include contact/shadow inspection and full scene costs.
4. **Require a plainly visible combined-kit gain.** All five representatives must look like parts of the same manufactured miniature. Painted parts have broad controlled highlights and rounded edge response; metal, cushions and glass remain distinguishable; creases have depth; colors retain saturation. More triangles or valid PBR properties alone do not pass.
5. **Roll out the accepted role/edge treatment** through native source derivatives across remaining ship assets, with exact revision mappings and in-game screenshots. Preserve gameplay state and source approval history. Shared compatible materials, batched geometry and texture-based microdetail keep performance bounded; no point light or draw call per bevel/detail.

Review references: `reference/Astra_Voxel_Space_Game_Art_Technical_Design.md`, `reference/art/3d-rpg-after.png`. Existing actual evidence: `assets/art-library/shipyard-hull/material-studies/native-r006-polymer-04/runtime-candidate-bow.png` and `runtime-candidate-whole.png`. Final owner art sign-off remains absent. This status assessment does not claim the full visual target is delivered.
