# Bevy Low-End GPU Browser Performance Handoff - 2026-06-04

Status: Active
Lifecycle: handoff-open
Category: prompt
Last updated: 2026-06-04
Owners: client/runtime performance
Scope: Investigate why Sidereal's top-down Bevy client can feel slow on the user's GT 730 Windows/browser machine.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/prompts/audits/bevy_2d_rendering_optimization_audit_prompt.md
- docs/reports/audits/bevy_2d_rendering_optimization_audit_2026-04-23.md
- docs/plans/completed/runtime_optimization_scalability_plan_2026-04-29.md

## 0. Status Notes

2026-06-04:

- Open action added from the user's performance discussion. This is not yet an investigation result; it records the machine context, first-pass hypotheses, and the validation work needed before making a Bevy, renderer, or client-architecture decision.

## 1. User Question

The user is building toward a pixel-art style top-down space ARPG and observes that visually richer 3D browser games run acceptably on the same machine, while a top-down Bevy client with limited entities can struggle.

Questions to answer:

1. What about Bevy, or Sidereal's current use of Bevy, makes this slow?
2. Is Bevy 2D slow because it is always a full 3D-rendered environment?
3. Does it rely on hardware acceleration that is emulated by hardware, Bevy, the browser, or the OS if unavailable?
4. Why do older top-down games run so smoothly on the same machine?

## 2. Machine Context

User-provided DxDiag summary:

- OS: Windows 11 Pro 64-bit, build 26200 / 26100 family.
- CPU: Intel Core i7-12700K, 20 logical CPUs, approximately 3.6 GHz.
- RAM: 32 GB.
- GPU: NVIDIA GeForce GT 730, 2 GB dedicated memory, WDDM 3.0 driver `30.0.14.7514` dated 2024-06-10.
- Display: 3440 x 1440 at approximately 50 Hz over DVI.
- DirectX: DirectX 12 runtime, adapter feature levels include 11_0 down to 9_1.
- Reported page file pressure: about 101 GB used with about 3 GB available at report time.

Implications to validate:

- The CPU and RAM capacity are not the obvious ceiling, but memory pressure may still cause stalls if the page-file numbers reflect active swapping during play.
- The GT 730 is the likely weak link for a modern Bevy/WGPU client, especially at 3440 x 1440 where every fullscreen pass touches roughly 5 million pixels before overdraw.
- The 50 Hz monitor mode means smoothness should be evaluated against stable frame pacing, not only headline FPS.

## 3. Initial Technical Stance To Confirm Or Refute

Do not assume Bevy is slow because "2D is secretly full 3D PBR." Bevy's 2D stack uses the same modern GPU renderer infrastructure, render graph, extraction, batching/material systems, windows, assets, and WGPU backend family as the rest of Bevy, but sprites and 2D materials are not normally rendered as full 3D PBR scenes.

The more likely costs are:

1. **Modern GPU pipeline overhead:** Bevy uses WGPU, command encoding, render extraction, pipeline/material specialization, texture uploads, and shader passes. This is much heavier than old fixed-resolution software/sprite engines even when the game is visually 2D.
2. **Fill-rate and overdraw:** A 3440 x 1440 screen plus fullscreen backgrounds, post-process passes, alpha-blended sprites, tactical overlays, fog masks, glow layers, and UI can saturate a GT 730 even with few gameplay entities.
3. **Driver/backend cost:** On native Windows, Sidereal currently uses Bevy 0.18 with `bevy/webgpu`, `RenderCreation::Automatic`, and `Backends::PRIMARY` unless overridden by `SIDEREAL_CLIENT_WGPU_BACKENDS` / `WGPU_BACKEND`. On WASM, the client prefers `BROWSER_WEBGPU | GL`. Browser GPU process, WebGPU/WebGL validation, and old-driver behavior can all matter.
4. **No Bevy-side GPU emulation:** Bevy does not emulate a GPU for ordinary rendering. If a hardware adapter is unavailable or blocked, WGPU/browser/OS adapter selection may fail, choose another backend, or use a fallback/software adapter only when configured or provided by the platform. Sidereal also exposes `SIDEREAL_CLIENT_FORCE_SOFTWARE_ADAPTER`; it must be confirmed false in performance runs.
5. **Sidereal-specific work outside rendering:** Existing reports already flag presentation role churn, tactical map work, nameplates, fullscreen material updates, asset dependency scans, procedural sprite generation, and debug overlays as plausible frame-time sources. A "few entities" scene can still be expensive if those systems churn or if fullscreen/UI work dominates.
6. **Debug/release differences:** Any debug, unoptimized WASM, or non-dist client build can be dramatically slower than a release/dist build and should not be used for engine-level conclusions.

