# Shipyard primary and secondary paint

Status: implemented; live dashboard verified; delivered in [PR #9](https://github.com/Dastari/sidereal_spacetime/pull/9). Owner explicitly requested paint controls for every Hull object and engines/thrusters. No new native geometry or game release approved by this document.

## Entry record

Shared HEAD 9c58c07774d7d3c4a58a40c49e90f2a2c647249c. Isolated branch `feat/shipyard-paint` starts from tested palette commit 8335cb50, stacked on PR #8. Existing GLB pins are immutable, including r005 armor dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8. Shared changes remain owned separately:

```text
 M CHANGELOG.md
 M apps/client/src/App.tsx
 M apps/dashboard/package.json
 M apps/dashboard/src/planet-studio/PlanetStudio.tsx
 M apps/dashboard/src/planet-studio/planet-studio.css
 M apps/dashboard/src/shipyard/layout/DocumentBar.tsx
 M apps/dashboard/src/shipyard/layout/HullWorkspace.tsx
 M apps/dashboard/src/shipyard/layout/LayoutEditor.tsx
 M apps/dashboard/src/shipyard/layout/NewLayoutDialog.tsx
 M apps/dashboard/src/shipyard/layout/useLayout.ts
 M apps/dashboard/src/shipyard/layout/workbench.css
 M docs/architecture.md
 M docs/handoffs/armor_block_kit_spec_20260914.md
 M docs/handoffs/shipyard_completion_progress.md
 M docs/planet_reference_iteration_20260914.md
 M docs/public/shipyard.md
 M docs/rendering_performance_plan.md
 M package-lock.json
 M packages/canvas-ui/package.json
 M packages/render/package.json
 M packages/render/src/environment/planet-lod-runtime.ts
 M packages/render/src/environment/planet-worker-client.ts
 M packages/render/src/environment/planet-worker.ts
 M packages/render/src/environment/reviewed-native/crystal_reference_composition_r013.ts
 M packages/render/src/environment/reviewed-native/gas_reference_composition.ts
 M packages/render/src/environment/reviewed-native/ice_reference_composition_r025.ts
 M packages/render/src/environment/reviewed-native/native_cloud_composition_r002.ts
 M packages/render/src/environment/reviewed-native/native_reference_assembly.ts
 M packages/render/src/environment/reviewed-native/native_surface_clearance.ts
 M packages/render/src/environment/reviewed-native/ocean_reference_composition_r007.ts
 M packages/render/src/environment/reviewed-native/planet_reference_composition.ts
 M packages/render/src/environment/reviewed-native/planet_reference_materials.ts
 M packages/render/src/environment/reviewed-native/planet_reference_transmission.ts
 M packages/render/src/environment/reviewed-native/rocky_reference_composition_r010.ts
 M packages/render/src/environment/reviewed-native/temperate_reference_composition_r003.ts
 M packages/render/src/environment/reviewed-native/toxic_fog_composition_r005.ts
 M packages/render/src/environment/reviewed-native/toxic_fog_reference_clearance.ts
 M packages/render/src/environment/reviewed-native/toxic_fog_reference_integration.ts
 M packages/render/src/environment/reviewed-native/toxic_reference_composition_r007.ts
 M packages/render/src/environment/reviewed-native/volcanic_reference_composition_r023.ts
 M packages/render/src/layout-hull.ts
 M scripts/prepare_app.py
 M scripts/test_prepare_app.py
?? apps/dashboard/public/reviewed-planets/
?? apps/dashboard/public/reviewed-stars/
?? apps/dashboard/src/planet-studio/ReviewedPlanetStudio.tsx
?? apps/dashboard/src/shipyard/layout/armor-kit-r005.json
?? apps/dashboard/src/shipyard/layout/armor-review.test.ts
?? apps/dashboard/src/shipyard/layout/armor-review.ts
?? docs/adr/
?? docs/genesis_native_planets_spec.md
?? docs/handoffs/armor_editor_live_checkin_20260915.md
?? docs/handoffs/genesis_native_integration_20260915.md
?? docs/handoffs/genesis_native_packaging_20260915.md
?? docs/handoffs/shipyard_palette_20260915.md
?? packages/render/src/environment/modern-native-planet-schema.test.ts
?? packages/render/src/environment/modern-native-planet-schema.ts
?? packages/render/src/environment/planet-worker-reviewed.test.ts
?? packages/render/src/environment/reviewed-native-planet-catalog.json
?? packages/render/src/environment/reviewed-native-planet-catalog.ts
?? packages/render/src/environment/reviewed-native-planet-encoding.test.ts
?? packages/render/src/environment/reviewed-native-planet-encoding.ts
?? packages/render/src/environment/reviewed-native-preview.ts
?? packages/render/src/environment/reviewed-native-selection.ts
?? packages/render/src/environment/reviewed-native/build-reviewed-planet.ts
?? packages/render/src/environment/reviewed-native/crystal_moon_reference_composition_r002.ts
?? packages/render/src/environment/reviewed-native/crystal_moon_reference_composition_r003.ts
?? packages/render/src/environment/reviewed-native/crystal_moon_reference_composition_r008.ts
?? packages/render/src/environment/reviewed-native/hybrid_moon_reference_composition_r001.ts
?? packages/render/src/environment/reviewed-native/ice_moon_reference_composition_r004.ts
?? packages/render/src/environment/reviewed-native/material-set.test.ts
?? packages/render/src/environment/reviewed-native/material-set.ts
?? packages/render/src/environment/reviewed-native/reviewed-composer-input.ts
?? packages/render/src/environment/reviewed-native/reviewed-weather-validation.ts
?? packages/render/src/environment/reviewed-native/reviewed-worker-registry.test.ts
?? packages/render/src/environment/reviewed-native/reviewed-worker-registry.ts
?? packages/render/src/environment/reviewed-native/rocky_moon_reference_composition_r001.ts
?? packages/render/src/environment/reviewed-native/runtime.test.ts
?? packages/render/src/environment/reviewed-native/runtime.ts
?? packages/render/src/environment/reviewed-native/solid_moon_reference_composition_r001.ts
?? packages/render/src/environment/reviewed-native/toxic_moon_reference_composition_r001.ts
?? packages/render/src/environment/reviewed-native/upload-lifetime.ts
?? packages/render/src/environment/reviewed-native/volcanic-smoke-runtime.ts
?? packages/render/src/environment/reviewed-native/volcanic_moon_reference_composition_r004.ts
?? packages/render/src/environment/reviewed-preview-lighting.ts
?? packages/render/src/environment/reviewed-star-catalog.ts
?? packages/render/src/environment/stellar-convection.ts
?? packages/render/src/environment/stellar-corona.ts
?? packages/render/src/environment/yellow-star-runtime.ts
?? scripts/art_library/build_armor_editor.py
?? scripts/art_library/render_armor_thumbnails.py
?? scripts/test_armor_thumbnails.py
```

## Outcome contract

Every exterior asset (including cockpit/roof exterior modules) and engine/thruster gets Primary and Secondary colour inputs plus reset-to-authored controls. Colours are optional canonical six-digit sRGB hex values saved per placement, never on a shared asset. Painting changes no dimensions, transforms, attachment, collision, damage, pressure or power. Preserve normal/roughness maps and protected glass, exposed metal, emitters and text. Preview updates immediately; undo/redo, duplication, clipboard, JSON export/import and local draft reload preserve paint independently. Existing documents with absent paint render their exact authored appearance.

Extend both PartPlacement and planar LayoutFitting with optional validated cosmetic paint. Include it in default-template customization detection. Bind paint in shared placed-mesh rendering and the Shipyard's Structure/Objects/Hull presentations so switching modes does not discard colour. Native atlas bindings use explicit authored surface regions; existing named materials and legacy vertex-colour assets have explicit paint/protected classifications. A shader recolours only the albedo contribution, retaining authored surface relief. No generic tint of glass or emissive materials.

## Rendering and lifecycle

Immutable geometry and textures are shared. Painted placements clone mesh nodes/material bindings, not geometry buffers; unpainted placements keep their normal instancing path. A placement-owned material map shares variants across its submeshes and disposes only owned variants when the placement is removed/repainted. Rebuilding a paint binding must not leak textures/materials or recolour another placement. Handle MultiMaterial engine prototypes. Unknown protected/optical materials remain unchanged; generic opaque polymer/paint families receive the documented fallback role. Failed native loads keep the draft and existing error reporting.

## Acceptance evidence

Meaningful tests cover invalid colours, save/export/default migration, independent identical parts, painted native atlas/engine material masks, protected glass/lights, restored unpainted geometry, and material disposal. Browser: paint two identical panels differently; primary/secondary separately; paint main engine and small thruster; undo/reset/copy/reload; narrow inspector; verify Wayfarer and all Hull catalog families. Run check/build/lint and relevant Python tests. Publish scoped changes to owner port 5174 and deliver a separate PR against PR #8. Game publication remains a distinct operation; do not claim game integration without exact game evidence.

## Validation and delivery — 2026-09-15

- Final isolated `npm run check`: 351 suites / 2,089 tests pass; documentation/provenance check passes.
- `npm run build`: world, generated bindings, independent client and dashboard builds pass. Lint and formatting: no new violations. Nine focused paint/material/default-migration tests pass.
- `npm run smoke -- --smoke-name shipyard-paint --fresh-smoke`: passes against new isolated database `sidereal-spacetime-dev-shipyard-paint-r0001-smoke`; no live world publication. This exercises existing authority/denial paths, not an administrator publish/refit happy path.
- Browser on candidate port 5274: two identical armor copies keep different face colours; separate backing colour; save/reload, duplicate, reset and undo; painted Wayfarer canopy hardware preserves glass; engine body/accent separation preserves machinery/lights. Discovered and fixed shader role-cache sharing and constructor-time varying registration before delivery.
- Scoped patches applied to shared dashboard port 5174, preserving the other owner's layout-hull changes and planet/client work. Live browser confirmed main engine and small maneuvering thruster controls, reset/undo and a 200 px inspector without horizontal overflow. Shared checkout typecheck reports an unrelated missing `packages/render/src/environment/fixtures/modern-native-planet-headers.json` in the other owner's planet tests; isolated feature checkout typechecks cleanly.
- No native GLB or physical revision changed; r005 armor publication remains distinct from game qualification. No live ship refit or game deployment claimed. Painted authored placements are wired into common equipment/construction rendering, but no new live game paint release is claimed without game evidence.

Browser images are retained in `output/playwright/paint-neighbours.png`, `paint-canopy.png`, `paint-engine-final.png` and `paint-live-engine.png` under the isolated worktree and copied to the shared evidence folder on delivery. Earlier `paint-engine.png` shows the shader-cache defect and is superseded by `paint-engine-final.png`.

Single-material native hull surfaces and canopy titanium hardware use local face versus top/bottom edge masks. The coating changes albedo while retaining metallic/roughness properties. Glazing, rubber seals and exposed machine materials stay authored. Printed atlas details retain a bounded contrast mask. This is two-colour paint, not a texture-picker or a new native-art revision.

Candidate implementation SHA-256:

```text
56c589d22fd174f54c2003bbe0172e12f17a4b36509d70c302d5db6095391653  packages/content/src/hull-paint.ts
f32846b4e48bc6aa23f7ab0568c801293eb150ce3b49bc1c5e960ea9a1ea605f  packages/render/src/hull-paint.ts
a86b60094f20a1a311c0db4281ad97ec36e591b46abd76a6a798fcf226f59e25  apps/dashboard/src/shipyard/layout/HullPaintPanel.tsx
```

Live small-thruster evidence: `output/playwright/paint-live-thruster.png`; primary/secondary survive a fresh page reload alongside the separately painted main engine. Explicit optical flags take precedence over paintable hardware names.
