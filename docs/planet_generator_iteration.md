# Procedural planet generator iteration

Status: Bounded lighting/material pass implemented and reviewed; broader art work paused; significant fidelity gaps remain
Date: 2026-09-08

## Controlling art direction and review gate

Sources inspected: `reference/art/planets.png`, RPG/top-down before/after images, the environment sections of `Astra_Voxel_Space_Game_Art_Technical_Design.md`, `PLANET_RENDERING_DESIGN.md`, and the owner's successive actual-versus-target attachments. Latest owner corrections supersede the earlier smooth-ocean recommendation: a continuous fine voxel surface must dominate ocean and land; small dense forests, stepped coast hierarchy, saturated blue/green palettes, directional form shading and nearly invisible frontal atmosphere are required. The latest cloud correction supersedes the earlier tiny-cell instruction: larger beveled cloud cells, deep connected masses extending toward the surface, and fluffy volume take priority over thin fine plates.

Mandatory acceptance gate: save actual rendered procedural planet crops as PNG textures, inspect beside `reference/art/planets.png`, record gaps, and do not advance a family merely because geometry tests pass. These are actual Babylon output, not replacement concept illustrations. Runtime remains 3D.

## Implemented contracts

`packages/content/src/environment.ts` supplies validated version-1 recipes, ten base families (temperate, ocean, desert, rock, ice, volcanic, toxic, gas, crystal, moon), integer seed, nine-color palette, bounded resolution, terrain/mountains/sea/cloud/radiance/ring controls. Independent effects control vegetation, volcanic coverage, crystal coverage, smoke and atmosphere, including mixed temperate/volcanic recipes. Defaults are starting values, not fixed meshes.

`planet-terrain.ts` samples a shared seeded continental mask on six cube faces. Low-, medium- and fine-frequency structure creates coast variation, quantized elevations and microvariation. Ocean cells have close radial heights and depth palette bands; a smaller closed core seals the surface. Land emits terraces, cliff bands and selective tiny bevels. Exact neighboring cube-face cell centers avoid mismatched seam sampling. Geometry arrays stay merged; no cell has a scene object or authoritative collision.

Each surface output has a hard 110,000-face bound. Projected-radius LOD uses 96/32/16 nominal cell detail with hysteresis; expensive high-relief recipes deterministically retry at 75% resolution down to 24. Actual detail and budget reduction are reported in Genesis, rather than leaving blank bodies or swallowing errors. Current generation is synchronous. Legacy N³ meshing and its six-entry cache remain for compatibility; the new layered path does not claim that cache or asynchronous generation.

Forests have up to 2,400 deterministic radial candidate anchors. Normal LOD uses small .0105–.021-radius trees; close LOD samples at most 400 anchors and scales trees 4× with additional puffy branch crowns, bounded to 38,400 triangles. Distant LOD omits individual trees. This implements the latest owner correction that close trees should be much larger, superseding uniform tiny trees. Face quotas prevent early cube faces consuming the entire population. Crystal deposits use actual tapered hexagonal prisms and pointed tips, bounded to 400 placement inputs / 1,200 crystals. Lava and crystals have separate emissive materials. A quarter-resolution glow includes only emitting meshes; at most two planet lights exist per environment, one per emitting body, range three radii and intensity at most .6. Light mesh inclusion excludes ships and crew.

Clouds use connected scalloped weather systems, evolving multi-lobed radial volume, drooping irregular undersides and beveled cells (six faces, twelve bevels, eight corner triangles). Geometry has a 108,000-triangle public budget; the current ellipsoid-billow implementation stays below 90,288 triangles without truncating later systems, merged into one batch. Shaded undersides approximate volume lighting; this is opaque stylized geometry, not participating-media ray marching. Smoke reuses independently seeded geometry and a separate translucent material. Weather rotates locally in stepped time and changes actual shape/density/extent from deterministic elapsed-time phases. Only the weather batch rebuilds every eight seconds; cell-local seeds preserve continuity. Reduced motion freezes formation and drift. Trees/clouds/crystals all share one explicit outward-winding conversion at Babylon upload.

Authored palette and helper colors are sRGB. Babylon's PBR shader multiplies vertex colors directly into linear albedo, so geometry upload converts RGB to linear and preserves alpha. This corrected a confirmed washed-out appearance. Ocean uses .4 roughness and restrained environment reflection. Planet sun direction agrees with ship exterior lighting. Atmosphere now uses a soft additive halo plane through the body center, depth-occluded by the opaque planet: there is no enclosing sphere surface. Visual refinement remains under review.

## Local authoring and world truth

Independent dashboard route `/planets` exposes recipe parameters, palette, seed, effects, local JSON import/export and a ten-family comparison. Import validates size and schema and preserves drafts on failure. There is no live publication. Render bodies always use permitted authoritative rows and true relative world positions: X = worldX − originX, Z = −(worldY − originY), Y = body height. Same-ID recipe/appearance changes rebuild meshes. Observer focus moves only the camera toward admitted body coordinates.

Star dust is 576 world-cell-seeded instances with rectangular coverage adapted to view extent/aspect. Motion uses replicated velocity: ordinary 27.7 m/s flight retains cubic grains; short trails begin at 40 m/s, with aspect ratio 2 at 100 m/s and 3 at 160–600 m/s. Long streak response begins at 600 m/s and reaches its full style at 3,000 m/s. Those speeds are presentation thresholds, not newly granted propulsion capability. Reduced motion suppresses streak response. The directional sky blends an overhead-dense composition with the RPG direction; viewport height controls star readability. These effects do not invent gameplay warp or camera-relative planets.

## Texture evidence and rejected iterations

Review browser uses the required `http://sidereal.tail7a58a6.ts.net:5174/planets`; game review uses port 5173.

- `output/playwright/planet-shell-pass1.png`: continuous fine shell exists, but pale colors and sparse white flakes fail the target.
- `output/playwright/temperate-texture-03.png`: actual cropped 96-cell output after sRGB correction. Deeper ocean/green colors improve substantially. Clouds remain elongated plate forms, so this pass is rejected. Later cloud geometry adds substantial downward depth, bevels and multi-lobed masses; acceptance requires a new actual texture.
- Early `genesis-ten-families.png` proves family selection only. It does not establish current all-family visual acceptance.
- Root's earlier live deck capture showed the real admitted Amethyst body behind the ship, confirming actual world placement and visible geometry. The new layered branch still requires a final actual-game observation capture.

## Validation and remaining limits

Focused tests cover deterministic geometry, finite arrays, outward winding, index and triangle bounds, true cross-face seam mapping, small radial tree placement, beveled cloud volume, all solid families at high/default/extreme relief with deterministic detail fallback, composable deposits, and projected LOD hysteresis. Updated cloud/tree counts are explicit changed budgets, not silent removal of checks. Typecheck passes after the current geometry revision; root coordinates full `npm run check` and build.

Not claimed complete: matching every source family through the mandatory texture gate, true cloud participating-media scattering, dithered LOD transitions, workers, Blender authoring/export validation, landing, installations, mining or physical water. Source reference images remain untouched. Final screenshots and acceptance decisions must be appended after inspection.

