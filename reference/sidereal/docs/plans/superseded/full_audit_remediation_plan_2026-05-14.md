# Full Audit Remediation Plan

Status: Superseded
Lifecycle: superseded
Category: plan
Last updated: 2026-07-05
Owners: implementation owners
Scope: Full Audit Remediation Plan.
Source of truth: no
Supersedes: n/a
Superseded by: docs/plans/active/gap_closure_and_finalization_plan_2026-07-05.md
Primary references:
- n/a

## 0. Status Notes

- 2026-05-14: Plan created from the full project audit recommendations. Implementation begins with baseline recovery because one repository asset-registry regression currently prevents a clean workspace test run.
- 2026-05-14: Phase 0 completed. Restored the `planet_preview_study_wgsl` Lua asset registry entry and verified the targeted scripting registry test plus the broad workspace lib/tests command.
- 2026-05-14: Phase 1 in progress. Implementing stale control-result guards plus deterministic control handoff/input routing regression coverage before extending load baselines.
- 2026-05-14: Phase 1 completed. Added client stale control-result generation guards, client ack/reject regression tests, and a replication input handoff harness for stale generations, target mismatches, rapid swaps, and GUID continuity after runtime rehydration.
- 2026-05-14: Phase 2 in progress. Added configurable asteroid-field entity count for Phase 0/MMO load captures and copied client stall-frame pacing fields into MMO gate artifacts; live local smoke is blocked until the local database is not actively connected and has a seeded `auth_characters` player.
- 2026-05-14: Phase 1/2 quality gates passed: `cargo fmt --all -- --check`, `CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings`, `CARGO_INCREMENTAL=0 cargo check --workspace`, `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu`, and `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu`.
- 2026-05-14: Phase 2 completed. Added empty isolated-database mode, Phase 0 account/character auto-seeding, managed local gateway startup, aligned replication observability DB wiring, and an explicit `smoke` vs `slo` MMO load gate mode. A short debug smoke now passes with complete baseline metrics and zero input drops.
- 2026-05-14: Phase 3 in progress. Beginning duplicate visual suppression observability before narrowing any transitional presentation safety rails.
- 2026-05-14: Phase 3 observability implemented. Duplicate visual resolution now records winner swaps, current suppression counts, and reason buckets; debug overlay snapshots and Phase 0/MMO artifacts expose those fields when visual presentation systems are active.
- 2026-05-14: Phase 3 quality gates passed for the current diagnostic-only implementation, including full workspace Clippy/check and native client WASM/Windows target checks.

## 1. Tracking Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Completed
- `[!]` Blocked or failed validation

## 2. Phase Tracker

| Phase | Status | Purpose |
| --- | --- | --- |
| 0. Baseline recovery | [x] | Restore a fully green validation baseline before larger runtime changes. |
| 1. Dynamic control handoff regression harness | [x] | Prove rapid multi-client control swaps remain correct under live Lightyear runtime conditions. |
| 2. Replication/load baselines | [x] | Establish repeatable performance and cadence evidence before tuning replication. |
| 3. Duplicate visual suppression retirement path | [~] | Measure and narrow/remove transitional duplicate visual presentation safety rails. |
| 4. Dashboard API validation and admin guard normalization | [ ] | Standardize route boundary validation and privileged API authorization. |
| 5. Documentation authority cleanup | [ ] | Remove stale references and clarify active vs historical docs. |
| 6. Authoritative transform fallback audit | [~] | Eliminate or justify remaining server-authoritative `Transform` fallback paths. |
| 7. Frontend hardening polish | [ ] | Add sanitizer tests and route-boundary consistency guidance. |

## 3. Phase Details

### Phase 0: Baseline Recovery

Status: [x]

Specific changes:

- Restore or intentionally retire the missing `planet_preview_study_wgsl` repository asset registry entry.
- Keep the fix aligned with `docs/plans/superseded/planet_shader_simplification_preview_plan_2026-03-19.md`, which states the preview shader is intended to remain registered.
- Run the targeted scripting asset-registry test.
- Re-run the broad Rust test command that failed in the audit pass.

Files expected to change:

- `data/scripts/assets/registry.lua`
- this plan file

Validation:

- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo test -p engine-script --test asset_registry_repo_file`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo test --workspace --lib --tests`

### Phase 1: Dynamic Control Handoff Regression Harness

Status: [x]

Specific changes:

- Add a deterministic native integration test or scripted E2E harness that drives at least two clients through:
  - self-control to ship A,
  - ship A to ship B,
  - ship A back to self-control,
  - rejected control request,
  - stale ack/reject handling,
  - rapid repeated swaps across adjacent ticks.
- Assert accepted realtime input never applies to a stale controlled target.
- Assert control generation changes are observed by client and server.
- Assert predicted/interpolated/confirmed role continuity by stable entity GUID, not raw Bevy entity IDs.
- Capture diagnostics for visibility rearm, local intent ownership, and canonical presentation winner swaps.

