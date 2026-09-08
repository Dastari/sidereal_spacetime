# Sidereal Full Project Audit Report - 2026-05-13

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Sidereal Full Project Audit Report - 2026-05-13.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Status note 2026-05-13: The requested `docs/audit` folder does not exist in this checkout. I treated the active audit prompts under `docs/prompts/` as the runnable audit set and ran a consolidated pass covering:

- `docs/prompts/audits/rust_codebase_audit_prompt.md`
- `docs/prompts/audits/client_server_network_audit_prompt.md`
- `docs/prompts/audits/bevy_2d_rendering_optimization_audit_prompt.md`
- `docs/prompts/audits/frontend_tanstack_router_audit_prompt.md`
- `docs/prompts/audits/documentation_reconciliation_audit_prompt.md`

Existing reports in `docs/reports/` were used only as historical context, not as proof of current behavior. The Rust audit lens used `/root/sidereal/.agents/skills/rust-skills/SKILL.md`; Bevy/runtime audits used `/root/sidereal/.agents/skills/bevy-game-engine/SKILL.md`.

## 1. Executive Summary

Sidereal is substantially healthier than the April audit baseline. The core server-authoritative invariants are visible in current code:

- Lightyear message directions are explicitly scoped in `crates/sidereal-net/src/lightyear_protocol/registration.rs`.
- Realtime input is session-bound, canonicalized, control-generation checked, latest-wins, and target validated in `bins/sidereal-replication/src/replication/input.rs`.
- Control role reconciliation is centralized enough to derive `ControlledBy`, `Replicate`, `PredictionTarget`, `InterpolationTarget`, and visibility rearm from the authenticated player/control map in `bins/sidereal-replication/src/replication/control.rs`.
- Client simulation keeps Avian `Position`/`Rotation` authoritative and disables pre-physics `Transform -> Position` feedback in `bins/sidereal-client/src/runtime/app_setup.rs`.
- Dashboard auth has moved to gateway-backed account sessions, encrypted cookies, MFA/scopes/roles, and shared request body parsing helpers.

No critical authority bypass was found in the inspected current runtime paths. The main project risks are now:

1. Runtime and rendering still carry transitional duplicate-resolution and handoff-safety systems that need measured deletion criteria.
2. Network/control correctness has good unit coverage but still lacks a deterministic live multi-client rapid-swap regression harness.
3. Replication cadence is configurable and improved, but it is not yet proven by load tests at MMO-ish entity/client counts.
4. Documentation is improved but still has stale references, duplicate DR numbers, and many plan docs that now partially overlap active contracts.
5. Dashboard route boundaries and auth are much better, but API validation/authorization is uneven across route files.

## 2. Validation Run

Commands run from `/root/sidereal`:

- `cargo fmt --all -- --check` passed.
- `CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings` passed.
- `CARGO_INCREMENTAL=0 cargo check --workspace` passed.
- `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu` passed.
- `CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu` passed.
- `pnpm --dir dashboard lint` passed.
- `pnpm --dir dashboard test` passed: 19 files, 69 tests.
- `CARGO_INCREMENTAL=0 cargo test --workspace --lib --tests` failed after the tested runtime/transport suites passed. The failing test was `repository_asset_registry_loads_preview_planet_shader_entry` in `crates/sidereal-scripting/tests/asset_registry_repo_file.rs`; it expects asset id `planet_preview_study_wgsl`, but the current repository asset registry did not provide it.

Current worktree before this report already had user-local changes in `Cargo.toml`, `Cargo.lock`, and `bins/sidereal-client/Cargo.toml`.

## 3. Upstream Lightyear Status

Current workspace dependency:

- `Cargo.toml` pins `lightyear` to `https://github.com/Dastari/lightyear` rev `60fc5387e4e3514fc8fb8fad6ffad100010db5ec`, with UDP, raw connection, native input, replication, prediction, interpolation, frame interpolation, Avian2D, WebTransport, and self-signed WebTransport features.
- Cargo resolves this fork as `lightyear v0.26.4`.

Upstream primary-source check on 2026-05-13:

- `cBournhonesque/lightyear` latest GitHub release shown publicly is `0.26.0`, dated 2026-01-22. The release notes state it mainly updates to Bevy 0.18 and includes visibility API changes, authority-transfer work, replication optimizations, and Avian f64 support work.
- `docs.rs` shows `lightyear 0.26.4` as the latest crate docs/source.
- The local fork is ahead/different from the public release tag state and should remain treated as a pinned project dependency, not as ordinary upstream Lightyear.