## Texture gate updates

- `temperate-texture-04.png`: deeper beveled columns, but white tops still tiled; rejected.
- `temperate-texture-05.png`: coherent lobe footprint and PBR translucency approximation improve mass shape, but expanded atmospheric radius exposes a hard shell; rejected and expansion reverted.
- `temperate-texture-06.png`: each cloud column now consists of radial stacks of nearly cubic beveled cells, not a single tall extrusion. The enclosing atmosphere ring is removed. Remaining gaps: clouds sit too far above the surface and lack cohesive coverage; forest/cliff light and shadow still lack the source's strong depth. This pass is also not accepted, and other-family visual acceptance remains pending.

At this point all 28 environment tests pass; after the latest radial-stack edit, the three cloud tests pass again. The browser reports 96-cell detail and 94,762 land faces for the seed-17 temperate review. The earlier 32-cell status was stale UI metadata; status now refreshes when LOD changes.

## Current shadow/lighting iteration

The nearest hero globe now has one dedicated directional key and 1024 shadow map aligned to the shared primary sun. Its material receivers and casters include only that globe. The same meshes are temporarily excluded from the original sun to avoid double lighting; switching targets or disposal restores exclusions. Tests verify isolation, nearest selection, allocation size and cleanup. No ship shadows or room fixture scope are changed. High exposed cliffs now use cool grey/slate mineral strata while low banks/topsoil remain brown. Next texture inspection is pending the managed build.

- `temperate-texture-07.png`: actual hero shadows, 800 larger trees and stone cliffs improve surface depth. Cloud layout still resembles aligned keyboard keys, so this pass is rejected. The subsequent revision replaces that layout with six overlapping 19-cell ellipsoid billows per system, each independently oriented and staggered in radial height. Continuous phase changes affect billow extent and placement. No family is accepted from the rejected plate images.

`temperate-comparison-07.png` is a real browser comparison board with texture07 on the left and the temperate crop of `reference/art/planets.png` on the right. A supporting heuristic samples HSV within central elliptical masks and hue-selects water/vegetation: source versus texture07 median V is .573/.369 for blue, .416/.349 for green, and .988/.667 for neutral bright cloud pixels. Green median saturation is .642/.632, supporting the observation that linear-color correction repaired much of the palette saturation while material brightness remained too low. These image statistics are diagnostic, not a substitute for the visual acceptance gate.

The next material revision keeps primary and hero sun intensity equal, and adjusts direct response consistently across LOD: terrain 1.45, water 1.9, cloud 2.4. Specular remains restrained and water roughness .4. Actual texture08 is still required to judge the result. Explicit low-resolution recipes now cap every LOD rather than silently forcing a minimum 48-cell hero.

- `temperate-texture-08.png`: actual19-cell ellipsoid billows remove the coplanar keycap artifact; brighter cloud highlights, stronger surface exposure and a soft halo behind the planet improve the comparison. Remaining gap is uniform contour staircases and oversized central landmass. The next terrain revision decouples plateau height from continental shape, uses taller mineral shelves/ridged chains, and raises temperate sea threshold to .515. Seed17 retains96 cells at85,306 land faces plus34,469 water faces. Close forest samples at most400 larger trees. Default weather drift is now .006 rad/s, with independent slow formation evolution. Texture09 pending.

## Actual weather continuity verification

`output/playwright/planet-weather-runtime-audit.json` records a real browser `onAfterRenderObservable` observation across the eight-second weather replacement. Over 38 observed frames, cloud mesh identity changed and sampled local vertices moved .000754 planet radii. Rotation continued from .0252 to .048 radians, the terrain mesh identity remained stable, and the replacement weather appeared in the active hero shadow caster list. A preliminary polling capture returned too early; its image is explicitly named `temperate-weather-pre-update.png` and is not evidence of the replacement.

Final water refinement adds at most96 globally selected ocean-cell point glints, each fixed at two screen pixels, with view/sun half-vector response and slow twinkle. They exist only at hero LOD, respect reduced motion, and never create scene lights. Water reflection intensity is .3 at .4 roughness. The soft halo is stronger cyan-white while remaining a depth-occluded plane. Preview key/fill/specular/HDR settings now match the actual game's primary lighting settings. These final changes await texture10 review.

## Accepted temperate and authored family review

The owner accepted the temperate result after texture09 ("Planets are now looking good"). `temperate-texture-10.png` verifies the final light-blue halo and global-sun water reflection/glints without a visible enclosing sphere. The accepted terrain and cloud architecture are retained.

The first current-family texture gate uses the exact authored world seeds: `family-ocean-73.png`, `family-desert-29.png`, `family-rock-101.png`, `family-ice-47.png`, `family-volcanic-89.png`, `family-toxic-61.png`, `family-gas-38.png`, `family-crystal-113.png`, `family-moon-137.png`, plus temperate seed17. All are actual Babylon browser renders captured through the required tailnet dashboard, not synthetic concept images. Each was inspected against `reference/art/planets.png`. Ocean retains coherent open water, raised coasts and cloud volumes. Rock/moon craters and crystal protrusions read correctly. However, dry-family relief remains too evenly distributed compared with the reference's concentrated mesas, the volcanic channels need greater radiance, and the gas giant lacks bright band/vortex contrast. These are recorded as iteration gaps rather than accepted source matches.

The next bounded revision adds independent quantized mineral shelves and localized mesas to solid families, strengthens actual lava emission, and introduces a seeded evolving gas storm plus brighter bands driven by the primary sun. Opaque globe meshes now participate as black depth occluders in their deposit glow mask, preventing rear deposits bleeding through the surface. The accepted temperate/ocean elevation path is unchanged. A second actual texture gate is required for these changes.

Server-authored appearance keys now resolve through `planetRecipeForAppearance`. The ten base family keys and legacy aliases select consistent surface, ring and halo recipes. `temperate-volcanic` selects a validated temperate recipe with volcanic coverage .15, smoke .12 and emission 2, allowing the authoritative EmberGarden test body to demonstrate composition without client-authored world state. Mapping tests cover all keys and deterministic mixed effects.

`planet-family-comparison-first.png` / `.html` place each actual family beside its source crop. This board made the weak dry-world vertical hierarchy and gas contrast especially clear, so the first dry/gas pass is not the final gate. The concentrated-mesa revision still passes all five terrain regressions, including high-detail extreme recipes for every solid family. The full focused environment/content gate currently has 36 passing tests.

Actual-game acceptance: UI agent rendered the server-authored EmberGarden at 7.99 km using Observe (`output/playwright/ui-catalog-observe-ember.png`). Inspection confirms the real mixed temperate/volcanic body, forests, clouds, smoke and glowing channels are visible. The UI agent verified all 12 destination entries and Return-to-ship while authoritative character, ship and inventory rows remained unchanged. This closes the original invisible-at-authorized-position integration issue; it does not imply landing or travel teleportation.

## Second family gate and final review evidence

