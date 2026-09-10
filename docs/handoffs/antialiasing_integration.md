# Antialiasing integration

Status: source and isolated GPU fixture passed; normal-game integration acceptance pending. No public release in this handoff.

The render preference is device-local, separate from graphics color correction, account state and gameplay. `sidereal.antialiasing.v1` stores `{mode,samples}`; default is enabled4× MSAA, with bounded2/4/8 choices. Invalid modes/sample counts preserve defaults. Existing `sidereal.graphics.v1` is unchanged.

`createAntialiasing(scene,camera,{temporalResetIntegrated:false})` returns `snapshot`, `set`, `reset`, `resetHistory`, `dispose`. Snapshot distinguishes requested settings from the actual applied plan and shader warmup/failure. Unsupported MSAA becomes FXAA; supported sample limits are reported. TAA requires texel-fetch, MRT, renderable/filterable half-float targets and an explicit integrated history-reset contract; otherwise actual FXAA and its reason are displayed. Saved user preference remains intact through fallback.

The first camera postprocess input is the actual multisample scene target. “Off” uses a single-sample offscreen scene target, because the original WebGL context requested antialiasing and that context flag cannot be toggled at runtime. FXAA is one final owned pass after other display/selection effects; no default rendering pipeline or duplicate tone mapping is added. Neutral pass overhead is a deliberate cost of true runtime Off/MSAA controls.

SSAA / FSAA explicitly means full-scene supersampling here: twice each target dimension, four times the pixels, downsampled to the unchanged display resolution. Hardware scaling/DPR is never modified. Allocation is rejected above the GPU texture dimension or16,777,216-pixel target budget and falls back to FXAA. It does not imply all meanings of “FSAA” are separate hardware algorithms.

`drawGraphicsMenu` accepts an optional final `{state,set}` antialiasing controller. `GRAPHICS_MENU_HEIGHT` is910 CSS UI units; the owning canvas window must use it for clipping/scrolling. Root owns index/App wiring and combined graphics Reset, which must reset both color settings and AA. Existing local-light controls remain separate. Dedicated AA menus display six explicit modes,2/4/8 MSAA sample buttons, applied mode and fallback reason.

## Temporal qualification and ownership

Installed Babylon9.25 `TAARenderingPipeline` supports velocity reprojection and history clamping. The adapter enables both, keeps camera-motion rejection, uses8 history samples and owns the first two postprocess slots. Its half-float history targets require actual half-float support. Shader passes warm detached before activation. While this orchestration is covered by NullEngine tests, those tests do not prove visual temporal stability or GPU output.

Version-pinned cleanup: Babylon9.25 pipeline disposal does not dispose the supplied `ThinTAAPostProcess` effect wrapper. Our narrow cleanup calls its `dispose()` after the public pipeline disposal, releasing the TAA material jitter manager. The upstream material jitter factory is globally registered; the same version-pinned adapter scopes new material assignment to its owning scene so inventory/portrait preview scenes remain neutral. Tests verify three repeated enable/reset/disable cycles release the actual material manager, preserve external passes and never attach jitter to a second preview scene. Upgrade this integration deliberately with Babylon: this narrow private-field access is not a version-independent API promise.

Before setting `temporalResetIntegrated:true` in the game, connect resets to explicit view/focus changes, camera reset, renderer reconstruction/reconnect, discontinuous teleports/origin changes, deck/instance changes, cutaway/debug visibility changes, and asynchronous equipment/appearance geometry replacement. Ordinary continuous ship/object motion uses the velocity buffer; resetting on every ordinary world XY delta would prevent temporal accumulation. Resize resets are already owned by the helper. The game's custom/transmission materials, animated characters and cutaway transitions still require browser acceptance; stock boxes alone cannot establish that acceptance.

The graphics display and selection passes can attach dynamically. The helper preserves their identities and relative order while restoring its first/last ownership at a frame boundary. Do not introduce another FXAA/default AA pipeline alongside it. Keep temporal capability false until the reset and actual gameplay material contracts pass.

## Evidence

-11 focused tests across antialiasing settings, actual NullEngine pipeline lifetime and canvas drawing.
- Full project TypeScript check passed after adding the helpers and UI.
- Isolated `scripts/antialiasing-review.ts` fixture exports `createAntialiasingReview(canvas)` for a named browser session: diagonal thin geometry, moving sphere, actual Canvas graphics buttons, actual target dimensions/sample readout, disposal. No account or world connection.
- Real GPU/browser screenshots and normal game switching/reset acceptance: pending shared GPU slot.
- Full aggregate check/build and matched publication: parent-coordinated after browser proof; not claimed by the focused tests above.

Primary upstream references: [Babylon default pipeline AA](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/defaultRenderingPipeline/) and [Babylon temporal pipeline](https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/TAARenderingPipeline/). Exact local9.25 `.pure.js` implementations were inspected in addition to these pages.

## Game wiring checkpoint (parent)

`7cf3d131` connects Graphics to the renderer and persists the device-local AA choice; Graphics Reset resets both color correction and AA. `0848c60a` coalesces new-mesh history invalidation once per rendered frame. The root integration opts into temporal history management for explicit focus/camera reset, Deck/Flight, inspected view, deck/seat/vista transitions, stale streams, discontinuous world/local teleports, debug visibility and appearance/equipment replacement. Continuous motion stays inside a velocity-aware envelope. Instance/document changes rebuild the renderer and therefore start fresh history. These are presentation operations only.

Fifteen focused tests across settings, pipeline lifetime, menu and history boundaries pass. Full TypeScript check passed. The actual six-mode browser fixture reports real multisample targets, FXAA pass count and supersampled dimensions with no GL errors; the parent viewed `output/playwright/antialiasing-review/msaa-fxaa.png`. Native animated character and normal integrated game review remain required before publication. No public AA activation is claimed by these checkpoints.

## 2026-09-10 isolated GPU qualification

All six modes produced actual target/sample behavior at960×540 with zero WebGL errors. MSAA used4samples; SSAA rendered1920×1080 and downsampled without changing hardware scale1. Off had zero blended pixels in the monochrome geometry ROI; MSAA3288, FXAA5325, MSAA+FXAA7402, SSAA3260, TAA3133. These are image probe counts, not FPS or visual quality scores. Exact data: `antialiasing_gpu_evidence.json`; screenshots: `output/playwright/antialiasing-review/`.

Temporal teleport/reset changed the previously white sphere centre from[229,242,255,255] to exact background[4,6,11,255] immediately and through subsequent motion. Actual current native crew uses16texture-backed bones; its visible GPU materials have linear object velocity but no per-bone velocity. The bounded palette guard samples after scene/pose observers, immediately before the owning camera draws. Changed visible unsupported skin resets history once before that draw without recompiling material defines. Actual shader factor was1during animation, returning to0.05when the character was paused/static; the UI explains the temporary history reset. Source tests also cover same-frame late pose changes, hidden/removed rigs, static accumulation and bounded malformed/oversized palette handling.

A separate uniform-palette experiment succeeded only with explicit attribute define invalidation:37/37 current native shaders exposed bone velocity, no missing first-frame character pixels, and zero WebGL errors. Bare palette assignment without define invalidation made the character invisible. A qualified prewarm/restore adapter for the small-rig uniform path is being implemented separately; these experiment results do not claim it is already enabled.

The named antialiasing-review session disposed scene/postprocesses, navigated toabout:blank and closed; GPU slot released. Full normal-game cutaways/appearance/graphics-menu/reload acceptance belongs to the combined candidate reviewer.
