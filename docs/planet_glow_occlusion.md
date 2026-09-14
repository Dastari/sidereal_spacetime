# Planetary glow foreground occlusion

Date: 2026-09-08
Status: Implemented; controlled actual Babylon GPU comparison passed.

The planet deposit GlowLayer included only planet meshes. In the installed Babylon `ThinGlowLayer`, `_shouldRenderMesh` delegates to `hasMesh`; a ship excluded from that list contributes neither color nor depth to the mask. The blurred planet deposits therefore appeared through opaque ship floors even though the ordinary geometry pass correctly hid the planet.

`packages/render/src/glow-occluders.ts` registers opaque foreground meshes in the existing mask and selects black emission for those meshes only. Their main materials and the local instrument glow layer remain unchanged. Actual planet emission retains Babylon's material color, texture-level and emissive-intensity convention. The environment exposes `setOccluders`; the game supplies imported ship meshes and crew children, refreshing after equipped meshes attach. Disposed/replaced equipment is removed from the registration and its observer is released. Transparent material surfaces are excluded from this opaque blocker registration; cutaway visibility is retained in the mask alpha. No new glow pass or light is introduced.

The controlled tailnet-browser proof uses the canonical native Blender floor-square GLB above an actual `createLayeredPlanet` volcanic planet with the production glow settings. At 500×500 pixels, the central 60×60 floor sample has mean RGB 134.31296296 with glow off and with the fix, versus 141.28185185 with the old unblocked mask. Its maximum channel falls from 176 to the baseline145. Visible deposits outside the floor retain their glow. This is a controlled pipeline proof using the actual asset and renderer, not a claim of an identical camera replay of the user's ship screenshot.

Evidence: `output/playwright/planet-glow-floor-off.png`, `planet-glow-floor-unblocked.png`, and `planet-glow-floor-fixed.png`. Two focused tests cover black foreground emission versus retained planetary emission, material preservation, cutaway alpha, replacement/disposal and callback cleanup. Final project checks/build are coordinated by the integration owner. Ordinary bloom may still spread slightly across a visible edge; hidden source patches beneath an opaque floor no longer contribute.