`family-{style}-{seed}-second.png` records the corrected desert 29, rock 101, ice 47, volcanic 89, toxic 61, crystal 113, moon 137 and gas 38 output. Each actual PNG was inspected. Compared with the first board, concentrated shelves provide stronger vertical breaks, toxic dark mineral caps separate from bright lowlands, and orange volcanic fissures read clearly against the dark crust. Crystal spires and cratered moon identity remain intact. The gas giant has brighter pink/violet bands, a seeded evolving storm and full-ring framing. `planet-family-comparison-final.png` and its HTML source place these results beside the unchanged source crops.

This is a working reference-informed family set suitable for the authored in-game test catalog, not a claim of exact source reproduction. Remaining art differences: the reference uses more dramatic isolated rock towers, larger crystal clusters, more prominent gas storm eyes and ring debris; our gas storm is subtle from the default angle. Temperate alone has explicit owner visual acceptance. All families now have actual comparison evidence; no test-only or first-pass placeholder is presented as the final render.

`family-temperate-volcanic-157.png` verifies the exact EmberGarden mixed recipe in Genesis. The normal UI imported its authored JSON and exported `ember-garden-export.json`; structural equality with the authored recipe passed, including volcanic .15, smoke .12, emission 2 and seed 157. `genesis-final-desktop.png` and `genesis-final-compact.png` show the real dashboard at 1440 and 640 pixels. The mixed recipe honestly reports 72 cells (budget adjusted) and 76,107 exposed terrain faces instead of claiming the requested 96. At compact width the controls flow below the globe and remain scrollable. The generator stays a local art-draft workflow.

Current focused validation: 36 tests across 10 environment/content suites; subsequent concentrated-mesa revision again passes all 5 terrain tests, and typecheck passes. Root coordinates the final repository-wide check/build and authoritative catalog smoke. Browser session `planet-final` is left blank when GPU ownership is released.

### Parent review decision: functional family coverage passes; art match remains open

The parent inspected the final comparison board and accepted functional family coverage for the in-game test catalog. It did **not** accept rock, ice, volcanic, toxic or crystal as reference art matches. Preserve this distinction in release summaries:

- Rock: too few clearly readable craters and insufficient isolated macro rock towers/mineral outcrops.
- Ice: fine blue/white cells are present, but macro ice ridges, deep crevasses and crater structure remain too weak.
- Volcanic: emission remains thin and disconnected compared with the reference's wide, continuous molten networks and surrounding radiance.
- Toxic: dark mineral shelves improve contrast, but actual volumetric gas depth/coverage is missing; current smoke and translucent voxel clouds are a bounded surface approximation.
- Crystal: protrusions are genuine emissive prisms, but clusters are too small and sparse relative to the reference's dominant large crystal formations.
- Gas: bands/rings are functional and animated, but the storm eye remains subtle and the ring lacks reference debris structure.

These are future focused planet art iterations, separate from externally owned equipment models. The second texture gate is a documented comparison and functional review, **not** all-family art completion. The previously owner-accepted temperate result is retained.


## Owner pause — 2026-09-08

The owner is happy to leave the planets as they are **for now** and explicitly paused further planet implementation. Retain the current runtime, recipes and authored test catalog. This pause is not visual acceptance of the unfinished families, and no further planet code, asset or browser iteration is authorized by this handoff alone. Resume focused planet art work only when the owner requests it. The earlier temperate acceptance remains valid; functional family coverage and open art acceptance must remain separate.

The latest owner comparisons were inspected directly. They show **significant**, not minor, fidelity gaps, especially for ice and volcanic worlds. A uniform small rectangular tile texture still dominates both actual planets, while the targets depend on large, legible forms and strong material/lighting contrast.

| Family | Actual-versus-target gap to preserve for a future iteration |
| --- | --- |
| Ice | The actual globe reads as a blue/grey tiled sphere with shallow shelves. The target has large saturated cyan ice pillars and ridges, deep cavities/crevasses, overhanging snow shelves, and strong bright snow versus dark blue cavity contrast. Small surface cells do not substitute for this macro geometry, depth or silhouette breakup. |
| Volcanic | The actual globe has thin, often disconnected yellow/orange lines across a regular dark tiled shell. The target has connected branching molten networks with substantial width, near-white hot cores, orange/red falloff and local radiance; large plateaus, towers and craters separate the flows, with smoke above active areas. The current emission pattern, macro terrain and smoke remain substantially short of that target. |

Latest comparison evidence (owner attachments; reference images remain unmodified):

- Ice actual: `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-cf29ef78-9f26-4613-a6ff-da6aed25c9d7.png`
- Ice target: `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-d1deb0ca-816e-4910-877e-340b15002944.png`
- Volcanic actual: `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-1aad0298-a03a-4efd-8f90-568a997588f6.png`
- Volcanic target: `/root/.t3/userdata/attachments/efaf3d5e-6a61-4702-9019-23e1be66416c-0d24f659-5c71-473c-abc4-302f2504d9df.png`

Any future resumed iteration must retain the actual-render-to-PNG comparison gate and assess macro structure, molten connectivity, material contrast and smoke volume against these targets. Do not report all-family art completion from functional tests, the owner pause or the existing second comparison board.

The owner's subsequent ordered lighting/material priorities are recorded in [Planet lighting follow-up](planet_lighting_followup.md). That specification is **planned, not implemented**. Clarification about resuming only priorities 1–3 versus leaving the list in backlog is pending; the owner pause remains in force.

## Bounded resumption: lava spill, AO, primary shadows and ice optics

After the pause, the owner explicitly resumed lighting priorities 1–3 and separately requested an ice optical/material pass. This supersedes the pause only for that bounded scope. Macro terrain redesign and the other lighting priorities remain backlog; the significant fidelity gaps above remain open.

The current unaccepted lighting revision adds a merged lava irradiance overlay to immediately adjacent cliff faces. Source adjacency limits leakage across terrain; facing and distance attenuate the contribution up the cliff, with slow bounded pulsation and no extra scene lights or per-frame geometry regeneration. This is a local surface-neighbour approximation, not a general GI solver. Height-neighbour occlusion darkens enclosed top cells, and height within a cliff band controls contact-base darkness. These changes target ice, volcanic and mixed lava recipes, preserving plain temperate appearance. The existing single hero sun shadow map retains the shared primary direction, with tighter bias and medium PCF filtering.

Ice now separates opaque snow tops from exposed ice/cavity geometry within the same total terrain budget. The independent ice material helper consumes per-vertex cavity depth and edge thinness, retaining direct PBR lighting/shadows while adding bounded cold rim, backlight and depth response. It remains an opaque optical approximation; transparent/refractive ice is not claimed implemented. Actual browser compilation and ice/volcanic PNG comparisons are required before accepting this revision.

### First bounded lighting comparison

`volcanic-lighting-spill-on.png` and `volcanic-lighting-spill-off.png` are actual same-view runtime captures. The on image shows orange irradiance reaching adjacent cliff faces; disabling only the merged spill overlay removes that contribution while retaining the molten surfaces. This verifies local surface response, not general GI or completion of the connected molten-network target.

