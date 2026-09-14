# Owner correction: continuous miniature planet surfaces

Status: Active owner direction; supersedes visible smooth ocean plus separate continent architecture
Date: 2026-09-08

The owner rejected the latest visible smooth ocean/glass atmosphere implementation as worse than the previous voxel globe. This direction supersedes conflicting recommendations in the earlier planet rendering design. All families and composable effects remain required, including temperate worlds with volcanic regions. Acceptance is visual comparison against the supplied concept sheet, not geometry counts alone.

- The sealing sphere is hidden technical support. A nearly continuous fine micro-voxel shell covers oceans, terrain and ice. Increase apparent granularity approximately three to four times over the rejected implementation. Water cells have nearly common radial height and coherent blue materials; water should read smoother without a polished sphere dominating the picture.
- Individual trees shrink to one quarter to one third of their current apparent size. Dramatically increase density using merged geometry or thin instances: forests should read as textured regions before individual trees are noticed. This supersedes the lead's earlier larger-tree suggestion.
- Continental masks combine low-frequency major landmasses, medium-frequency coastline complexity and high-frequency islands, bays and peninsulas. Temperate worlds need substantial continents, archipelagos, coastal fragments, mountains, snow and exposed rock instead of a few sparse islands.
- Quantized radial relief exists throughout land: shallow coastal cells, sand/rock edges, lowlands, rolling plains, hills, highlands, mountain chains and snowcaps. Add micro-cliffs and height variation; avoid flat plates with all relief restricted to shores.
- Cloud systems need approximately ten times the visual density and individual cells one quarter the size. Use tangential bands, spirals, overlapping clusters, weather-region variation and slight altitude variation. Avoid a few isolated white artifacts. Preserve a readable voxel cloud mass rather than replacing it with imperceptible flakes.
- Atmosphere is nearly invisible front-on and visible primarily at grazing angles as a soft cyan/blue Fresnel limb. Eliminate the visible enclosing glass sphere.
- Ocean roughness should be around 0.3–0.45 with a broad soft highlight. Remove the bright concentrated white specular dot. Keep subtle blue variation.
- Rich controlled biome colors include deep/medium ocean, shallow cyan, sand, light/dark grass, forest green, brown/gray rock, snow and blue shadows. Use several variants per major biome family without washing out saturation.
- Strong shared directional lighting must produce distinct bright/dark hemispheres and reveal tiny surface forms. Emission is reserved for appropriate lava/crystal/other effects, not ordinary grass or rock.
- The construction grid should not be the first thing the eye sees. Use irregular clusters, small height differences, stepped diagonals and restrained bevels. Mountains, ice, clouds and vegetation subtly interrupt the silhouette.

Intended hierarchy: globe → major continental masses → biomes → mountains/deserts/ice → coastline detail → forest clusters → individual tiny trees → tiny rocks/structures. The rejected hierarchy was globe → large flat islands → a few oversized trees.

Latest actual reference attachment ends `32da6083-3a04-49bb-bf80-e2c3e68d082e.png`; intended reference ends `c1a4f0b4-6d79-4e4c-b6a0-9acdced76ed8.png`. Original `reference/art/planets.png` remains the family/style reference. Real browser comparison is required before calling this accepted.

## Subsequent owner refinements

These refinements supersede the uniform tree and cloud size recommendations above. At close zoom, trees need substantially larger, puffy volumetric foliage; lower detail versions may reduce or omit individual trees. Forests should remain coherent at a distance.

Clouds need larger beveled cells forming deep irregular volumes, including rounded or drooping undersides extending toward the terrain. Avoid flat-bottomed floating plates. Weather must slowly form, change and dissipate, rather than only rotating a few fixed clusters. The atmosphere should read as soft blue-white lighting around the limb, without a visible glass shell. Water needs restrained sparkle and broad reflections without concentrated white glints.

High exposed cliffs should predominantly use layered stone greys and mineral variation, as in the reference, rather than uniform brown dirt. Reserve earthy brown for topsoil and low banks. Preserve rich deep blues and greens with directional shadows and backlighting.

Render procedural output to actual PNG textures and compare directly against `reference/art/planets.png` before accepting the look or advancing to the remaining style gallery. Latest comparison attachments end `b98abde3-eda8-4009-a688-d45c67ec6ddc.png` (actual) and `6c77e0f3-c96c-4b03-81ab-c06d61ae9c1a.png` (intended).

## Owner acceptance and next slice

The owner subsequently accepted the temperate direction: “Planets are now looking good.” Remaining refinements are a more light-blue halo and water specular highlights responding to the global light. The owner explicitly authorized continuing the other families and adding them to the game, widely separated if necessary, provided every destination remains accessible through Observe. The earlier hold on proceeding beyond temperate is therefore lifted; per-family rendered comparison remains required.
