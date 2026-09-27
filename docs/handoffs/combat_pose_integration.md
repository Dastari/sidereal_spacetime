# Combat pose integration contract — r002 paired runtime

2026-09-09 (work began 2026-09-08), character/equipment specialist. **Owner-authorized normal-game publication; final visual acceptance remains open.** See the latest [live release record](character_pose_live_release.md), which supersedes the historical development-only restrictions below. The reusable runtime, staged Blender assets, isolated browser harness and validation are implemented. Parent-owned game wiring is **applied in the shared tree**; the generated patch is empty. The historical specialist notes below are superseded by the parent integration and current release records. Remaining visual limitations below mean the entire owner brief has not passed final acceptance.

The user identified the main integration agent in the other conversation/session as the recipient. That session is not addressable through this agent tree; this file is the relay. The specialist's named browser `pose-specialist` was blanked and closed after review; the shared software-GPU slot is released. Other browser sessions were not touched. No deployment, database mutation, network binding regeneration, git commit or blanket staging/reset was performed.

## Exact inputs and candidate

Canonical inputs remain unchanged:

- `assets/source/crew-astra.blend`: SHA256 `28ef2737ea6cbb53e1e45e8c00634459f9f4f008752f4d21bbe7776e9e69d440`.
- `assets/runtime/crew/frontier-crew.glb`: `b857fae93c31dc992b0a1b4dfdd893a06b27221f23ee9af7475bc481417063ce`.
- `assets/source/equipment-kit.blend`: `4325ff3c9a6b7ea833a758bc1a0119972ec474d7b76a782dec20ee6def79a9bf`.

Candidate directory: `assets/art-library/designs/crew.animation.aim/revisions/r002/` (design UUID `7cf6e3fa-6fc7-5041-9830-f0a43f8148c1`). `asset-validation.json` contains every exported file's exact hash and byte size. Key files:

| File relative to r002 | SHA256 |
|---|---|
| `blender-source.blend` | `750487414860372dd6e1a6648050fa87c1c1935955766f59318a776b19e5741a` |
| `crew-poses.glb` | `44af8cbc0bb6f08aa558b9ac2f30359c832e8b52f5a45a3f351ff2a8e25ae00c` |
| `runtime-aim-space.json` | `ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885` |
| `equipment/handheld-source.blend` | `f25ff514cb2ecb07a1bc5a20ec40603f644d8fb362a583080cfb259c62fc47d6` |
| `equipment/carbine.glb` | `aba632e370f18a0be48e8f082c425e0da7f9978e3700ac7211ae1b11efa8e118` |
| `equipment/long-rifle.glb` | `57457e19003fcb6bbe6543dfef3fa2ee317ae9029dad88cbbe19d42889080039` |

The crew preserves all ten looks, 37 visibility meshes, 133 material primitives, nine exported material definitions, sixteen deformation bones and all twelve original animation clips. Validation compares **every original animation sample**, with maximum difference zero; materials compare equal by name, including visor optical extensions. Sixty-three additional clips provide seven nine-sample aim spaces. Eight nondeforming authoring controls remain in the editable source and are excluded from the exported skeleton. Blender constraints have zero influence by default; runtime analytical IK reproduces the dynamic behavior.

The staged long-gun stock islands are natively edited in Blender: rear contact changes from authored glTF Z +0.4315 m to +0.18 m. Forward weapon geometry is preserved. The source also includes an authored flashlight. **Do not apply r002 socket metadata to canonical long-gun GLBs.** `profile-socket-metadata.json` pins the final profiles and measured contact positions. The long-rifle primary contact uses the upper rear grip surface `[0, .03, .055]`; support contact is `[-.065, .045, -.20]`, versus carbine `[-.065, .045, -.12]`. Canonical assets and incoming replacements have not been installed or overwritten.

r001 preserves the reproduced original receiver/stock intersection, initial unreachable fit, original manifests/code and failed unbatched export. r002 retains intermediate failures, parameter searches, earlier audit files and actual review captures. `solved-review-final.blend` reconstructs the runtime carbine pose in editable source; the pistol correction has its own `solved-review-pistol-corrected.blend` and views.

## Exported runtime APIs and solve order