`ice-optical-lighting.png` compiles and renders the new exposed-ice material with blue walls and deeper cuts distinct from lighter snow. Runtime audit `planet-lighting-runtime-audit.json` confirms 207,108 ice vertices, 414,216 optics values, active casting/receiving in the single 1024 hero map and the normalized shared primary sun direction. However, tighter shadow bias introduced visible fine acne on snow. `ice-optical-no-shadows-diagnostic.png` removes the artifact with shadows disabled, identifying its source. The tighter bias/filter experiment is rejected; previous bias `.0005`, normal bias `.0008 × radius` and low PCF are restored. A clean final ice confirmation remains pending; the no-shadow diagnostic is not the intended shipped lighting.

The independent ice helper passes its functional material separation gate. It does not solve macro ravines, tall cyan columns, true transmission or the uniform halo limitation. See [ice material iteration](ice_material_iteration.md) for the helper's review record.


### Final ice shadow sweep and bounded handoff

The restored `.0008R` normal bias still left visible stippling, so `ice-optical-lighting-final.png` is **not** labeled a clean result. A controlled runtime-only sweep kept seed47, camera, sun, geometry and shadows fixed, changing only normal bias: `ice-bias-0.0015.png`, `ice-bias-0.003.png`, `ice-bias-0.006.png`. Inspection selects `.003R`: `.0015R` retains objectionable stippling, while `.006R` provides no useful improvement over `.003R`. The selected frame retains ridge/cavity shadows and removes the objectionable fine pattern. Fine voxel edges and regional aliasing are not claimed eliminated at every view or LOD.

Production uses `.003R` **only for ice**. Other families retain `.0008R`, preserving accepted temperate shadow behavior. A regression verifies switching ice/temperate targets restores the appropriate offset while retaining the isolated 1024 shadow map and primary-light exclusion cleanup. No shadow disabling or extra shadow allocation is used in the selected result.

Bounded outcome: actual adjacent-face lava spill, local terrain contact shading, shared-sun caster/receiver verification, and separated snow/exposed-ice material response are implemented and reviewed. `ice-bias-0.003.png` and the volcanic spill on/off pair are the final evidence for this scope. They were assessed against the recorded owner ice/volcanic targets; the missing macro cyan pillars/ravines, molten-network hierarchy, true ice transmission and broader atmosphere/HDR targets remain substantial open art work in [the next-pass roadmap](planet_next_passes.md). This closes the bounded lighting pass, not family reference-art acceptance.

### Observe integration audit and native draft restart — 2026-09-08

The current served game module contains `createIceMaterial`, ice geometry attributes,
lava proximity spill and the ice-specific hero shadow bias. The owner's latest tiled
ice screenshot is consistent with that implementation: bounded optical improvements
were integrated, but the missing macro ice formations were never implemented or
accepted. A stale deployment is not established by that screenshot.

Observe now owns separate orbit and eased zoom state, including vertical right-drag
orbit, with no changes to authoritative body/ship positions. Return preserves ship
camera preferences. Character/Inventory retain keyboard blocking; pointer blocking
is limited to their actual window bounds/capture, while the menu remains modal.
Typecheck and six camera tests passed. Real tailnet App entry/navigation was captured
in `output/playwright/observe-navigation-fresh.png`; the next software-GPU screenshot
stalled, so actual open-window wheel/drag/Return verification remains pending and is
not claimed from the pure tests.

The owner explicitly resumed a persistent reference-fidelity goal. Native Blender
ice draft r001 is tracked under `environment.planet.ice`, covering only
`planets--ice-world`. It tests broad white crust masses, deep connected blue clefts
and grouped tall faceted ice shafts. Editable source and native GLB remain isolated
review artifacts; no existing live planet asset or geometry path was replaced.
Blender is the new visual source; legacy TypeScript surfaces remain migration
references. Each meaningful actual renderer PNG is submitted to root for critique;
root review does not substitute for exact owner publication approval.


Native ice r001 and r002 are **failed exploratory drafts**, preserved in the art
library ledger. r001 (20,254 triangles) produced detached low-poly crust plates;
root rejected it. r002 (438,062 triangles) restored a connected surface but produced
an excessively uniform staircase and small dark cavities, so it also fails visual
and geometry-budget goals. Both PNGs are actual Blender Cycles renders, not Babylon
captures. Neither is integrated or published. Next hypothesis is an authored modular
crust/cavity/ravine kit with matching boundaries and seeded runtime composition;
root critique and actual runtime evidence remain required before acceptance.

Observe followup browser gate **passed** at the required tailnet URL, 960×640.
`output/playwright/observe-ice-character-actual.png` is the actual WebGL scene with
Frost Ice and an open, dragged Character window. The numeric audit is
`output/playwright/observe-input-proof.json`: outside-panel wheel/right-drag changed
radius 350→216.574 and both orbit angles; identical input inside the panel and behind
the menu left the camera unchanged. Return restored radius, elevation, target and
azimuth modulo 2π. The complete subscribed character, ship, inventory-item and
space-body snapshots remained byte-identical. During numeric pointer checks only,
3D drawing was paused and actual UI DynamicTexture readbacks were used; the final
PNG resumed the genuine scene renderer. This resolves the earlier pending browser
gate without treating a UI readback as a scene screenshot.

Native r003 hero-shelf unit (3,304 triangles, five material roles) has root approval
of the **working direction only**: white crust now visibly sits on connected blue
interior walls. Next requested refinement: irregular thickness, two or three wall
ledges, broader broken outcrops and varied-height shaft groups. Then produce several
compatible kit variants and at least two distinct seeded composed ice worlds before
advancing family. Unit render/source/export and root feedback remain in the ledger;
no final owner art approval or publication is implied.

### Live axial rotation — 2026-09-08

The owner requested slight rotation of the existing live planets. A render-only
local axial pivot now rotates each solid planet's terrain, trees, deposits and
attached effects together under its existing tilt. Gas worlds use the same pivot;
clouds/gas retain their independent weather drift, replacement clouds rejoin the
pivot, and rings retain their authored plane instead of precessing with a new
world-axis rotation. Atmosphere billboards remain on the body frame.

Seeded rates are 0.006–0.010 radians/second in a stable seeded direction. Phase is
computed from a monotonic presentation clock rather than accumulating rotations per
frame. Reduced motion, hidden tabs and disabled environment presentation freeze it;
resuming does not jump forward through paused time. Rebuilt LODs use the same clock.
No authoritative body heading/position or Observe camera state is changed.
Three math tests cover 2/30/60/144 FPS agreement, pause/resume and phase bounds/rebuild
repeatability. Actual shared live-runtime preview screenshots are saved as
`output/playwright/planet-rotation-before.png` and `planet-rotation-after.png`.
`planet-rotation-proof.json` records changed ice/gas phase with unchanged camera and
body position, unchanged gas ring world matrix, and a 23-second reduced-motion
freeze. This isolated actual renderer proof is not an App/database or art-fidelity
acceptance. The F3 planet visibility option retains planet meshes and pauses axial
phase while skipping their generation/LOD/weather updates; stars, rocks and dust
remain independent. The custom sun intensity also respects the lighting toggle.

### Native ice r006–r008 review continuation