Likely files:

- `bins/sidereal-replication/tests/transport_lightyear_e2e.rs`
- `bins/sidereal-client/src/runtime/control.rs`
- `bins/sidereal-client/src/runtime/input.rs`
- `bins/sidereal-client/src/runtime/replication/adoption.rs`
- `bins/sidereal-replication/src/replication/control.rs`
- `bins/sidereal-replication/src/replication/input.rs`

Validation:

- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo test -p sidereal-client runtime::control`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo test -p sidereal-replication tests::input`
- Native client/server smoke is covered by Phase 2's load-capture harness once a seeded local runtime database is available.

### Phase 2: Replication/Load Baselines

Status: [x]

Specific changes:

- Add a repeatable local load profile for configurable client/entity counts.
- Record fixed-tick debt, oldest input age, accepted input rate, replication send volume, group cadence, visibility membership churn, tactical lane deltas, and client frame-pacing samples.
- Add self-contained Phase 0 smoke support through empty isolated databases, auto-seeded account/character data, and managed local gateway startup.
- Split MMO load validation into production `slo` gates and shorter `smoke` gates that prove harness health without failing on debug-run latency.
- Store baseline interpretation in the relevant observability or visibility/replication docs.

Likely files:

- `bins/sidereal-replication/src/replication/observability.rs`
- `bins/sidereal-replication/src/replication/network_metrics.rs`
- `bins/sidereal-replication/src/replication/lifecycle.rs`
- `docs/features/active/server_observability_metrics_contract.md`
- `docs/features/active/visibility_replication_contract.md`

Validation:

- 2026-05-14 passed: `bash -n scripts/capture_phase0_dense_baseline.sh`
- 2026-05-14 passed: `bash -n scripts/run_mmo_synthetic_load_tier.sh`
- 2026-05-14 passed: load-harness field presence check for configurable entity count and client stall-frame gate fields.
- 2026-05-14 resolved: earlier live-smoke blockers from active source-database sessions and missing local `auth_characters` data are handled by empty isolated-database mode plus auto-seeding.
- 2026-05-14 passed: `SIDEREAL_MMO_LOAD_CLIENTS=1 SIDEREAL_MMO_LOAD_WORKLOAD=idle_connected SIDEREAL_MMO_LOAD_DURATION_S=15 SIDEREAL_MMO_LOAD_CARGO_PROFILE=debug SIDEREAL_MMO_LOAD_ASTEROID_FIELD_COUNT=2 SIDEREAL_MMO_LOAD_GATE_MODE=smoke SIDEREAL_MMO_LOAD_OUT_DIR=data/debug/mmo_synthetic_load_phase2_smoke scripts/run_mmo_synthetic_load_tier.sh`
- 2026-05-14 smoke artifact: `data/debug/mmo_synthetic_load_phase2_smoke/20260514_113716_idle_connected_1c/mmo_load_gate_20260514_113716.txt` (`mmo_load_gate_pass=true`, `baseline_complete=true`, `metrics_input_drop_total=0`, `observability_samples_total=13762`, `observability_metric_keys_total=444`).

### Phase 3: Duplicate Visual Suppression Retirement Path

Status: [~]

Specific changes:

- Add metrics for duplicate visual winner swaps, suppressed entity count, and suppression reason.
- Gate verbose diagnostics through `engine-observability` and `SIDEREAL_DIAGNOSTICS`, not ad hoc env vars.
- After Phase 1 coverage exists, narrow or remove suppression paths that no longer fire in passing handoff/load tests.
- Keep the first implementation diagnostic-only: do not change winner policy or remove suppression until native rendering evidence shows which reason buckets still fire.

Likely files:

- `bins/sidereal-client/src/runtime/visuals/duplicate_resolution.rs`
- `bins/sidereal-client/src/runtime/debug_overlay/*`
- `docs/features/reference/prediction_runtime_tuning_and_validation_reference.md`
- `docs/features/active/server_observability_metrics_contract.md`

Validation:

- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo test -p sidereal-client duplicate_visual`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo test -p sidereal-client debug_text_rows_include_asset_and_hud_perf_metrics`
- 2026-05-14 passed: `bash -n scripts/capture_phase0_dense_baseline.sh && bash -n scripts/run_mmo_synthetic_load_tier.sh`
- 2026-05-14 passed: short headless MMO smoke with `SIDEREAL_MMO_LOAD_GATE_MODE=smoke` under `data/debug/mmo_synthetic_load_phase3_smoke/20260514_114650_idle_connected_1c/`; duplicate visual fields are expectedly `n/a` there because headless transport does not install presentation visuals.
- 2026-05-14 passed: `cargo fmt --all -- --check`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo check --workspace`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu`
- 2026-05-14 passed: `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu`
- Remaining: native windowed/rendering smoke with diagnostics enabled, then decide whether non-winner suppression can be narrowed or whether force-suppressed player/control helper entities remain documented exceptions.