- `packages/content/src/equipment-poses.ts`: version 1 `EquipmentPoseProfile`, `EquipmentPoseItem`, `EquipmentSocket`, seven `EQUIPMENT_POSE_PROFILES`, canonical `EQUIPMENT_POSE_ITEMS`, and `validatePoseItem`. Missing required shoulder/support/sight/direction/display sockets fail clearly. Profiles reference actual exported base clips; backward/strafe/turn are procedural remaps of the existing gait foundation.
- `crew.createPoseController()` in `packages/render/src/crew/index.ts`: lazy opt-in controller, disables the legacy combat layer, picks armor bulk from the resolved look and disposes with crew. Existing callers retain legacy behavior.
- `createEquipmentPoseController(scene, placement, bodyFrame, nodes, hands)`: returns `bind(binding?)`, `update(intent, dt)`, `setAimSpace(space)`, `setArmorBulk(meters)`, `diagnostics`, `dispose()`.
- `createEquipmentVisual(...).createPoseBinding(poseParent, itemOverride?)`, or `bindPoseEquipment(placement, importedRoot, item, poseParent)`: decouples the rigid item from both solved hands; `setMatrix`, `socket`, `restMatrix`, `followAttachment`, `release`. Release restores original attachment/local transforms. Legacy socket-name mapping is explicit in `equipment/pose-anchors.ts`.
- `tracePhysicalBeam(scene, muzzle, range, blockers)`: raycasts along normalized **physical muzzle forward** on each call. There is no cursor input or stale cached world endpoint. Presentation clipping only.
- `startPoseReview(canvas, options)` and `mountPoseReviewControls(review)`: standalone actual-GLB scene, target yaw/pitch, item/profile override, ten looks, action/movement/visibility/pause controls, physical beam, camera and diagnostics. `loadPoseReviewConfiguration()` loads the paired r002 assets and metadata from the managed development origin.

`PoseIntent` uses radians/metres: `yaw`, `pitch`, `facing` in the containing ship's presentation frame (zero yaw faces renderer -Z), `active`, `profile`, optional `moving`, `movementYaw`, `sprinting`, `seated`, `hidden`, `reducedMotion`, `action`, `itemId`, `shotSequence`. `dt` is seconds, finite and clamped to 0–0.1. Root placement already contains camera-origin subtraction and ship transforms; the solver never writes it. Both scene handedness paths and a rotated parent are tested. Reflected equipment preserves semantic socket forward through the glTF conversion root.

Graph: restore prior animation baseline → existing gait + bilinear authored aim samples → bounded visual heading/hips/spine/head adjustment → independent shoulder/grip equipment placement → primary arm IK → support/free arm IK → feet and final clearance validation → physical socket → beam. A second bounded neutral solve can replace an infeasible request. There is no hand→weapon→torso feedback cycle. The implementation limits each search to 12 candidates, at most two passes; fallback suppresses recoil and prioritizes clearance over the requested pitch. It reports achieved aim error instead of steering a laser independently.

Diagnostics include status, CPU time, candidate count, heading/torso/pitch, aim error, primary/support/shoulder/eye error, torso/head and upper-arm penetration, permitted stock compression, physical muzzle, desired direction, pivot, grips, shoulder, sight, eye reference, poles/IK targets and OBBs. Debug geometry is disabled in normal use and reuses its line mesh. Solver math still allocates temporary vectors; see CPU costs.

## Parent patch and required shared changes

`docs/handoffs/combat_pose_integration.patch` changes only:

1. `packages/render/src/index.ts`: optional paired review configuration, create/controller binding, supplied intent and accepted per-item shot sequence, removal of competing whole-avatar aim snap while opted in, physical post-solve muzzle to beam. Unsupported held assets keep their canonical loader path.
2. `packages/render/src/combat-aim.ts`: replace cursor-directed/cached-endpoint beam construction with `tracePhysicalBeam`.
3. `apps/client/src/App.tsx`: explicit **development-only** `?poseReview=r002` configuration and existing combat row's item UUID/shot sequence. No new protocol fields or authority changes.