r006 produced two actual Blender seed renders at 76,007/76,259 triangles and five
material batches. Root rejected the visual gate: continuous stepped crust improved
coverage, but regular contour bands and engineered through-trenches still read as
panels cut into a ceramic ball. r007 reduced those bands and elongated cyan
clusters, but its irregular Boolean outlines and unsegmented terrain edges produced
invalid topology and floating faces. Both failed seeds and exact authoring sources
remain preserved in the design ledger.

r008 repairs the native surface topology with consistently segmented vertical
edges and a matching bottom grid, simple cut outlines and straight shared-port
collars. Every native terrain body passes Blender mesh validation and manifold-edge
checks before export. Six variants range from 4,242 to 5,898 triangles; seed
assemblies contain 108,297/106,252 triangles in five batches. These are technical
checks, not visual acceptance. Root requested an isolated crater-unit gate before
further assembly: `ice-r008/hero-crater-blender.png` shows the actual rounded basin,
three stepped cyan inner-wall levels, uneven snow ledges and elongated ice clusters.
That unit is awaiting root critique. Smooth cap planes, regular ledge heights,
pastel optics, whole-planet quadrant seams and rounded overall composition remain
open. No native ice revision has been published to the live application or signed
off by the owner; volcanic and the remaining family backlog are still pending.

### r009 actual Babylon comparison

Root passed the r008 crater-unit gate for assembly experimentation only. r009
keeps its manifold/shared-port construction, replaces low boundary trenches with
matching level collars, adds tapered faceted shaft groups and more broken snow
lip pieces, and deepens native blue material colors. The actual Babylon review
runs on the required tailnet host and consumes the same native kit through the
seeded compositor, without importing the application or publishing assets.

`output/playwright/native-ice-r009-seed131-comparison.png` and its seed9187 sibling
place actual rendered output beside the exact source crop. SceneInstrumentation
reports four nonempty meshes/materials and eight draw calls including the 1024²
shadow pass for each seed. Geometry is 108,217/106,918 triangles; active indices
are 649,302/641,508, including both passes. No GPU timing conclusion is implied.

Self-review rejects visual fidelity: large rounded white panels and quadrant
boundaries remain prominent, blue shaft groups are sparse and dark, and the
reference has much denser broken snow/blue cliff hierarchy. Matching native port
profiles prevents gaps but does not itself eliminate visible pattern repetition.
The fixed reviewer sun follows the global gameplay direction; it differs from the
previous Blender area-light arrangement, so these are not matched-lighting A/Bs.
Root critique is pending. r009 remains an isolated unpublished draft.

### r010–r012 basin experiment and actual runtime gate

Following root's r009 rejection, native basin-end variants replace the six connected
path endpoints with oval openings; three extra basins give approximately 3–5 large
openings per visible hemisphere. Connecting cuts are narrower. Native grouped snow
fragments are placed only on raycast snow surfaces, with limited overhangs across
unit boundaries; shorter faceted formations sit along the blue walls.

Technical attempts remain preserved: r010 exposed a .001-unit shared-boundary
bevel mismatch, and r011 weighted coplanar grid edges unnecessarily, exceeding the
patch budget. r012 weights only actual interior dihedral edges and leaves shared
collars exact. Its seven native terrain bodies pass manifold checks and all 180
sampled port profiles match. Seven compositor tests include compatible basin
substitution. Twelve seed/coverage cases remain finite with a maximum of 128,010
triangles. The per-patch bound is 6,500 triangles (actual maximum 6,020); the whole
planet limit remains 150,000.

Actual r012 Babylon/reference boards are
`output/playwright/native-ice-r012-seed131-comparison.png` and its seed9187 sibling.
Measured costs: five nonempty meshes/materials, ten draws including the 1024²
shadow pass, 104,994/103,642 triangles and 629,964/621,852 active indices. The
existing bounded ice-optics material compiles; no shader errors occurred. The
review uses the same camera and directional sun as r009, with no new ambient
lighting. It does not yet include the main game's HDR environment texture, so
claims of full game-lighting parity would be incorrect.

Self-review still rejects fidelity: oval openings read as regular stepped sockets,
blue cliff formations remain sparse, curved cap remnants are still visible, and
some snow chips intersect higher adjacent shelves and appear thin. Root image
critique is pending. No native planet draft has been published. Ice, volcanic and
the other family goals remain unfinished.


### r013 closed-volume architecture and pending three-way gate

Root rejected r012's remaining curved cap panels and regular socket rings. r013
removes that exposed cap construction entirely. Seven reusable native Blender
forms now provide thick snow clusters, faceted blue bluff/cavity clusters and a
hidden sealing core. The seeded runtime compositor places the original authored
volumes in four merged material batches; it does not generate another visible
sphere cap or refine the legacy TypeScript voxel shell.

The preserved source is `.runtime/art-library/planets/ice-r013/kit.blend`.
All native forms pass mesh/manifold validation. Twelve real-kit seed/coverage
combinations remain finite, with a maximum of 134,784 triangles under the 150,000
limit. Seed131 contains 125,432 triangles and 4,096 placed native volumes.
Nine focused compositor tests and full TypeScript checking pass.

The Blender preview improves shell continuity but still shows a repeating
fish-scale placement pattern and insufficient hero bluff height. It is not an
accepted fidelity result. The next required gate compares the actual shared live
Frost Ice renderer (catalog seed47), native r013 seed47 and the exact ice reference
in one board. Both rendered controls use the actual game HDR at intensity0.28,
right-handed coordinates and identical camera/sun. This is a controlled renderer
comparison, not an authoritative App/DB capture. Local game candidate installation
follows root working review; final art approval remains owner-controlled. The full
remaining acceptance scope is recorded in `planet_goal_acceptance.md`.

Actual r013 three-way capture is `output/playwright/native-ice-r013-threeway-seed47.png`.
The candidate has 124,816 triangles, four nonempty material meshes and eight draws
including its shadow pass; live control has 191,990 triangles and six draws.
Both HDR textures are ready and no shader errors occurred. The actual image fails
the working gate: uniform grey shingling and separated blue disks replace the old
uniform tiled relief without establishing the reference's tall cyan cliff/cavity
hierarchy. No native candidate installation is justified yet. Root review is pending.

### r014 regional glacial masses (actual image pending)

Root rejected r013 after reviewing the actual three-way board. r014 replaces the
4,096 uniformly yawed Fibonacci placements with 1,536 jittered region-oriented
placements of a new native kit. Snow is a thick clipped footprint with an uneven
broad crown; ice consists of wide-footed faceted bluff groups and lower cavity
forms. Regional heights and branching recessed channels provide continuous deep
interiors, with taller ice near broken cavity edges. No exposed cap sphere returns.

The native `.runtime/art-library/planets/ice-r014/kit.blend` source is preserved.
All forms are closed/manifold; nine focused tests and TypeScript checking pass.
Twelve real-kit seed/coverage cases are finite and below 86,097 triangles. Seed47
is 81,508 triangles. The Blender frame has clearer tall cut faces and cavity depth
but retains an obvious snow grid and broad white regions. The required actual
HDR three-way image and root review remain pending; no live replacement yet.

The actual r014 board is `output/playwright/native-ice-r014-threeway-seed47.png`.
It reuses the unchanged live47 control captured for r013, and renders the new
candidate with actual game HDR and the shared `createPlanetShadows` helper.
Candidate costs are 81,508 triangles, four nonempty material meshes and eight
draws/489,048 active indices. HDR is ready; no shader errors occurred.

