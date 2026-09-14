# Planet form and material roadmap

Status: Owner-requested next-in-line work; not implemented or visually accepted
Date: 2026-09-08

This records the owner's per-family critique after viewing the complete comparison board. The active bounded pass is volcanic light spill/AO/sun shadows and ice optical materials. These broader changes follow that pass; they are not implied by functional generator coverage. Reference: `reference/art/planets.png`. Preserve actual/reference PNG comparisons at each gate.

## Shared hierarchy

Build a few recognizable planetary-scale decisions before adding detail:

1. Planet form: sphere, oblateness, major deformation.
2. Biome scale: continents, ocean basins, deserts, ice caps, chemical basins.
3. Hero geology: giant crater, canyon, mesa, mountain chain, crystal field, volcanic fracture, glacier.
4. Regional form: cliffs, valleys, ridges, archipelagos, forest areas.
5. Local detail: trees, rocks, small craters, voxel chips and shards.
6. Micro detail: restrained color variation, tiny displacement, AO and material noise.

The current tendency to jump from a sphere to evenly distributed local detail is a significant fidelity gap. Quiet regions and coherent macro features should replace unnecessary random detail, not merely add more geometry.

## Biome acceptance targets

| World | Required form and material identity | Main missing work |
| --- | --- | --- |
| Rocky | Battered, fractured miniature world; large terrain collapses and protrusions. Dusty regolith, exposed rock, dark cavity rock and sparse warm mineral seams. | Massive deep craters, broken shelves, cliff walls and fractures; severe cool-directional contrast with violet shadow fill and cyan night-side rim. Warm seams give subtle bounce, not a second lava planet. |
| Temperate | Readable continents, elevated forests and escarpments above deep ocean; clustered forest masses with individual edge trees. | Cleaner continental silhouettes, dramatic cliff islands and waterfalls; reflective/Fresnel water with cobalt depths/cyan shallows and coastline highlights; chunky floating cloud systems. Warm-white sun, cool cyan fill, tree contact shadows. Existing accepted temperate is an interim baseline, not completion of this new roadmap. |
| Desert | Huge quiet sand basins interrupted by gigantic sandstone mesas, canyon systems, rock towers and monumental ruin-like forms. | Stop uniform tan surface noise. Distinguish cream/peach sand, orange sandstone, rust rock, burgundy cliff shadow and purple-brown canyon depths. Low-angle warm star light with long cast shadows; thin irregular amber dust near the limb. |
| Ice | White snowy crust over a rich blue frozen interior; powder snow, glossy translucent ice, deep occluded cavities and crystal outcrops. | Optical separation, cold highlights, Fresnel/backscatter and depth tint; macro craters, glacial shafts, grouped elongated faceted towers and broad snow plains. Full transmission remains distinct from the bounded approximation. |
| Volcanic | Dark cobalt/charcoal reflective rock plates, cliffs and vents illuminated by connected white-hot lava rivers. | Lava proximity illumination, cavity/contact AO and sun-facing versus shadow-facing cliffs; white/yellow cores through orange/red edges, slowly pulsating ember spill, major plateau/crater/fracture hierarchy. Avoid brown uniform tiled rock and painted emissive stripes. |
| Ringed gas giant | Layered atmospheric flow: latitude bands, turbulent boundaries, local streaks and coherent large vortices. | Different band heights/opacity, bright sunlit magenta storm and forward/rim scattering. Physical broad translucent ring disk with density variation, gaps, dust and rocks; planet-to-ring and ring-to-planet shadows. Rings must cease reading as thin lines. |
| Ocean | Roughly 75–90% of visible surface is uninterrupted ocean; tiny but dramatic atolls, volcanic islands and narrow archipelagos. | Hero water with cobalt depths, blue shelves, cyan/turquoise shallows and pale beaches; stronger reflection than temperate, bright circumferential cloud bands/moisture haze, steep island cliffs and localized forests. Immediately distinguish islands from temperate continents. |
| Toxic | Fluorescent chemicals collect in low basins, fissures and lakes; dark formations rise above them, vents emit green-yellow gas. | Irregular volumetric fog banks that obscure and break the limb; towers, chimneys and craters. Acid yellow-green highlights, restrained green proximity bounce beneath cliffs and strong formation AO. Avoid binary lime/dark blocks and a smooth halo. |
| Crystal | Crystals are defining geology, not scattered decoration: 1–3 colossal groups, 5–10 major formations, medium crystals and tiny shards. | Large faceted/translucent bodies, saturated interiors, bright pink-white cores, Fresnel/specular response, transmission approximation and internal gradients. Size/visibility/falloff-aware magenta influence fields illuminate charcoal/grey-purple rock; selective bloom and a strongly broken silhouette. No point light per crystal. |

## Shared rendering capabilities

Each biome should be able to select directional star lighting and self-shadowing, local voxel/cavity AO, biome ambient/IBL, distinct material responses, occlusion-aware local emissive influence fields, atmosphere/material rim response, HDR tone mapping and selective bloom. These are reusable capabilities with different settings, not one generic halo/material across all worlds.

Separate actual irradiance from the appearance of an emissive surface. Lava, toxic basins and giant crystals should light adjacent visible forms through bounded influence fields. Avoid one dynamic light per voxel or crystal. Record approximation limits rather than describing a local field as full global illumination.

For optical worlds, distinguish specular reflection, a bounded backscatter/transmission approximation and true transparency/refraction. Ice needs a white shell with a blue interior; crystals need volume and bright cores. Broad post-process bloom cannot substitute for either.

## Review and performance gates

Render the actual Babylon planet to a PNG at a repeatable camera, seed, sun direction, exposure and resolution, beside its exact reference crop. Compare silhouette, macro/medium/local hierarchy, material separation, shadow direction, local light response and atmosphere. Preserve failed comparisons. Functional availability in Observe is a separate gate from visual acceptance.

Keep GPU geometry, draw calls, shadow refreshes, lights and texture budgets visible during the work. Optimize composition before increasing voxel resolution. The current ship performance investigation makes unmeasured additional render passes especially inappropriate.