Generate against the parent's current work with `python3 scripts/stage_pose_integration_patch.py`. Input hashes are in `combat_pose_patch_inputs.json`. `npx tsx scripts/validate_pose_patch.ts` typechecks the proposed parent text through an in-memory compiler-host overlay; `git apply --check docs/handoffs/combat_pose_integration.patch` dry-checks application. Neither applies the patch. Review the generated diff before the parent applies it; the shared tree is changing concurrently.

After parent application, review `http://sidereal.tail7a58a6.ts.net:5173/?poseReview=r002` with equipped carbine/long rifle and accepted shot events. Confirm ordering: controller solves in `onAfterAnimationsObservable` before the beam observer reads its socket. Confirm item UUID switches, hidden cabin, sprint/seating, disconnect/dispose and rapidly reversed intent in the actual game. This **integrated game acceptance has not been performed** by the specialist because those files are explicitly parent-owned. The standalone scene ran on the exact same managed origin. No assets were copied to public runtime output.

The current game only exposes planar aim. Full pitch and the flashlight/scanner variants are review-harness capabilities; do not silently extend gameplay authority. The shared patch retains current rifle laser eligibility; introducing additional live device effects/inventory items remains a separate content/authority decision.

## Validation and measured limits

Latest numerical audit: 2,772 settled cases = two handedness paths × captain/marine bulk × nine item/profile cases × 77 yaw/pitch combinations. Cases include carbine and long rifle sharing RIFLE, separate LONG_RIFLE, both pistol modes, flashlight, scanner screen/directed variants and tool. Yaw: 0, ±20, ±45, ±70, ±90, ±135; pitch: 0, ±20, ±40, ±60, with every combination. Results: 1,677 solved, 1,095 constrained fallbacks; zero unresolved reach/clearance statuses. Maximum primary error 1.883 mm, support 24.320 mm, shoulder separation 106.606 mm, torso/head proxy penetration zero, upper-arm overlap 3.314 mm. These are posing proxies, not exact skinned triangle collision.

The tolerances are 4 mm primary, 25 mm support at full acquisition, 5 mm incidental upper-arm proxy overlap, 12 mm torso/head clearance margin, 130 mm maximum soft shoulder separation and 8 mm stock-only contact compression. The latter two are deliberately generous for the bulky short-arm model and do **not** establish a visually convincing shoulder connection. Girdle translation is capped at 45 mm; two-bone lengths remain unchanged. Settled median solver CPU 0.151 ms, p95 0.688 ms, maximum observed 5.222 ms (NullEngine CPU, not a GPU frame budget).

Transition audit: 4,320 frames, 240 per case/handedness, acquisition → opposite yaw/pitch → accepted recoil → lower → raise. Results: 2,155 solved, 2,165 fallbacks; zero torso/head penetration or unresolved final status. Maximum incidental upper-arm overlap 3.398 mm. **During acquisition/release hands can be 0.423/0.554 m away from their final grip targets**; the fully weighted grip tolerances do not apply while acquiring. This is a foundation, not polished grip timing. A safety fallback may visibly interrupt blending.

Crowd CPU (actual separately instantiated GLBs, observer + solver only; no GPU or full gait evaluation): 1 visible character median/p95 0.807/1.143 ms; 16: 10.037/12.531 ms total; 32: 20.018/24.280 ms total. Hidden 32: 0.0108/0.0117 ms total. This is too expensive to claim a 60 Hz 32-character game budget; shared materials/instances, scratch math and distant-character update scheduling remain performance work. The standalone marine browser scene measured 145 meshes including hidden look slots, 31 active meshes, 19 scene materials, three textures and 57 actual per-frame draw calls (flashlight: 51). Earlier cumulative draw-call figures in interim captures are invalid and superseded.

Required gates: `npm run build` and `npm run art:check` passed. An earlier full `npm run check` passed 237 tests; the latest shared-tree run passed typecheck and 239/240 tests, with one unrelated concurrent failure in `packages/content/src/assembly.test.ts:63`: default assembly placement overlaps `Standard Small (room-storage-container-2.15-0.25)`. No unrelated code was changed or assertion weakened. The documentation check is also run separately because the aggregate command stops at that test failure. Final log copies are retained with the candidate. Focused tests cover actual assets, all neutral profiles, both handedness paths, reflected/rotated parents, finite/no-stretch IK, singular poles, paused baseline restoration, accepted-shot history, hidden/seated cleanup and physical obstacle clipping. `python3 scripts/art_library/validate_equipment_poses.py` independently validates the staged export. Authority was unchanged, so no authority smoke or database reset was run.