Tall cyan faces and cavity depth are now visible in the actual renderer, but
manufactured-looking radial column rows, too few huge openings, broad regular
white shingling and muted light response remain substantial reference gaps.
Root working review is pending. No local native installation or final art approval
has occurred; ice integration and the volcanic/family goals remain open.

### r015 branching interior and native optical response

Root acknowledged r014 macrodepth progress but rejected local installation. r015
adds a connected branching cut through the broad snow regions, smaller diagonal
crater openings, and broad buried blue ledges. Taller groups are sparse rather than
occupying every exposed ice placement. Native snow crowns occur locally, and
orientation changes by region. A preliminary narrow-channel source frame and its
exact composition were preserved before widening channels to clear overhanging
snow; that preliminary Blender image does not represent the final runtime frame.

The isolated native material profile keeps rough snow distinct from glossy opaque
ice. It adds bounded sun/view/depth-driven cold scatter and shadow-aware snow
wrap, using the actual shared primary light/HDR. No scene lights, optical sphere,
transparency or physical volumetric-transmission claim is added. Existing accepted
live materials remain unchanged. Four new focused tests and full TypeScript
checking pass; actual shader compilation has no errors.

`output/playwright/native-ice-r015-threeway-seed47.png` compares the unchanged live
control, new candidate and exact reference. Actual costs: 74,864 triangles, four
nonempty material meshes and eight draws/449,184 active indices. White snow is
brighter and a branching blue cut divides the former dominant cap. Faceted
fan/ramp-like blue walls, regular snow chunks and insufficient luminous ice
contrast remain important gaps. Root working review is pending; no live switch.

Root clarified the release scope: finish materially closer ice and volcanic
reference/runtime improvements and actual-game installation. The other seven
family briefs remain next-in-line backlog in planet_next_passes.md, with the
previously accepted temperate baseline retained.

### r015 local installation and actual App Observe gate

Root approved the r015 working comparison for a local review-candidate installation,
not final art. Root verified/copied the 55,802-byte kit/GLB manifest into canonical
runtime staging and both applications. The environment asynchronously loads the
native kit, rebuilds same-ID fallback ice after arrival, and retains the old full
renderer for unavailable assets or unsupported mixed effects/custom palettes.
Three projected detail levels use 16/10/6 cells per face; the scene-owned CPU LRU
holds at most six compositions and GPU resources dispose with their body. Terrain,
sea and mountain controls remain seeded composition inputs. Existing atmosphere,
rotation, shadows, body identity and Observe camera remain integrated. Nine focused
tests include delayed asset replacement, cache/LOD and disposal/toggle behavior.

Actual App image: `output/playwright/native-ice-r015-actual-observe.png`. Frost47
is admitted at world(-3400,-2400), height-180, radius70. The actual camera targets
renderer XYZ(-3400,-180,2400), radius350; the native hero reports74,864tri and
the actual game HDR is ready. The full halo/sky/UI context is present. Pointer wheel
and right-drag reduce camera radius to254.152 and change angles while preserving
the target; Return restores ship radius46.9958. Compared authoritative space bodies,
ship/character transforms and inventory rows remain identical. Exact details are in
`native-ice-r015-actual-observe-proof.json`.

Method limitation: this uses the actual App/DB and WorldHandle focusBody entrypoint.
The review's paused-render UI pagination timing did not select Frost reliably, so
this is not a new destination-button acceptance claim; earlier twelve-destination
pointer review remains separate evidence. One actual full-scene frame was rendered.
The fan-like blue walls, shingled snow and weak gloss remain open art issues. Root
requested moving to volcanic native work after this full-stack ice review rather
than continuing isolated ice geometry iterations.

## Native volcanic r001 — actual comparison rejected

The seed89 shared-renderer control/candidate/reference board is `output/playwright/native-volcanic-r001-threeway-seed89.png`. This uses the real game HDR at0.28 and shared1024 sun shadows, but is an isolated renderer fixture, not an authoritative App capture. Native125,352 triangles,5 meshes,20 draws versus live233,194 triangles,6 meshes,16 draws; zero shader errors. Source kit/Blender and exact helper snapshots are preserved under `.runtime/art-library/planets/volcanic-r001/` and the art ledger.

Root rejected replacement: the central cap hides branching lava, perimeter columns read as radial pipes, and uniform small ledges still dominate. Warm proximity illumination is visible on cliffs, but the overall planet is colder/dimmer and less volcanically legible than live. The spill-off control disables only cliff radiance while retaining emission and glow. This is a bounded visibility/facing approximation, not full GI. No smoke or native volcanic live installation is implemented.

The authorized r002 direction is connected surface-visible tributaries at varied heights,3–5 uneven major plateau masses, shorter embedded cliffs, red/orange margins around white-yellow molten channels and burgundy bounce. Preserve quiet regions without another giant cap or deep surrounding moat. Root review remains required before local installation; final owner art acceptance remains open.

## Native volcanic r002/r003 — topology and emission review

r002 added five curved seeded branches, raised undulating molten surfaces and shortened native pillars. Its actual seed89 board exposed a new failure: broad white/yellow ribbons clipped the intended red-orange hierarchy. Root rejected it. Costs78,280 triangles,5 meshes,20 draws.

r003 narrowed the white core to0.004 angular field distance and attenuated yellow/orange/red independently, keeping actual HDR radiance and cliff spill. Added an editable low basalt side shelf. The actual board `output/playwright/native-volcanic-r003-threeway-seed89.png` shows stronger branching lava and retained red margins;102,096 triangles,5 meshes,20 draws,918,864 active indices including passes, zero shader errors. Twelve seed/coverage combinations remain finite and below150k triangles (maximum141,336). Source revisions and spill-off controls are preserved.

Working art review is pending: repeated shingles and fortress-like cliff walls remain obvious, plus dark undercuts and missing molten falls/crater/smoke hierarchy. No native volcanic live installation or final art approval has occurred. Accepted native ice r015 and existing live volcanic remain selected unchanged.

## Native volcanic r004 — lower crust and local features

r003 material/spill progress passed root review as a component, but the whole candidate did not. r004 halves main cliff depth and reduces regional height amplitude, raises the molten level closer to the crust, adds a reusable Blender-authored molten-fall ledge and places a bounded set of localized crater depressions with native broken rims. `output/playwright/native-volcanic-r004-threeway-seed89.png` is the actual matched baseline/candidate/reference board. Costs94,032 triangles,5 meshes,20 draws,846,288 active indices including passes; no shader errors. Twelve finite seed/coverage cases peak at137,164 triangles; full TypeScript check passed.

The frame is more continuous and has fewer pipe-like silhouette forms, but remains overly quiet at the silhouette with uniformly repeated top ledges; crater/fall features are too subtle and the branching borders remain regular. Root working review is pending. All current live selections remain unchanged.

## Native volcanic r005 — secondary geography review

