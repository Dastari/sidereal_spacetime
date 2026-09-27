# Fog5 isolated candidate wiring

Proposed patch only; shared candidate/worker were not modified. Root applies between captures. Existing /planet-reference-cloud-kit.json should serve toxic-fog-r005/kit.json for this Toxic diagnostic only; serve its texture directory at /planet-reference-weather-assets/. Preserve normal Cloud2 mappings for other styles.

Worker selects the Toxic fog path only when recipe.style=toxic and cloudKit.layout=toxic-fog-banks. Explicit material role8 is the current Toxic4 chemical-active material contract. Area-weighted active-region triangle ranges derive up to12 stable partId anchors; no name regex or camera/limb fallback. Current recipe.cloudCoverage controls count. Anchors use mean authored chemical radius+.10 along the weighted region direction. This is a documented placement starting point requiring actual visual review, not a claim of vent collision clearance. No anchors produces no fog rather than unrelated fallback clouds.

UVs now survive worker serialization/upload. Runtime creates one authored referenceMaterial per body, loads true sRGB alpha density using the weather texture prefix, shares material across cached LOD meshes, precompiles as before and disposes through the existing body lifecycle. The Toxic path does not apply the old green multiplier, directIntensity2.4 or translucency. Other Cloud2 weather behavior stays unchanged. No weather shadow pass is added.

Focused tests cover actual Toxic4 identity/LOD/coverage, invalid ranges/role/budget rejection and NullEngine alpha material/UV/shared-LOD behavior. This is only isolated wiring; fog5 local preview still exposes a card junction/fringe and does not pass art acceptance.