Reproduce:

```sh
npx vitest run packages/render/src/crew/equipment-pose.test.ts packages/render/src/crew/pose-system.test.ts packages/render/src/equipment/physical-beam.test.ts
npx tsx scripts/pose_grid_audit.ts
npx tsx scripts/pose_transition_audit.ts
npx tsx scripts/pose_crowd_audit.ts
python3 scripts/art_library/validate_equipment_poses.py
npx tsx scripts/pose_review_metadata.ts
python3 scripts/stage_pose_integration_patch.py
npx tsx scripts/validate_pose_patch.ts
git apply --check docs/handoffs/combat_pose_integration.patch
```

Authoring reproduction: `run_equipment_poses.py`, `stage_equipment_poses.py`, `stage_pose_handhelds.py` and `extract_aim_samples.py` under `scripts/art_library/`. Use a **new revision output directory**; authoring refuses to overwrite existing source. `pose_capture_state.ts [asset]` and `render_equipment_pose.py -- <new-tag> [asset]` reconstruct runtime matrices in Blender. These are batch authoring commands, not service launchers. The Python contact-sheet utility uses `.tools/art/bin/python` and only arranges actual evidence.

## Visual evidence and remaining acceptance

See r002 `reference-before-after.png`, `runtime-profiles.png`, `runtime-looks.png`, `runtime-playback-frames.png`, `blender-final-{front,side,rear}.png`, `blender-pistol-corrected-{front,side,rear}.png`, and `playback-review.webm`. Original full-resolution screenshots and raw recordings are retained under `output/playwright/`; capture scripts/settings and logs are copied into the candidate evidence bundle. All ten looks and four exact aim reference crops were inspected; helmet backs remain closed and visor/emission/material definitions are retained.

The profile contact sheet deliberately labels the **failed intermediate two-handed pistol**. The subsequent corrected centered/high grip `[0, 1.18, -.41]` passes the actual-rig suite and full grids, and has corrected Blender views, but has **not had a fresh final browser capture** after release of the shared GPU slot. The playback recording includes the failed intermediate pistol and actual turn/movement samples. The raw CLI WebM ended prematurely when its browser closed; the recovered clip is playable but does not prove every requested transition. Seated/sprint stills alone do not establish timing or gait quality.

Remaining limitations preventing final sign-off:

- LONG_RIFLE implements distinct support reach and a clearance-checked, bounded head/eye correction, but neutral scope-eye residual is about **0.304 m** (grid maximum 0.371 m). The optic is visibly too low/far from the eye. Further authored stock/optic/helmet fitting is required; do not describe this as accepted precision-rifle sight alignment.
- Rifles are carried low; the stock-to-shoulder soft gap remains visually noticeable. Proxy clearance passing is not visual approval. The conservative helmet box and pinned short arm chains force many extreme requests to neutral fallback.
- Backward/strafe and turn-in-place use preserved gait plus procedural feet/hip support, not seven finished new locomotion clips. Reload is an exposed preview action/extension point, without authored reload manipulation or ammo authority. Equip/unequip and device use have bounded layering foundations, not polished prop-transfer choreography.
- Final grip acquisition, seated/sprint playback and the corrected pistol need a fresh coordinated browser review. Pose blending can use abrupt safety fallback. Debug boxes/targets are present, but final integrated product diagnostics are parent-owned.
- The paired development game integration is applied. Exact owner art approval remains pending. Do not publish this revision as finished art.

## Coverage of the 31-section owner brief