Root rejected r004 as a replacement. r005 increases the seeded curved fracture network to nine branches with variable edge widths, uses broader irregular native faces with much smaller bevels, introduces localized crag groups and replaces the four-sided crater lip with nine uneven authored segments. Hot white cores are intermittent, yellow radiance is reduced independently. The actual seed89 board is `output/playwright/native-volcanic-r005-threeway-seed89.png`:83,996 triangles,5 meshes,20 draws,755,964 active indices including passes, zero shader errors. Twelve seed/coverage cases peak at133,868 triangles. Full tsc and both local-lighting tests pass. The near-source test now places its sample explicitly above the variable molten radius instead of assuming the obsolete0.94 level.

Visual gaps remain: aggregate yellow brightness rises with the denser tributaries; large flat plate clusters still dominate and crater bowls are not clearly readable at whole-world scale. The source revisions and images remain preserved; no final fidelity or local replacement gate is claimed.

## Native volcanic r006 — macro forms and basin integration diagnosis

The new native kit contains11 reusable forms: larger multi-level rock formations and a basin with an actual lowered floor, attached narrow vent and small hot outlet. The actual comparison `output/playwright/native-volcanic-r006-threeway-seed89.png` costs80,308 triangles,6 meshes,23 draws,722,772 active indices; no shader errors. Twelve recipe cases peak at126,916 triangles. The native validation limit is deliberately11 only for volcanic-geology; other layouts retain8.

Agent review rejects the manufactured nut-like basin rim and oversized flat octagonal macro caps. A concrete integration bug was also identified: the shared molten core sat above the authored basin floor and obscured its vent. The staged field now lowers that core beneath the basin; a four-seed clearance regression plus source-facing/range tests pass3/3. The failed r006 source and actual frame remain preserved before this correction. Further native form review is pending; no live volcanic selection changed.

### Dormant volcanic integration preparation

`native-volcanic-runtime.ts` prepares a revision-validated shared kit loader,6-entry CPU LRU,20/12/8-cell LOD selection, resource-preserving hide/restore, and cleanup. It is deliberately not selected by the live environment while the art gate remains open. The renderer now pulses both river and basin-vent emitter materials consistently and freezes them under reduced motion. Six focused tests cover deterministic seed differences, LRU/LOD, resource preservation/disposal, mixed-style fallback, source-facing radiance and basin clearance. No native volcanic network request occurs until an explicit loader is called. Smoke remains unimplemented in this native draft.

Root commissioned independent native forms in `assets/art-library/planet-geology-studies/basalt-forms-02/`: editable source, centered GLBs, exact native geometry stream and inspected full/exposed source sheets. All three evaluated forms are closed/manifold. These are proposed replacements for the manufactured r006 macro forms, not published assets or accepted final artwork.

## Native volcanic r007/r008 — source units and matched envelope

Root approved study02 source units for composition only. r007 preserved their exact vertices but placed a large basin normal-on, yielding a rectangular socket read; root rejected it. r008 replaces underlying top cells with20 medium native regions and three smaller rotated/off-center basins. The common planet atmosphere wrapper was extracted unchanged into `planet-atmosphere.ts` and reused by the candidate viewer. Earlier r001–r007 native frames omitted that envelope and must be treated as unequal-envelope geometry/material diagnostics, not full-stack acceptance.

r008 actual board: `output/playwright/native-volcanic-r008-threeway-seed89.png`;93,958 native triangles plus2 atmosphere triangles,7 meshes,24 draws,845,628 active indices, zero shader errors. Twelve recipe cases peak at124,182tri;6focused tests and tsc pass. It is rejected on agent review: study groups dominate but look like flattened rectangular panels. Diagnosis: tangent scaling around0.45 combined with radial scaling0.065–0.097 flattened the authored stepped relief5–7x. Correct burial requires moving the native base inward while retaining a larger radial scale; further root review remains pending.

## Native volcanic r009 — aspect and curved-base clearance

The representative actual shell unit passed root review (`output/playwright/native-volcanic-r009-sunlit-unit.png`). Native relief uses stronger radial scaling with inward translation, not crushed height. The composition checks bottom/bevel vertices against the sampled curved molten surface and translates the entire unchanged source form inward when necessary; it rejects any residual base clearance above−0.01R. Source CCW triangles retain the single RH/CW consumer flip and opaque single-sided materials.

Full board: `output/playwright/native-volcanic-r009-threeway-seed89.png`;19 regional groups,93,958 native triangles,7 meshes including common halo,24 draws,845,628 active indices, zero shader errors. Maximum buried-base clearance is−0.0174R in seed89; twelve seed/coverage cases remain below124,182 triangles.8focused runtime/field/environment tests pass. The viewer now also matches the actual planet GlowLayer ratio0.25/blur24/intensity0.45, instead of its earlier fixed512/blur32 diagnostic setting.

The full composition still reads broad rectangular tiers in near-normal front views. Further root review is pending; a camera-independent geological-axis tilt is proposed to expose native cut faces without changing authored vertices or world authority. This is not an accepted native volcanic replacement.


### Volcanic native r010–r013 continuation (2026-09-09)

The r010 and r011 actual shared-renderer frames remain rejected drafts. A fixed geological north bias (17°, then 35°) and two smaller authored study02 units per region improved visible ledges, but did not solve separated crust islands or repeated small top plates. No camera-dependent orientation was introduced.

r012 narrowed emissive bands and replaced the remaining octagonal fragment outlines in the preserved Blender source. Actual comparison: `output/playwright/native-volcanic-r012-threeway-seed89.png`; 125,282 triangles, seven meshes, 24 draws, 1024 shared hero shadow map, actual game HDR intensity 0.28 and the unchanged atmosphere wrapper. No shader errors. This is **rejected as a live replacement**: lava proximity response is visible, but wide glowing corridors still dominate and exposed undercuts make native crust read as separate armor islands. The 12-case seed/coverage sweep passed below 150k triangles.

r013 is the next unpublished experiment: retain connecting native crust around smaller regional exclusion footprints, narrow generation gaps, and translate every authored basalt base inward until its basal vertices are buried below the local molten shell. Native surfaces are not flattened or remeshed. Its 12-case seed/coverage sweep passes, maximum 142,512 triangles. Actual image review is pending.

The existing bounded smoke layer has been extracted unchanged into `planet-smoke.ts` for reuse by the layered renderer and the dormant native adapter. This preserves default volcanic smoke at near/medium LOD and omits it at distant LOD, with the existing tint, opacity, depth behavior and geometry budget. No new smoke simulation is claimed. Native volcanic live selection remains disabled until a plausible working image passes root review; exact source artifacts stay staged.


### Volcanic r013–r017 actual continuation

r013 restored the exact existing default smoke layer in the shared-renderer comparison. It remained rejected: tighter channels improved continuity, but the12-cell fallback enlarged tangent roof plates. r014 used the separately preserved native `basalt-forms-lod-01` derivative (only bevel modifiers removed; authored course vertices, faces and material roles unchanged), reducing regional cost by roughly86%. The attempted uniform small-form north tilt exposed roof rows, so that frame was rejected. r015 replaced all remaining simple prism filler with the actual irregular native study surfaces and varied regional orientation, reducing those rows. r016 increased regional depth and was rejected for oversized cross-shaped silhouettes. All frames remain in `output/playwright/native-volcanic-rNNN-threeway-seed89.png`, with exact sources in each `.runtime/art-library/planets/volcanic-rNNN/source/` where applicable.