### Phase 4: Dashboard API Validation And Admin Guards

Status: [ ]

Specific changes:

- Add shared helpers for route param parsing, query parsing, Zod body validation, gateway proxy error shaping, and admin scope enforcement.
- Migrate destructive/admin/script publish routes first.
- Keep server-only utilities out of client bundles.
- Add tests for missing MFA, missing scope, invalid params, and invalid request bodies.

Likely files:

- `dashboard/src/server/api-route.ts`
- `dashboard/src/server/dashboard-auth.ts`
- `dashboard/src/routes/api.admin.spawn-entity.tsx`
- `dashboard/src/routes/api.scripts.publish.tsx`
- `dashboard/src/routes/api.scripts.draft.tsx`
- `dashboard/src/routes/api.*.tsx`
- `dashboard/src/lib/schemas/dashboard.ts`

Validation:

- `pnpm --dir dashboard lint`
- `pnpm --dir dashboard test`

### Phase 5: Documentation Authority Cleanup

Status: [ ]

Specific changes:

- Replace or remove the missing `removed March 2026 native runtime ownership audit` reference from `AGENTS.md`.
- Resolve duplicate `DR-0019` numbering or explicitly document the split.
- Update implemented decisions still marked `Proposed`.
- Mark plan docs as historical where active feature contracts supersede them.
- Add dated notes using `YYYY-MM-DD` for all substantive doc changes.

Likely files:

- `AGENTS.md`
- `docs/decision_register.md`
- `docs/decisions/*.md`
- `docs/README.md`
- selected `docs/plans/*.md`

Validation:

- Static doc grep for stale missing paths and duplicate DR IDs.

### Phase 6: Authoritative Transform Fallback Audit

Status: [~]

Specific changes:

- Inventory server-authoritative uses of `Transform` and `GlobalTransform` as position fallbacks. **Done (2026-06-15):** audit found 7 fallback sites; all already prefer `Position`/`WorldPosition` (f64) and only touch f32 when both are absent. The material precision gap was the visibility read model being f32 (`Vec3`) internally before cell bucketing/range gating, not the fallback reads themselves.
- Convert authoritative paths to `Position` or `WorldPosition`. **Done for the visibility read model + tactical + observer anchor (2026-06-15):** visibility AOI (`spatial_index`/`policy`/`membership`/`landmarks`/`context_cache`/`client_registry`) and `runtime_state::observer_anchor_world_position` now compute positions in f64 (`DVec2`) end-to-end; `tactical_world_position` already returned f64. See `docs/features/active/visibility_replication_contract.md` (2026-06-15 entry). **Remaining:** shared client/server flight code (`flight.rs` navigation/heading fallbacks, `character_movement.rs` sync) — deferred because the f32 fallback there may be load-bearing on the client prediction path; needs the WASM/Windows client check before changing. The serialized `VisibilityRangeSource` disclosure DTO is still f32 (projected at the boundary; `TODO(f64)`).
- Explicitly document presentation-only fallbacks that remain. **Done (2026-06-15)** for the converted sites (lossy `GlobalTransform`/`Transform` fallbacks now carry an anomaly/last-resort doc comment and finiteness guards).
- Add tests around large f64 world coordinates where a fallback path is touched. **Done (2026-06-15):** added ~5e6 m cell-key/sector-key and distance-gate unit tests that fail under the old f32 path.

Likely files:

- `crates/sidereal-game/src/flight.rs`
- `crates/sidereal-game/src/character_movement.rs`
- `bins/sidereal-replication/src/replication/runtime_scripting.rs`
- `bins/sidereal-replication/src/replication/tactical.rs`
- `bins/sidereal-replication/src/replication/visibility/*`

Validation:

- Touched crate tests.
- `CARGO_INCREMENTAL=0 cargo check --workspace`
- Client WASM/Windows checks if shared client/runtime code changes.

### Phase 7: Frontend Hardening Polish

Status: [ ]

Specific changes:

- Add QR SVG sanitizer tests covering script tags, event attributes, unsupported elements, and external references.
- Document route-boundary requirements for data-owning dashboard routes.
- Normalize minor route pending/error boundary gaps after Phase 4 helpers are in place.

Likely files:

- `dashboard/src/components/auth/TotpSetupPanel.tsx`
- `dashboard/src/components/auth/*.test.tsx`
- `docs/guides/frontend_ui_styling_guide.md`
- selected `dashboard/src/routes/*.tsx`

Validation:

- `pnpm --dir dashboard lint`
- `pnpm --dir dashboard test`

## Closure Note (2026-07-05)

Phases 0-3 complete (validation gates, control-handoff regression harness, replication load baselines, duplicate-visual observability). Remaining Phases 4-7 (dashboard API validation + admin guard normalization, docs authority cleanup, transform fallback audit tail, frontend hardening polish) are absorbed into `docs/plans/active/gap_closure_and_finalization_plan_2026-07-05.md` (WS-G).