| Section | Implemented behavior / acceptance status |
|---|---|
| 1 | Original penetration reproduced; new paired candidate clears settled/transition body proxies. Main game application pending. |
| 2 | Head/chest/abdomen/upper-arm OBBs and measured item-part OBBs; SAT checks. |
| 3 | Semantic shoulder pocket and stock contact, bounded soft separation; visual contact still needs refinement. |
| 4 | Shoulder-contact rigid pivot for long guns. |
| 5 | Clearance/reach priority and bounded neutral fallback with reported aim error. |
| 6 | Independent equipment controller, primary then support IK; no cyclic dependency. |
| 7 | Deterministic elbow poles, degeneracy handling, bend limits, no bone stretch. |
| 8 | Seven versioned data profiles with required-anchor validation. |
| 9 | Authored rifle aim base plus hips/spine/feet support; low carry remains an art limitation. |
| 10 | Distinct long support and soft eye correction; scope alignment not visually accepted. |
| 11 | Pistol support targets dominant grip; final numeric/Blender correction passes, browser re-review pending. |
| 12 | One-handed pistol with deliberate free arm. |
| 13 | Flashlight asset/profile and physical direction beam in review harness. |
| 14 | Directed and display-reading scanner variants. |
| 15 | Seven nine-sample Blender-authored/exported aim spaces, bilinear runtime blending. |
| 16 | Existing locomotion layer preserved; backward/strafe are procedural foundations. |
| 17 | Upward spine/arms/hips response; infeasible pitch falls back outside body. |
| 18 | Downward compensation and the same clearance priority. |
| 19 | Bounded aim/yaw and visual heading catch-up; canonical placement unchanged. |
| 20 | Smooth 35–65 degree turn range, hip participation and alternating foot support foundation. |
| 21 | Physical socket ray helper and unapplied shared beam correction; no client damage authority. |
| 22 | Semantic socket schema, compatibility aliases and measured staged metadata. |
| 23 | Carbine and longer rifle tested with one RIFLE profile. |
| 24 | Existing 12 clips plus pose layering/actions; reload and full choreography remain foundations. |
| 25 | Accepted UUID/shot-sequence recoil, bounded recovery and feasible-pose suppression. |
| 26 | Acquisition/release and profile baseline reset; timing/popping limitations explicitly retained. |
| 27 | Editable Blender controls, native handheld edits, preserved deformation contract and runtime IK. |
| 28 | Primary technical research mapped below. |
| 29 | Runnable full target-grid scene, numeric audits, actual screenshots and retained partial playback. |
| 30 | Desired/actual rays, contacts, eye/sight, poles, targets, OBBs and numeric heading/turn diagnostics. |
| 31 | Not signed off: low stock hold, optic fit, acquisition/playback polish and integrated game review remain. |

## Research mapped to this implementation

