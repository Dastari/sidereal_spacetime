# Camera framing and uniform temporal AA — live

2026-09-10: client `20b3025fefee561e2653b7409c68a81da9385171d45212e09e40fa73871bafad` is live. Entry `/assets/index-T8-Xg53i.js` SHA256 `bd741011013b3cb63a6a297b5ef2fc3f3731f8cca42a51c5289c6e06273688e4`. World remains `8afe80944ba6aaf47f997f8b1de2736d2b88568c1f3cf44753a54ecb82f9fe9a`; delivery remains `520de12b8dada34e0016524008d5e098af7b5cd1ac42a89f7875024898e5678d`. This frontend-only guarded activation replaced b3d75db5 without database publication, restart or backup.

The candidate preserves the exact external native backpack/drop release: all 13 recorded changed paths were checked against their old and new hashes before forward integration. It adds camera commits 3717f5bd/8d96c02c and uniform AA d46e15c3 to the previous combined rendering source. Private immutable source/evidence: `.runtime/release-checkouts/aa-camera-followup-20260910` and `.runtime/releases/aa-camera-followup-20260910`; use `forward-artifact.json` and `native-ground-forward-delta.json`, not the superseded first artifact manifest.

Final isolated typecheck, 1,347 tests across 220 files, 77 documentation checks and full `npm run build` passed. Asset checks passed; the forward backpack delta changed no art. The isolated full build was validation only: its world output was not published.

## Actual normal game acceptance

An existing ordinary dedicated review character (e2751a5a-fbff-426b-9f45-023c76c98dfb, ship8645c1b3-ade1-4644-a4bd-6dbd0070d036) walked through normal keyboard intent to supported local (.2869291941,9.1306973829,.1875). No owner account, inventory or direct authoritative pose was changed.

At approximately2m close zoom, the original camera projected enabled avatar feet at y743 and torso630 in a600px viewport. After the fix, the same accepted local pose projected feet390, torso288 and head196; all20 selected skin meshes were in the frustum. The camera azimuth differed by approximately.239rad between captures as the ship/review progressed, so this is not an exact pixel pair. Pure tests cover480 projections across angles. The fix changes camera follow weighting only; walls retain ordinary depth occlusion and no geometry is forced always visible.

Normal Graphics→TAA kept the visible16-bone character on its original texture palette while shaders warmed, then qualified20/20 visible skin shaders with actual BONES_VELOCITY_ENABLED and uniform palettes. Off restored texture palettes; no warm meshes or GL errors remained. The separate controlled native GPU test recorded12 animated frames accumulating at factor.05; moving gameplay camera history still resets legitimately. This is not a hardware FPS claim.

Unmodified public reload loaded the exact T8-Xg53i entry, retained saved TAA, reached scene ready with2,533 meshes and the native16-bone uniform palette, and returned GL error0. `output/playwright/camera-aa-followup/public-complete.png` was visually reviewed. Nearby JSON/PNGs record before/after framing, first TAA frame, settled TAA and the public result. Actual Account→Sign out, about:blank and named browser close completed; private literal login scripts/logs were removed. GPU passed to the separate wall-batching review.