Older top-down games are not a fair baseline unless resolution and effects are normalized. Many older titles render to a much smaller fixed internal buffer, use pre-baked sprite atlases, avoid dynamic shaders and ECS/network/prediction overhead, and have tightly hand-authored overdraw budgets. Modern browser 3D games may also use aggressive batching, instancing, dynamic resolution, simplified shaders, cached assets, and engine-specific low-end GPU paths.

## 4. Required Investigation

Run this as a hardware-aware client performance investigation, not a generic Bevy critique.

### 4.1 Establish The Renderer/Backend Facts

Record:

1. native client build profile used (`debug`, `release`, `dist`);
2. WASM build path used (`scripts/siderealctl build-wasm` vs `scripts/siderealctl build-wasm --dist`);
3. native WGPU adapter name, backend, and whether fallback/software adapter is active;
4. browser `chrome://gpu` / `edge://gpu` status for WebGPU, WebGL, ANGLE backend, blocklist state, and software rasterization;
5. effective window/canvas physical resolution and render scale;
6. present mode and monitor refresh mode.

### 4.2 Compare Native, WASM, Resolution, And Feature Toggles

Capture frame-time and hitch metrics for:

1. native client at 1280 x 720, 1920 x 1080, and 3440 x 1440;
2. WASM client at the same canvas sizes where practical;
3. default visuals versus reduced fullscreen/backdrop/post-process effects;
4. tactical overlay off versus on;
5. nameplates off versus on;
6. debug/F3/BRP/diagnostic overlays off versus on;
7. procedural visual generation cold-cache versus warm-cache.

The goal is to separate:

- GPU fill-rate / shader cost;
- CPU ECS/update cost;
- asset upload or shader/material creation hitches;
- browser backend overhead;
- server/replication cadence stalls that appear as render stutter.

### 4.3 Add Or Use Instrumentation

Use existing counters where available and add narrow counters if missing:

1. Bevy frame-time diagnostics and per-stage frame time.
2. Renderable counts by family: sprites, fullscreen passes, UI nodes, tactical markers, nameplates, debug entities.
3. Material/image creation counts and texture upload counts per frame.
4. Procedural generation queue depth and completed attachments per frame.
5. Fullscreen material update counts and dirty/no-op counts.
6. Tactical fog rebuild counts and texture dimensions.
7. Presentation duplicate suppression / role conflict / predicted-adoption wait counters.
8. Server confirmation age and client stall-frame correlation from the existing runtime optimization plan.

### 4.4 Produce The User-Facing Explanation

Write a concise answer that distinguishes proven facts from hypotheses:

1. Bevy 2D is modern GPU-rendered 2D, not old-school blitting and not normally full 3D PBR.
2. Hardware acceleration is expected; Bevy itself is not doing useful software emulation for performance.
3. The GT 730 at 3440 x 1440 is a credible bottleneck even for 2D if the scene uses fullscreen shaders, alpha overdraw, UI overlays, or high-resolution canvas rendering.
4. Sidereal's current architecture can add CPU and frame-pacing costs unrelated to raw draw complexity.
5. The right decision is not "leave Bevy" until native-vs-WASM, resolution, backend, build-profile, and feature-toggle captures show where the time is going.

## 5. Expected Artifacts

1. A dated investigation report under `docs/reports/investigations/`.
2. If the investigation changes active performance priorities, append a dated note to `docs/plans/completed/runtime_optimization_scalability_plan_2026-04-29.md`.
3. If a new enforceable runtime default is introduced, update the relevant docs and decision records in the same change.

## 6. Validation

For this prompt-only action, run:

```bash
scripts/siderealctl docs-check
git diff --check
```

For the later investigation or runtime change, also run the quality gates required by `AGENTS.md` for any touched code paths.
