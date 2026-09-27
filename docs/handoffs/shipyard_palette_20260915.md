# Shipyard palette resize and native previews

Status: implemented and verified in the live development dashboard; no art or gameplay contract completion claimed.

## Entry record (before code)

Shared HEAD: `9c58c07774d7d3c4a58a40c49e90f2a2c647249c`. Isolated branch `fix/shipyard-palette` was created from upstream main e9ece207 then stacked on armor editor da9fdda6, which contains its required catalog and CI fixes. PR targets that existing branch; other owner planet changes remain separate.

```text
9c58c077 R16: complete Shipyard rebuild surfaces and native Wayfarer armor
2af5fb3e IFCS phase 6: verify compiled-only flight, unified installation, redacted client ratings and isolated smoke
c2d26673 IFCS phase 5: verify compiled plumes, mass review and forward-turn-removal browser evidence
146c4401 IFCS phase 4: verify computer power cutoff, bounded supply and accepted thrust consumption
cd09510c IFCS phase 3: verify compiled authority, passenger COM motion, availability producers and additive migration
```

Native input pins: {'assets/art-library/framed-wayfarer/r005/library-02/hull.glb': 'dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8', 'apps/dashboard/src/shipyard/layout/armor-kit-r005.json': '9edca3929b9ec9cf3a11df6b92fe3a896f27e7b949c6a6d6f95ec87cd369e59d'}

Shared dirty files (preserved):

```text
 M CHANGELOG.md
 M apps/dashboard/package.json
 M apps/dashboard/src/planet-studio/PlanetStudio.tsx
 M apps/dashboard/src/planet-studio/planet-studio.css
 M apps/dashboard/src/shipyard/layout/DocumentBar.tsx
 M apps/dashboard/src/shipyard/layout/LayoutEditor.tsx
 M apps/dashboard/src/shipyard/layout/NewLayoutDialog.tsx
 M apps/dashboard/src/shipyard/layout/useLayout.ts
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
?? apps/dashboard/src/planet-studio/ReviewedPlanetStudio.tsx
?? apps/dashboard/src/shipyard/layout/armor-kit-r005.json
?? apps/dashboard/src/shipyard/layout/armor-review.test.ts
?? apps/dashboard/src/shipyard/layout/armor-review.ts
?? docs/adr/
?? docs/genesis_native_planets_spec.md
?? docs/handoffs/armor_editor_live_checkin_20260915.md
?? docs/handoffs/genesis_native_integration_20260915.md
?? docs/handoffs/genesis_native_packaging_20260915.md
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
?? scripts/art_library/build_armor_editor.py
```

## Implementation contract

Reuse the persisted Structure panel widths and accessible resize handle in Hull/Objects. Prevent horizontal palette overflow and wrap complete names. Publish per-model static thumbnails rendered from the exact r005 native GLB, with a source/hash manifest, without new runtime WebGL contexts or model changes. Keep mobile drawers and collapsed panels usable. Verify resize, keyboard operation, persistence, palette images and placement in a real browser; run required check/build. Apply only scoped own changes to the live development dashboard at port 5174. Deliver via a PR; do not merge this new PR without owner instruction.

## Verification and delivery

- Isolated `npm run check`: 349 test files / 2,080 tests pass; docs check passes. Initial missing LFS input failures were resolved by hydration, with no validator changes.
- `npm run build`: world build/bindings and both independent application builds/precompression pass. No world publication or game rollout.
- `npm run test:python`: all standard, art and native geometry suites passed.
- `npm run lint` and `npm run format:check`: zero new/changed violations. Eight packaging tests and the native thumbnail coverage/hash test pass.
- Real Chromium at 1720 × 1020: pointer drag to 368 px; width retained in Objects and after reload; Home/End reach 200/380 px; 200 px drawer has no horizontal overflow; closed handle is not focusable. At 700 × 900, mobile drawer opens with wrapping images and no page overflow; resize handle is hidden.
- All 76 native palette images decode to 256 × 256. Images are unique and pinned to the exact native GLB, with source selectors and SHA-256 records in `assets/art-library/framed-wayfarer/r005/thumbnails-r001/manifest.json`.
- Applied only scoped source patches and new thumbnail PNGs to the shared tree. Browser verified all 76 images and resized drawer at the owner’s exact `http://sidereal.tail7a58a6.ts.net:5174/shipyard` URL. The four changed UI/catalog files match the tested isolated candidate byte-for-byte. Other owner planet/public assets preserved.
- Browser evidence: `output/playwright/palette-live-5174.png`, `palette-mobile-open.png`, `palette-initial.png` in the isolated worktree. These are validation artifacts, not new approved art.

PR delivery: [PR #8](https://github.com/Dastari/sidereal_spacetime/pull/8), implementation commit `46ffd6a6`. Hosted CI pending at handoff update. This PR is stacked on `shipyard-armor-editor` (PR #4). Main’s newer Genesis change was not replaced or republished. No game or native art contract is marked complete by this UI fix.

Live assembled Wayfarer review screenshot: `output/playwright/palette-live-wayfarer.png` (84 components, native exterior visible, image palette loaded). Its status is `169 native boundary pieces · physical qualification pending`; the earlier browser wait expected the wrong status text, so the assembled ship was checked by screenshot instead. Standalone empty-draft placement created an editable part but showed only its selection outline in the isolated browser; this existing renderer path was not changed by the palette patch and is not claimed as gameplay evidence.

## Duplicate palette follow-up

Entry: isolated HEAD 82c11593c7a42f766731abda9213b8971a1f8416, shared HEAD 9c58c077; shared dirty files still preserved, including newer planet and renderer work. Native source remains dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8.

Diagnosis: native parameter hashing distinguished integer and floating-point spellings of the same dimensions. Collapse equivalent complete parameter records in the palette, preserve all placed asset IDs and GLB selectors, and label total depth to distinguish real bulkhead variants. Add regeneration and regression checks; verify the live palette and deliver through the existing PR #8.

Follow-up verification: `npm run check` passes 349 suites / 2,082 tests plus documentation checks; full `npm run build` passes. Thumbnail and packaging Python tests pass; lint/format report no new violations. All 13 alias pairs have identical native mesh attribute/index buffers. Real browser at owner port 5174 verifies 63 unique card labels, exactly one 2 × 3 m red-service/utility/vent at 1 m depth, all 63 images decoded, and no horizontal overflow at 200 px. Screenshot: `output/playwright/shipyard-palette-20260915/duplicates-fixed.png` in the shared workspace. Preserved all 76 native asset records and all placement IDs. This is a palette fix, not an art or gameplay completion claim.