Audit implication: do not remove Sidereal handoff/rearm safeguards just because upstream 0.26 exists. Any cleanup should first validate the exact fork revision against the rapid control-swap and packet-loss repros that motivated the fork.

## 4. Critical Findings

No critical security or authority failure was proven in current inspected code.

## 5. High Findings

### H1. Control handoff is much safer, but still needs a live rapid-swap regression harness

Category: correctness, architecture, test coverage.  
Disposition: must fix before calling dynamic handoff complete.

Current code centralizes role reconciliation in `reconcile_control_replication_roles` and re-arms clients on topology changes. It also advances control generations only on lease changes and validates realtime inputs against the authenticated binding and current generation.

Evidence:

- Generation rules: `bins/sidereal-replication/src/replication/control.rs:130`.
- Owner prediction/interpolation target derivation: `bins/sidereal-replication/src/replication/control.rs:145`.
- Visibility rearm: `bins/sidereal-replication/src/replication/control.rs:811`.
- Central role reconciliation: `bins/sidereal-replication/src/replication/control.rs:898`.
- Input auth/generation/target validation: `bins/sidereal-replication/src/replication/input.rs:442`.

Why it matters: the code is now plausibly correct by static inspection, but the highest-risk behavior is cross-frame and cross-peer. Unit tests prove important slices; they do not prove that `self -> ship A -> ship B -> self` behaves correctly under packet loss, visibility churn, and late acks in a live Lightyear run.

Recommendation: add a deterministic native integration test or scripted local repro that drives two clients through rapid control swaps with packet delay/loss simulation, asserts no input applies to stale targets, and records predicted/interpolated/canonical presentation role continuity.

### H2. Duplicate visual suppression remains active runtime debt

Category: rendering, maintainability, performance.  
Disposition: should fix after H1 harness exists.

The client still runs a dedicated duplicate visual winner system that tracks many component changes and removal cursors, scores predicted/interpolated/controlled entities, then hides suppressed entities.

Evidence:

- Dirty tracking across control, prediction, interpolation, world-space, and confirmed-history components: `bins/sidereal-client/src/runtime/visuals/duplicate_resolution.rs:111`.
- Winner scoring and suppression: `bins/sidereal-client/src/runtime/visuals/duplicate_resolution.rs:257`.
- Runtime visibility mutation for suppressed clones: `bins/sidereal-client/src/runtime/visuals/duplicate_resolution.rs:321`.

Why it matters: this is a pragmatic safety rail, but it is not a final rendering architecture. It adds per-change bookkeeping in a path that directly affects perceived smoothness and can mask underlying Lightyear/adoption bugs.

Recommendation: keep it until H1 is covered, then add metrics for winner swaps and suppressed entity count. Once rapid-swap and visibility churn pass without suppression doing real work, remove or narrow this system to diagnostics-only.

### H3. Replication cadence is configurable but not yet load-proven

Category: performance, architecture.  
Disposition: must fix before scalability claims.

The replication server now assigns per-entity replication groups and optional send-frequency classes, which is directionally correct.

Evidence:

- Cadence config env parsing: `bins/sidereal-replication/src/replication/lifecycle.rs:65`.
- Entity-scoped group normalization: `bins/sidereal-replication/src/replication/lifecycle.rs:529`.

Why it matters: this addresses starvation risks from shared Lightyear default groups, but the prompt asks whether the design holds for many clients/entities. Static inspection cannot prove that. The current system also exposes several tuning env vars; without a load profile, defaults may drift by anecdote.

Recommendation: add a repeatable load test that records fixed-tick debt, input age, replication send volume, group send cadence, visibility membership churn, tactical lane deltas, and client frame pacing at several entity/client counts.

### H4. Dashboard API validation and authorization are uneven

Category: security, correctness, maintainability.  
Disposition: should fix.

Strong foundations exist: dashboard route access is gated at `_dashboard`, body parsing has a shared Zod helper, and account-session refresh is centralized.

Evidence:

- Dashboard route guard: `dashboard/src/routes/_dashboard.tsx:5`.
- Shared Zod body parser: `dashboard/src/server/api-route.ts:11`.
- Shared account-session guard: `dashboard/src/server/api-route.ts:49`.

However, route inspection shows many API files still do route params/search/query/proxying in-route rather than through a consistent typed boundary. Some admin proxy routes are hardened, while others rely on local patterns that need individual review.

Recommendation: introduce shared helpers for route param parsing, query parsing, admin-scope enforcement, and gateway proxy error shaping. Apply first to destructive/admin routes and script/catalog publish routes, then to read-only proxy routes.

### H5. Documentation still has stale operational references and duplicated decision IDs

