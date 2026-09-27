# Combat r003 and F3 integration

Status: delivered r003 art and installed r008 bundle approved by the owner and live in public client8246fafc. Normal public login/render/F3 review passed. Continuous playback and performance remain technical follow-up. See [the exact public release](character_f3_public_release_20260910.md).

The normal development and public loaders select `/assets/crew/poses/r003/`. It uses the existing modular r008 male/female bodies, components and sixteen-joint rig. It does not load the historical r002 comparison crew. The exact new handheld namespace and preservation snapshot are recorded in [the installation receipt](../../assets/art-library/designs/crew.animation.aim/publications/r003/publication.json); r002, the modular kit and canonical equipment remain unchanged.

## Applied behavior

- Noncombat armed movement takes travel facing immediately. Active aim still turns at the profile's bounded rate; sprint suppresses the aiming stance.
- Ordinary rifles have a forward shoulder stance and two-handed downward low ready. The former broad hip-held stance survives as `HEAVY_WEAPON`, ready for a separately authored suitable item.
- The actual r003 rifle meshes have native Blender receiver-side support shelves and matching hand sockets. Socket metadata is never paired with the old rifle geometry.
- Cursor picking resolves a visible surface or the current deck, then supplies yaw and pitch to the rig. The renderer reads the final physical muzzle after IK and clips its forward ray against scene obstacles. It does not steer the beam independently toward the cursor.
- The combat cursor has a transparent central target and cyan/white marks. UI controls keep their own pointer/text/drag cursors.
- The one-handed pistol's free arm rests beside the hip. Knee poles follow the animated toe direction, retaining foot targets while the pelvis turns.
- F3 offers skeleton, light-volume and collision overlays plus a global-illumination override. See [F3 usage and coverage](../render_debugging.md).
- Native assembly materials now register with the scene after cloning. This fixes the owner-reported disappearance of walls/furniture when Lighting or Shadows is disabled, including normal graphics settings. See [the defect, narrow change and regression evidence](debug_native_material_registration.md).

Inventory, accepted transforms, permissions, equip UUIDs, combat reducers and shot-sequence authority are unchanged. Pitch is local visual presentation; it does not introduce vertical damage or client-authored hits. Historical accepted shots do not replay after re-equipping; hidden, seated, lowered and sprint states suppress the visual muzzle.

## Exact asset pairing

| Artifact | SHA-256 |
| --- | --- |
| Modular r008 crew | `ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150` |
| r003 native handheld source | `649dd3b63d2f1cfe07eadd49de7e33968386dd0a7d41d09f5c2f890be7395f3f` |
| r003 carbine GLB | `394d9577d078c21b1066743ab9dd5760d63fb9f6a161e4e823ae2ebbec25f983` |
| r003 long-rifle GLB | `1aff2054ef80836d2e13624dca342fa99e1c43518ef0c9cfe180fddefdd96031` |
| r003 socket metadata | `f9f35de6789cdc6c37373368c57b181d48e07643206e06922b58ff0939a0bc03` |
| Paired aim space | `ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885` |

The remaining five handheld GLBs are byte-identical to r002. The [complete delivery manifest](../../assets/art-library/designs/crew.animation.aim/revisions/r003/equipment-delivery-manifest.json) and installer validator cover all ten runtime files. The normal loader reads current profiles from TypeScript; the historical metadata values remain archived as provenance.

## Validation so far