r017 groups three smaller embedded native ledges per regional footprint, maintaining57 regional units across19 seed89 groups. Root found substantial relief/local-spill improvement and a viable working direction, but **did not accept or install it**; the requested bounded next pass is albedo-weighted reflected spill and narrower varied fissures. Actual shared renderer:131,840 native triangles plus33,440 unchanged smoke triangles and2 atmosphere triangles =165,282 total planet triangles;8 meshes,9 materials,26 draws with the shared1024 hero-shadow/GlowLayer passes. The native geometry-only cap remains150k; smoke has its existing separate bound. Twelve seed/coverage cases pass at maximum132,304 native triangles; normal/mid/far placement grids are12/10/8 cells, with deterministic fallback if needed. This is not a165k-per-frame rendering-cost claim: multipass active indices are measured separately.

Open r017 gaps are repeated fine ledges, smooth large river paths, warm diffuse spill and insufficiently cool/lavender top versus burgundy recess separation. Existing smoke is preserved, not redesigned; the inherited detached patch appearance remains a known limitation. Geometry tests and shader compilation do not establish final art approval. Current live volcanic selection remains unchanged.


r018 preserves r017 geography while correcting lava reflection: the bounded visibility/facing term now multiplies receiving `surfaceAlbedo`, with calibrated gain, before contributing to final diffuse light. Emissive rivers remain separate. Top-role reflectance is modestly brighter and cool, fissure widths vary spatially and white hot segments are rarer. Typecheck passes; actual fresh-shader comparison is pending the shared GPU slot. This is not full GI and has not been published.


The r018 actual comparison is now captured at `output/playwright/native-volcanic-r018-threeway-seed89.png`; the matching spill-off control is `native-volcanic-r018-spill-off-seed89.png`. Shader compilation has zero errors. Geometry is unchanged from r017:165,282 total planet triangles including inherited smoke/halo and26 draws. The corrected reflection restores cool gray tops and a localized red/orange response instead of broad raw-irradiance wash.47,850 of313,600 canvas pixels differ by more than2 channel levels when only the reflected spill term is disabled; their meanRGB difference is+23.08/+5.74/+2.46. This verifies actual reflected-light contribution, not full GI or final fidelity. Root working review is pending. A436,533-byte exact runtime package and source-hash manifest are staged under `.runtime/art-library/planets/volcanic-r018/runtime/`; no publication or live selection has occurred.


### Volcanic r018 local candidate integration

Root passed the actual r018 **working-candidate** gate for local integration, explicitly retaining fine-ledge, smooth-river and smoke-cloud limitations and withholding final art approval. The exact12-file436,533-byte runtime kit is now copied to `assets/runtime/planets/volcanic-r018` and both independent app public planet directories. Kit SHA256: `287d0cb10c2bca4d21e6b9eb1eaf5877b854bd86464c24041fc4082dc0c16b65`; manifest SHA256: `ad17a4b33da1ccc257018ecca5e7eb79a3040a0023c7865ac9665bfc2df11924`.

The environment asynchronously admits that exact native kit for supported volcanic recipes, keeps the existing renderer while loading or for unsupported mixed effects/custom palettes, and rebuilds the same admitted body ID after arrival. Its native orientation, shared axial spin, smoke/LOD, shadow/GlowLayer occlusion and disposal remain in the common path. No body UUID, position or authority row is changed. Ten focused tests pass, including independent ice/volcanic asynchronous arrival, position preservation, hidden-resource reuse, cache bounds, reduced-motion emitter behavior, smoke LOD and disposal. Native GLB/compiled-stream/source-hash validation passes. Actual App Observe and the combined release build remain pending root GPU/build coordination.


### Volcanic r018 actual App Observe gate — passed

After the additive authentication module publish resolved the temporary `own_identity_links` subscription mismatch, the existing **Pose Integration Review** identity successfully selected Map → page2 → Cinder Volcanic → Observe using actual browser pointer events on the required preview host. The full rendered frame is `output/playwright/native-volcanic-r018-actual-observe.png`; proof is `native-volcanic-r018-actual-observe-proof.json`. Cinder remains at authorizedx1700/y−3800/height−155/radius62/seed89, bodyUUID`54d7c057-bac4-4d29-9e26-175e000be829` for that admitted review world. Native r018LOD0 loaded131,840 base triangles with the common smoke/atmosphere/sun/shadow stack.

Observer target is renderer[1700,−155,3800], initial radius310. Real pointer wheel/right-drag changes radius to216.28 and changes azimuth/elevation; pointer Return restores the original ship camera target/radius/elevation and equivalent azimuth modulo2π. Map was closed afterward. `ownCharacters`, `ownShips`, `ownSpaceBodies` and `ownInventoryItems` were serialized before/after and remain identical. Continuous rendering was paused for software-GPU cost; actual pointer events and manual presentation callbacks advanced UI/camera, followed by one actual full scene render. No direct `focusBody` selection shortcut was used this time. Browser closed and GPU handed to integration.

This passes local integration/presentation/authority preservation, not final owner art fidelity. Both ice r015 and volcanic r018 now have actual App Observe evidence. Volcanic fine ledges, smooth fissure segments and inherited smoke form remain open; ice's matte/fanlike optical/geometry limitations remain documented. Combined release checks/build are owned by integration_continuation.

### Ice optical study 01 prepared after volcanic integration

The installed baseline remains ice r015. An isolated, uninstalled material study
is preserved at `.runtime/art-library/planets/ice-optics-study-01/`; no live native
material or geometry was changed. Inspection found two layered cold-response
plugins: the original helper adds an unshadowed emissive term, while the native
finish attenuates its contribution with depth. The live vertex attribute caps depth
at 0.65, retaining 35% of that term on the deepest faces; complete suppression
occurs only at theoretical depth 1. The candidate
uses one shared-sun, shadow-gated response, retains limited cyan on illuminated
deep walls and broadens the PBR sheen. Snow geometry/material values are retained.
This is an opaque optical approximation, not physical ice transmission.

972 numerical cases pass response bounds, light-off and full-occlusion checks;
this is not visual acceptance. A matched 640px full-environment r015 control and
candidate capture is prepared, awaiting the serial GPU slot after authentication
review. Geometry, atmosphere, sun, HDR, seed47 and camera must be held fixed.
The exact `planets--ice-world` reference remains the target. Current fanlike wall
geometry and shingled snow are still unresolved and cannot be solved by this
material-only study.

## LOD runtime requirement (2026-09-11)

Future planet authoring and integration must follow the [planet LOD transition contract](planet_lod_authoring.md). R15 supersedes the historical synchronous-generation description above: live layered terrain uses worker preparation, count-only cap planning, build-ahead, shared/precompiled materials and retained ready levels. Native planet integrations must use the same transition contract, and fixed-detail bodies must avoid needless threshold rebuilds. Validate both Flight approach/retreat and Map → Observe; record hardware failures separately from artistic review.
