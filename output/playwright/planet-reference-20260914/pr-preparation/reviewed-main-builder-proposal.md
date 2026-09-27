# Next bounded unit: validated nine-main composition dispatch

Proposal only. Worker lifecycle, runtime selection, content and assets remain unchanged.

Add `packages/render/src/environment/reviewed-native/build-reviewed-main-planet.ts` exporting a pure `composeReviewedMainPlanet` with validated body kit, optional validated weather kit, recipe, seed and LOD. It returns `{batches, shadowRadii, weatherShadowRadius, weather, smoke}` matching reference worker buffers/ranges exactly. Keep `performance.now()` / `buildMs` in the invoking worker, outside the pure builder. Do not create a Worker, scheduler, URL resolver, mesh or material here.

Use an exhaustive explicit main-only layout switch:

| Layout | Existing extracted implementation |
|---|---|
| desert-geology | composeDesertReference |
| rocky-crater-geology | composeRockyReference r010 |
| temperate-native-continents | composeTemperateReference r003 |
| single-glacial-cut-diagnostic | composeIceReference r025, source Ice26 |
| volcanic-regional-geology | composeVolcanicReference r023 |
| gas-bands-and-rings | composeGasReference, source Gas5 |
| ocean-island-geology | composeOceanReference r007 |
| connected-toxic-crust | composeToxicReference r007 |
| crystal-geology | composeCrystalReference r013 |

Reject every moon/unknown layout. No default-to-Desert behavior. Header/style/appearance identity matching must be explicit; a layout is not permission to relabel one of the19moons as its parent. Validate finite recipe/seed and exact LOD0/1/2. Preserve diagnostics as an explicit review-only option if needed, without production selection logic.

Weather must reproduce the reviewed worker:

- Toxic plus toxic-fog-banks uses composeClearedToxicReferenceWeather(weatherKit,seed,coverage,batches,[8]); preserve its UVs, colors and placement ranges, and clearance computed against final terrain.
- Other positive cloudCoverage with a native cloud kit uses composeNativeClouds(...)[0], then the exact existing weather wrapper (positions/normals/indices arrays, white RGBA, faces and ranges). Do not silently change multi-material behavior in this extraction.
- Smoke uses buildReferenceVolcanicSmoke(recipe,lod) independently of cloudCoverage, preserving its effective-resolution limits and existing planetEffects semantics.
- Every body/weather bound uses referenceShadowRadius on actual positions, never the AABB diagonal.

The existing ModernNativePlanetKit schema is readonly and includes all modern main/moon layouts; legacy NativePlanetKit has mutable arrays and only old layouts. Do not widen the legacy validator or use `as any` to bypass this mismatch. Add a structural readonly composer-input type or narrowly adapt composer signatures (no algorithm edits) and keep the main allowlist at the dispatch boundary. Native cloud/fog weather layouts are not accepted by the current modern body validator: add a bounded dedicated weather validator or a validated weather input contract; do not pretend body validation covers them. Validate payloads once when registering/loading assets, not again per LOD build.

Parity gates after the heavy slot is released: compare new dispatch output to the prior direct-composer/reference-weather path for all nine exact kits, representative seeds38/117/904 and LOD0/1/2, including every typed-array byte, material index, range ID, weather/smoke buffer and radial bound. Assert all moon/unknown layouts rejected; wrong style/layout and malformed weather rejected. Run tests one process at a time with released fixtures. Existing direct fixture tests are in reviewed-native-extraction-dependent-tests.json and reviewed-weather-extraction-dependent-tests.json.

Integration afterward should call this function from BOTH the review worker's main branch and production's existing shared planet-worker. Production currently sends every non-glacial nativeKit to old buildNativeVolcanicData, so it needs an explicit modern request/result discriminant before that legacy branch. Preserve createPlanetWorkerClient/createPlanetBuildScheduler: the review worker's per-body initialization/lifetime is not the production transport to copy.