- `VITEST_MAX_WORKERS=2 npm run check`:1,231 tests in205 files and77 document checks passed after the material registration repair. Two prior unrestricted runs timed out only in the existing planet-detail degradation test at20seconds; that test passed alone and in the capped runs. No timeout or assertion was weakened.
- Full project build and asset checks passed after the namespace switch and material repair; asset validation also verifies all287 preserved prior/canonical artifacts. Final logs: `.runtime/combat-r003-check-lighting.log`, `combat-r003-build-lighting.log`, `combat-r003-art-lighting.log`.
- Actual modular-asset tests cover both bodies, medic and mixed-heavy armor, seven handheld items, pitch ±0.6rad, reversal, gait samples, low ready, immediate travel facing, accepted recoil, item switching, historical-shot consumption, seating, sprint, hidden state and disposal.
- [Independent numerical transitions](../../assets/art-library/designs/crew.animation.aim/revisions/r003/validation/independent-transitions/README.md):900 recorded frames across both bodies/rifles, all solved, zero body/upper-arm proxy penetration. Worst support error9.8mm. This uses a static Idle-Rifle sample, not advancing gait playback.
- [Native comparison C](../../assets/art-library/designs/crew.animation.aim/revisions/r003/native-character-preview-c/REVIEW.md):13 current poses,22 CPU Blender images and13 editable actions. Independent review found no blocking settled-fit defect, including both mixed-heavy bodies. Fresh Blender reopen verified all16 joint matrices for each action.
- [F3 browser component evidence](../../output/playwright/combat-r003/f3-component-review.json): real CanvasUI controls, toggles, persistence/reset, scrolling and cursor state at1000×800 and540×420. This used a NullEngine scene with WebGL disabled and mock performance counters; it is not a normal-game overlay capture.

## Remaining review and art work

The shared software-GPU slot remained owned by `refit-browser-review` and was not disturbed. A separate Windows hardware browser reviewed the actual App at the managed HTTPS development origin with the normal r003 defaults. Its valid provider session was mounted around AuthGate and the transport redirected to an isolated database using the staged refit world artifact. This is a controlled integration harness, not proof of an unchanged development-login flow or a public release. Exact source hashes, images, actions, database and limitations are in [the hardware capture record](../../assets/art-library/designs/crew.animation.aim/revisions/r003/runtime-review-20260910/capture-record.json).

Fresh-source Lighting Off and Shadows Off retained62 enabled wall meshes, with zero unregistered live mesh materials. Real skeleton, all five current light-source guides, static admitted collision outlines and GI override were checked. Turning GI off zeroed environment/hemi fill while preserving direct intensities. The independent reviewer confirmed walls remain visible in both final toggle images.

The settled carbine physical beam reached the projected floor cursor within0.34px before firing and0.50px after accepted firing. Its physical forward vector changed vertically, and obstacle clipping was observed. Accepted shot sequence advanced0→2, pistol switching used that item's own sequence0, and re-equipping the rifle retained sequence2. The full pistol character window independently confirms the free hand at hip height and straighter knees. The character hide/restore control suppresses the avatar and beam correctly. App shutdown disposed the actual scene/engine, all render loops and debug meshes; both named hardware tabs were blanked and review auth removed.

The preview did not consistently provide OS focus or animation frames, so controlled movement samples used a temporary focus fixture and timed calls to the actual render loop. Later raw active/sprint attempts remained inactive or received delayed/uncontrolled input; these are preserved as inconclusive, not passed. Sustained sprint, seating, smooth acquisition/gait and reduced-motion playback still need a clean continuous hardware session; current focused tests and the earlier live integration review cover those state connections. The subsequent owner authorization enabled the guarded client-only release against the already live refit2ade world. Its matching HEAD generated bindings were retained; ongoing cargo bindings/authority remain a separate candidate.

Before owner approval, the reviewer noted long-rifle optic-to-eye/stock fit and high, stiff low-ready elbows as possible future polish. The owner subsequently accepted the delivered art. Rapid reversals intentionally have acquisition lag; the physical beam follows the actual barrel throughout. Extreme targets beyond joint limits cannot be represented as instantaneous cursor hits. Static images and numerical clearance are not owner approval or finished playback choreography.

The living design entry is [crew.animation.aim](../../assets/art-library/designs/crew.animation.aim/DESIGN.md), currently r003 and artistically signed off by the owner on2026-09-10. The installed r008 bundle is also approved. Preserve candidate A/C, failed diagnostic runs, the pre-approval review notes and all exact source/evidence revisions. Technical playback follow-up is distinct from that recorded approval.
