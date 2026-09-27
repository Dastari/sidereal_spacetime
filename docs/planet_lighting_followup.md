# Planet lighting follow-up

Status: Bounded priorities 1–3 and ice material pass implemented/reviewed; remaining priorities planned
Date: 2026-09-08

The owner explicitly resumed priorities 1–3 after the pause. Lava spill, local AO/contact shading and primary sun/self-shadow work are active; broader terrain and other lighting priorities remain backlog. A subsequent owner request separately authorizes a bounded ice optical/material helper. Existing functional family coverage does not establish visual acceptance. See the [pause and fidelity evidence](planet_generator_iteration.md#owner-pause--2026-09-08).

## Ordered priorities

| Priority | Planned result | Visual acceptance evidence |
| --- | --- | --- |
| 1 | Lava proximity spill / indirect illumination: adjacent terrain must visibly react to emission, including slow red/orange pulsation against cliffs. | With the sun and camera fixed, nearby cliff faces receive colored light that decays with distance; remote terrain stays controlled. Bloom alone does not satisfy this. Any bounded approximation must be identified rather than claimed as full GI. |
| 2 | Voxel ambient occlusion and contact darkness at block bases, crevices and stacked shelves. | Small forms remain grounded and readable without uniformly blackening the planet or painting broad unrelated shadows. |
| 3 | Primary directional sun and planet self-shadowing. | One coherent primary direction defines the lit hemisphere and casts readable terrain shadows; avoid double lighting and preserve the shared global sun. Existing hero shadow support is a foundation, not acceptance of the requested result. |
| 4 | Weak purple/blue image-based lighting and colored shadow fill. | Shadowed forms remain legible with cool color separation, without flattening directional contrast or washing out the surface. |
| 5 | Layered HDR lava: near-white core `#ffffcb` → yellow `#ffd43b` → orange `#ff7900` → red `#f32900` → dark rock. Requested intensity exploration: 4–12, under controlled tone mapping. | Connected molten networks have bright cores, thermal edge bands and visible surrounding rock detail. The values are planned look-development targets, not current recipe limits or implemented behavior. |
| 6 | Local HDR bloom around bright lava. | Glow follows active channels and their intensity, remains spatially bounded and depth-occluded, and does not replace surface illumination or wash out the globe. |
| 7 | View/normal Fresnel rim with hemisphere-dependent purple/red coloration. | The rim responds to surface orientation and viewing angle; it must not read as a blurred circular backdrop or enclosing glass sphere. |
| 8 | Contact shadows at terrain interfaces and object/surface contacts. | Cast contact relationships supplement priority-2 local occlusion without visible detachment, acne or excessive dark outlines. |
| 9 | ACES / exposure look development. | Preserve near-white hot cores, saturated colored falloff, cool shadows and readable dark rock in the same frame. Evaluate as a coordinated lighting response, not a global brightness shortcut. |
| 10 | Macro, medium and micro terrain hierarchy. | Large plateaus, craters, pillars and connected channels dominate first; medium shelves and fine voxels support them. A uniform tiled sphere remains a failed match. |

## Material requirements

Ice needs transparent and reflective ice regions with depth, contrasted against opaque bright snow. Blue coloring alone does not satisfy the request. Transparency, refraction/reflection and optical boundaries require explicit material/depth validation before acceptance; retain the large cyan pillar/cavity requirements already documented.

Volcanic cliffs should have less brown dirt and more cool cobalt/mineral surfaces with a metallic or reflective response. Slow red/orange lava spill must visibly play across those faces while preserving the primary sun and cool shadow fill. This is a planned material/lighting change, not a change already applied to the current assets.

## Constraints and review

Retain authoritative world positions, bounded geometry and light/shadow budgets, planet-local lighting scope, reduced-motion handling for pulsation, and the separation from externally owned equipment assets. The requested 4–12 HDR exploration exceeds the current recipe emission range of 0–4; any eventual contract change must be explicit and validated rather than bypassing validation.

On an owner-authorized resumption, compare actual runtime PNG textures against the recorded ice/volcanic targets at a fixed seed, camera and exposure. Capture direct emission, adjacent-face spill, AO/contact and primary-shadow behavior separately enough to identify what improved. Functional tests and an attractive glow alone do not establish reference art acceptance. Implementation and actual PNG evidence for the bounded priorities 1–3 and opaque ice material approximation are recorded in the [generator review](planet_generator_iteration.md#final-ice-shadow-sweep-and-bounded-handoff). Remaining priorities and full optical/terrain fidelity are not claimed implemented.