Blender [IK and pole targets](https://docs.blender.org/manual/en/latest/animation/constraints/tracking/ik_solver.html) inform fixed bend controls, no-stretch chains and authoring helpers. Epic [Two Bone IK](https://dev.epicgames.com/documentation/unreal-engine/animation-blueprint-two-bone-ik-in-unreal-engine) and [Hand IK retargeting](https://dev.epicgames.com/documentation/unreal-engine/animation-blueprint-hand-ik-retargeting-in-unreal-engine) inform socket adaptation and primary/support ordering. [Aim offsets](https://dev.epicgames.com/documentation/unreal-engine/aim-offset-in-unreal-engine?lang=en-US) map to the exported nine-sample local-rotation library; [animation layers](https://dev.epicgames.com/documentation/unreal-engine/animation-blueprint-linking-in-unreal-engine) map to baseline restoration, gait, upper-body and final IK. [Root-offset/turn examples](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-animation-sample-project-in-unreal-engine) inform presentation-only body catch-up. [Leupold eye-relief guidance](https://www.leupold.com/blog/post/how-to-adjust-your-riflescope) motivates an optic-specific measured eye socket and soft head adjustment, not a universal eye distance. Installed Babylon 9.25 linked glTF TransformNodes, quaternion/matrix, ray-picking and SceneInstrumentation APIs were checked locally. No proprietary clips or rigs were copied.

SpacetimeDB still owns permissions, equipped UUID, aim intent, energy, cooldown and accepted shots. Existing combat does not simulate projectile hits/damage. A later projectile implementation must derive or validate a server-owned muzzle/aim envelope; these visual matrices and local raycasts confer no authority. Inventory balances, private views, world transforms, control grants and operation-ID behavior remain untouched.

## Parent shared integration — 2026-09-09

The paired r002 review option is now connected in the actual game at `https://sidereal.tail7a58a6.ts.net:8444/?poseReview=r002`. The staged patch is reconciled against current sources; regeneration is empty because the shared connections are applied. The canonical default character/equipment assets remain separate from this development review option. This is an integrated working candidate, not final art approval.

Actual game browser gates completed with the dedicated linked review account: aim reversal; accepted carbine shot (energy120→116, sequence0→1); physical muzzle beam (direction dot1, reconstructed start error4.4e−16m, obstacle-clipped length below60m range); top-down hidden/return; sitting without changing camera alpha/beta; leaving via the station UI; sprint movement with beam suppressed; pistol/rifle inventory switching with all seven item UUIDs retained. Corrected pistol actual PNG: `output/playwright/pose-r002-actual-corrected-pistol.png`. The captured pistol primary grip residual was0.0676m, so that still does not establish final hand-contact acceptance. The seated review character stayed in the same station across a72-second authenticated ticket-renewal test.

Evidence logs are `.runtime/pose-behavior-review.log`, `pose-transitions.log`, `pose-seat-actual.log`, `pose-sprint-actual.log`, `auth-seated-continuity.log`, and `pose-pistol-actual.log`. Numerical transition stepping uses the actual App update and pose/animation observers with GPU drawing skipped; actual PNGs use full scene draws. These samples are not real-time playback or hardware-performance evidence. Historical-shot reset, unsupported binding and disposed/hidden muzzle cleanup also have focused actual-rig/beam tests. Final uninterrupted acquisition/gait/reload playback and the already documented low rifle/optic fitting remain unresolved art work.

A final full-draw weapon-switch review exposed a visor material holding a disposed Babylon scene transmission target (`getRefractionTextureMatrix()` returned null). `transmission-lifecycle.ts` now validates the pinned helper's shared target before render and recreates it through the helper, preserving and rebinding actual transmission materials. The focused test reproduces disposal, verifies the new target and material binding, avoids repeated recreation and verifies cleanup. The original disposal caller was not conclusively isolated; repeated inventory/character cycles after recovery did not reproduce it. This is a bounded lifecycle recovery at the SDK boundary, not a claim that material transmission was removed or the source caller identified.


## Earlier development-gated integration checkpoint (superseded)

At this earlier checkpoint, the normal game installed the owner-authorized modular character calibration r008; the analytical equipment pose controller remained opt-in under `?poseReview=r002`. The subsequent owner authorization and normal-game activation are recorded in [the live release](character_pose_live_release.md). It has not been transferred onto the new modular bodies or their mixed armor. The review option always uses the exact legacy paired crew and handhelds listed above, including their authored aim space and corrected sockets. It never combines those stock/grip offsets with the normal equipment GLBs.

Current repairs reconcile the already-applied shared patch:

- The old `/@fs/.../assets/art-library/...` review URLs returned HTTP403 after the workspace privacy rules were tightened. The client Vite development middleware now serves only eleven allowlisted GLB/JSON runtime inputs at `/__pose-review/r002/`, snapshots the entire paired set together, and verifies every file against `delivery-manifest.json` plus the applicable `asset-validation.json` record before serving anything. It rejects mismatches, native Blender sources and arbitrary paths. The middleware is absent from build/preview; the normal filesystem deny rules remain. No staged combat assets are copied into public/runtime output.
- The HTTP-to-HTTPS sign-in handoff preserves the query so the requested review mode survives authentication.
- Live walking previously snapped placement to travel and then subtracted that same heading, always supplying zero movement yaw. Active bound aiming now retains placement facing, passes absolute travel heading, and remaps gait against the current solved heading plus torso angle. Active movement uses bounded aim catch-up; lowering and sprinting restore travel-facing placement. Standalone relative movement overrides remain supported.
- Existing accepted item UUID/shot sequence wiring, post-solve physical muzzle beams, unsupported-item fallback, hidden/seated suppression, equipment generations and disposal are preserved. No simulation, permissions, inventory rules, protocol or combat authority changes are part of this release.

Remaining art work is still open: low rifle/stock carry, excessive eye/scope gap, pistol hand contact, acquisition safety fallback, gait/prop-transfer/reload polish and uninterrupted playback/performance acceptance. Passing clearance tests does not approve any art revision. The normal r008 visual publication is recorded separately in `assets/art-library/character-components/publications/r008/`; it does not approve or publish `crew.animation.aim/r002`.