Category: documentation, contributor safety.  
Disposition: should fix.

Evidence:

- `AGENTS.md` points at `removed March 2026 native runtime ownership audit`, but that file is absent in this checkout: `AGENTS.md:20`.
- Decision detail files include two `dr-0019_*` files, and `docs/decision_register.md` has two `DR-0019` entries.
- `docs/plans/completed/runtime_optimization_scalability_plan_2026-04-29.md` already notes that the native runtime audit report is missing.

Why it matters: agents are explicitly told to follow source-of-truth docs. Stale or missing references send contributors into avoidable archaeology and can cause later audits to compare against the wrong baseline.

Recommendation: remove or replace the missing audit reference in `AGENTS.md`, renumber or explicitly namespace one of the `DR-0019` entries, and add an index note explaining which older plans are historical references only.

### H6. Repository asset registry no longer matches scripting regression test

Category: correctness, asset pipeline.  
Disposition: must fix.

`CARGO_INCREMENTAL=0 cargo test --workspace --lib --tests` failed in `crates/sidereal-scripting/tests/asset_registry_repo_file.rs:5`. The test loads `data/scripts` and expects an asset entry with `asset_id == "planet_preview_study_wgsl"` and source path `shaders/planet_preview_study.wgsl`. Static inspection found current shader entries in `data/scripts/assets/registry.lua`, but not that preview asset id.

Why it matters: this is exactly the kind of registry/source parity test the asset-delivery contract relies on. Either the preview shader asset was intentionally removed and the test is stale, or the Lua registry lost a required preview asset.

Recommendation: decide whether `planet_preview_study_wgsl` is still a supported dashboard/preview asset. If yes, restore it in `data/scripts/assets/registry.lua`; if no, update or remove the regression test and the related docs that describe the preview shader path.

## 6. Medium Findings

### M1. Lightyear protocol direction scoping is strong, but channel direction names are broader than usage

Category: networking, maintainability.  
Disposition: optional cleanup unless behavior changes.

Messages are direction-scoped explicitly, which is the important safety property. Channels remain bidirectional for `ControlChannel`, `InputChannel`, `TacticalSnapshotChannel`, and `NotificationChannel`.

Evidence:

- Message directions: `crates/sidereal-net/src/lightyear_protocol/registration.rs:73`.
- Channel setup: `crates/sidereal-net/src/lightyear_protocol/registration.rs:117`.

Recommendation: keep message-level direction as the authority. Consider adding comments or wrapper helpers explaining why bidirectional channels are still used where only a subset of messages flow each way.

### M2. Client runtime schedule is clearer but still contains broad always-on maintenance

Category: performance, rendering.  
Disposition: should fix by measurement.

The client schedules asset dependency sync, adoption, transform sync, reveal, diagnostics, control messages, owner manifest receive, and tactical receive on `Update`.

Evidence: `bins/sidereal-client/src/runtime/plugins/replication_plugins.rs:40`.

Recommendation: use existing diagnostics to measure each system's no-op cost and convert safe paths to event/change-driven execution where the measurement shows meaningful idle cost.

### M3. Avian/Transform ownership is defensible, but fallback transform readers remain widespread

Category: correctness, maintainability.  
Disposition: should fix selectively.

The client correctly disables the dangerous pre-physics `Transform -> Position` sync in `PositionButInterpolateTransform` mode.

Evidence: `bins/sidereal-client/src/runtime/app_setup.rs:151`.

Some gameplay and server read-model paths still accept `Transform`/`GlobalTransform` as fallback position sources. This is often defensible for presentation or hydration scaffolding, but every authoritative path should continue moving toward `Position` or `WorldPosition`.

Recommendation: audit every remaining authoritative server use of `Transform` fallback and either prove it is presentation-only or convert it to `Position`/`WorldPosition`.

### M4. Runtime docs are now feature-doc compliant, but plan overlap is high

Category: documentation.  
Disposition: should fix.

Most `docs/features/*.md` files now have status metadata and `## 0` status sections. The bigger issue is not metadata; it is overlap. Many `docs/plans/` documents contain implemented follow-up notes that now duplicate active feature contracts.

Recommendation: for each high-churn subsystem, move one dated summary into the active feature contract and mark the corresponding plan as historical or superseded.

### M5. Dashboard uses sanctioned `dangerouslySetInnerHTML`, but it deserves a focused sanitizer test

Category: frontend security.  
Disposition: should fix.

The root theme init script is static and acceptable. TOTP QR rendering injects sanitized SVG.

Evidence:

