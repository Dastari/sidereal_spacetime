# Ice-world optical material iteration

Status: implemented and compiled in actual Babylon rendering; material separation reviewed, full visual acceptance remains open.

Owner images compare a grey, uniformly tiled ice globe (`cf29ef78-9f26-4613-a6ff-da6aed25c9d7.png`) with a bright snow shell over deep blue/cyan ice ravines (`d1deb0ca-816e-4910-877e-340b15002944.png`). The exact wider sheet is `reference/art/planets.png`; `reference/PLANET_RENDERING_DESIGN.md` calls for separate snow/ice materials and physical highlights. These references are not runtime textures.

## Ownership

`ice-material.ts` and its tests belong to this bounded optical pass. The planet geometry owner controls `planet-terrain.ts`, `layered-planet.ts`, shared shadows and terrain splitting. Ship materials stay staged and paused; no equipment files or outputs are edited.

## Implemented material contract

`createIceMaterial(scene,name)` returns an opaque PBR material for exposed ice, retaining ordinary shared directional light and shadow evaluation. Roughness .21, dielectric IOR1.31 and restrained clearcoat provide sharper specular highlights than the separate rough snow batch. It requires the per-vertex `iceOptics` pair (normalized cavity depth, normalized thinness) supplied by the terrain generator. No overlapping sphere, light-per-voxel system or refraction sorting is introduced.

A bounded shader addition darkens deeper ice and adds cold grazing-angle/backlit-edge response plus a small shallow-cavity term. Deep thick cavities receive no added glow. This is explicitly a presentation approximation of scattering, not physical transmission, ray-traced thickness or volumetric subsurface transport. The existing sun direction is selected from the enabled hero key, game exterior key or studio preview key. The contribution is depth/thinness/local-angle dependent; it does not paint a uniform halo around the globe.

Two tests verify bounded directional/depth response, opaque PBR behavior and absence of added lights/geometry. Typechecking passes. Actual Babylon shader compilation passed with the generated optics attribute (207,108 vertices). `output/playwright/ice-optical-lighting.png` shows separate blue exposed walls and rough bright snow. The no-shadow diagnostic `output/playwright/ice-optical-no-shadows-diagnostic.png` removed the snow stippling, identifying shared-shadow acne rather than an optical-helper defect. The planet owner retains that shadow correction; residual stippling remains in the final shadowed confirmation. Selective bloom integration and the existing uniform halo also remain outside this helper. This is a functional material gate, not full reference fidelity acceptance. Material separation cannot by itself supply the target's large connected ravines, overhanging snow caps or tall ice formations; those macro terrain differences remain explicit geometry work.


## Actual integration and final shadow review

The actual Babylon material compiled with 207,108 exposed-ice vertices and 414,216 depth/thinness attribute values. Blue walls and deeper cuts now separate from the rough light snow batch. Both batches cast/receive the existing 1024 hero shadow map using the shared primary sun. `ice-optical-lighting.png` initially showed snow stippling; the no-shadow diagnostic isolated it to shadow bias rather than the optical helper.

The planet owner performed the fixed-view `.0015R`/`.003R`/`.006R` normal-bias sweep and selected `.003R` for ice only. `output/playwright/ice-bias-0.003.png` removes the objectionable stippling while retaining ridge/cavity shadows. Other families retain their previous bias. The selected material remains opaque: physical transmission/refraction, tall blue formations, connected ravines and the uniform halo gap remain open. See [the generator review](planet_generator_iteration.md#final-ice-shadow-sweep-and-bounded-handoff) for evidence and limits.