- Static root script injection: `dashboard/src/routes/__root.tsx:61`.
- QR SVG injection point: `dashboard/src/components/auth/TotpSetupPanel.tsx:140`.

Recommendation: add tests asserting the QR sanitizer removes script/event attributes, external references, and unsupported elements before the SVG reaches the component.

## 7. Low Findings

### L1. Some accepted/implemented decisions still have `Proposed` status

Category: documentation.  
Disposition: cleanup.

Examples include decisions whose implementation clearly exists in code or feature contracts, such as dashboard account auth and observability metrics. This creates weaker status signaling for future contributors.

Recommendation: update statuses to `Accepted`, `Accepted direction`, or `Active implementation` with dated notes where appropriate.

### L2. Dashboard route boundaries are improved but inconsistent in granularity

Category: frontend maintainability.  
Disposition: cleanup.

Several major routes have `pendingComponent`/`errorComponent` and loader-owned initial data, while smaller feature routes only have local error components or rely on root behavior. This is not currently a bug, but it makes resilience expectations unclear.

Recommendation: define a route-boundary matrix in the frontend styling guide: data-owning routes require `loader`, `pendingComponent`, and `errorComponent`; lightweight shell routes may rely on parent boundaries.

## 8. Areas To Preserve

- Server-authoritative flow remains aligned with the project contract: client sends intent, shard sim applies, replication/distribution follows, persistence snapshots durable state.
- UUID/entity-id crossing discipline is substantially followed across network messages.
- Lightyear native input runtime split on the replication server is correct: the server registers input protocol without installing upstream native input receive runtime.
- Avian authoritative motion components are the right runtime lane; legacy mirror motion components were not found in active replication/simulation paths.
- Dashboard auth direction is correct: gateway-issued sessions, roles/scopes, MFA, and shared server-side guards are the right foundation.
- Feature documentation metadata standard is mostly being followed under `docs/features/`.

## 9. Operational Flow Map

Gateway:

1. Starts Axum HTTP services from `bins/sidereal-gateway`.
2. Owns account auth, bootstrap, token issuance/refresh, MFA/password reset, character routes, asset HTTP delivery, admin gateway APIs, and metrics proxy surfaces.
3. Issues bootstrap/session data used by clients and dashboard.

Replication server:

1. Starts a Bevy minimal app with Lightyear server plugins, Avian2D, Sidereal game plugin, graph persistence, runtime scripting, visibility, tactical/owner lanes, observability, and health/TUI support.
2. Receives Lightyear client auth messages, binds `RemoteId`/client entity to authenticated `player_entity_id`, sends `ServerSessionReady`, reconciles control roles, receives realtime input, runs fixed-step simulation, updates visibility, streams replication/tactical/owner/notification messages, and writes configured persistence snapshots.

Client:

1. Starts Bevy app with rendering/material plugins, Lightyear client plugins, Avian2D, asset cache adapters, UI, transport, prediction, replication, presentation, and diagnostics.
2. Authenticates through gateway, starts native UDP or WASM WebTransport Lightyear transport, sends replication auth bind, waits for session ready, receives replicated entities and asset manifests, fetches assets over gateway HTTP/cache, then transitions into in-world runtime.
3. Sends latest realtime input for the active controlled predicted entity; server acks/rejects control changes with generation numbers; client keeps pending local input intent separate from replicated confirmation.

Data flow:

`gateway auth/bootstrap + asset HTTP` feeds `client session/cache`; `client intent` flows to `replication shard`; `shard ECS/Avian/scripting` produces authoritative state; `Lightyear + side lanes` distribute world/tactical/owner/notification data; `graph persistence` hydrates and snapshots durable ECS components/relationships.

## 10. Top Remediation Plan

1. Add rapid multi-client control-swap live regression coverage.
2. Add replication/load test profiles and record baselines for fixed-tick debt, input age, visibility churn, and client frame pacing.
3. Instrument and shrink duplicate visual suppression until it is diagnostics-only or removable.
4. Normalize dashboard API route validation and admin guard helpers.
5. Clean docs: missing AGENTS audit link, duplicate `DR-0019`, implemented decisions still marked proposed, and overlapping plans.
6. Add sanitizer tests for injected dashboard QR SVG.
7. Audit remaining authoritative `Transform`/`GlobalTransform` fallback readers.

## 11. Audit Folder Note

There is no `docs/audit` directory. Current repo taxonomy says audit reports belong under `docs/reports/` and reusable audit prompts belong under `docs/prompts/`. If `docs/audit` is the intended future folder, that conflicts with current `AGENTS.md` and docs taxonomy and should be changed deliberately.
