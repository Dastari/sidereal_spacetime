# AGENTS.md

Status: Active
Lifecycle: source-of-truth
Category: root
Last updated: 2026-09-06
Owners: architecture + agent workflow
Scope: AGENTS.md.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Project operating contract for human and AI contributors working in this repository.

## 1. Scope and Intent

- This repo is rebuilding **Sidereal** from scratch as a server-authoritative multiplayer architecture.
- Work must follow the documented phased plan and invariants.
- Do not introduce ad-hoc architecture that conflicts with the design documents.

## 2. How to Read the Docs (avoid context blow-up)

The `docs/` tree is large (150+ files). It is a **reference map, not required reading**. Do not transitively read whole doc chains before starting work. Instead:

- Read the **specific section** relevant to your change, located via targeted search (`grep`/`rg`), not full-file reads.
- Pull in the matching **rule pack** (see §4) for the area you are touching; each pack names the one or two authoritative docs for that domain.
- Primary maps if you need orientation: architecture/spec `docs/architecture/sidereal_design_document.md`; decision register `docs/decision_register.md`; phase order `docs/architecture/implementation_checklist.md`; repo overview `README.md`.

If any code change conflicts with docs, update docs in the same change or stop and resolve ambiguity first.

## 3. Always-On Invariants (apply to every change)

These are non-negotiable regardless of what you are touching.

### 3.1 Authority and identity

- Authority flow is one-way: `client input -> shard sim -> replication/distribution -> persistence`.
- Clients never authoritatively set world transforms/state.
- New dashboard authoring edits use owner-shard commands with expected-value checks and persistence receipts; never add direct graph/BRP writes to an authoring workflow. Preserve baseline merge history and permanent deletion records. Handoff retains identity and must not call permanent graph removal. See `docs/features/active/dashboard_game_authoring_runtime_contract.md`.
- Aggregate authoring operations must persist affected entities and permanent deletion records together. Hold ordinary snapshots and handoff behind the aggregate persistence acknowledgement; do not allow a restart to hydrate a partial refit.
- Keep identity crossing boundaries as UUID/entity IDs only (no raw Bevy `Entity` IDs over service boundaries).
- Player runtime state (control target, selection target, focus target, camera position) must live on the persisted player ECS entity/components in graph persistence; do not add separate per-player SQL side tables for authoritative runtime state.
- Player-specific persistent progression/state (for example score, quest progression, character-local settings, local player data) must live on persisted player ECS entity/components, not account rows or ad-hoc side stores.
- `OwnerOnlyVisibility` restricts the entire entity before public/faction/range delivery. Use it for private attachments; hiding only their private components still exposes public labels and entity existence.
- Ship control requires authoritative control-station occupancy by the acting player or NPC. Ownership, client view mode and script execution are not substitutes. Validate station/frame/actor liveness and unique occupancy at control acquisition and input consumption; revoke derived leases and stale intent on exit/loss. See `docs/features/active/crew_interiors_contract.md` (2026-09-07).
- Accounts are identity/auth containers and may own multiple player entities (characters). Runtime/session binding is account-authenticated but control/selection/progression state is player-entity scoped.

### 3.2 Coordinates and motion

- Authoritative world-space coordinates are f64. Avian `Position`/`LinearVelocity` use f64-backed vectors, static `WorldPosition` uses f64-backed coordinates, and `WorldRotation` is f64 radians. Do not downcast authoritative world positions/velocities in persistence, replication protocols, scripting snapshots, server BRP/read models, or dashboard loaders. **Narrow wire-format exception (per DR-0040 §2.8.1)**: lossy quantized encoding is permitted only on the motion-replication payload class of the runtime client-server transport, only after a per-entity `ShardRegion` reference exists on the wire, and only with documented precision tolerances. In-process state, persistence, scripting, BRP, dashboard, and server read models stay f64.
- Bevy `Transform`/`GlobalTransform`, shader uniforms, canvas coordinates, audio backend coordinates, debug drawing, and UI/render-local offsets may remain f32 only as presentation projections from f64 world coordinates. Dashboard/frontend coordinate surfaces use JSON numbers / TypeScript `number` and must not round, stringify, integer-coerce, or f32-coerce world positions/velocities at data boundaries.
- Static non-physics world entities (for example planets, stars, and decorative celestial bodies) must use the generic `WorldPosition` / `WorldRotation` lane rather than Avian transform components unless they are actually simulated by physics.
- Enforce single-writer motion ownership per runtime mode: for controlled predicted entities, only one fixed-tick pipeline may write authoritative motion state (`Position`, `Rotation`, `LinearVelocity`, `AngularVelocity`). Visual interpolation/camera systems must not feed render transforms back into simulation state.
- Do not reintroduce legacy gameplay mirror motion components (`PositionM`/`VelocityMps`/`HeadingRad`) for runtime replication or simulation paths; use Avian authoritative motion components directly.
- Simulation and prediction math must use fixed-step time resources only; frame-time deltas are render/UI-only and must not drive authoritative force/integration math.

### 3.3 Shared code, naming, schema

- Keep shared simulation/prediction/gameplay logic in shared crates, not duplicated across client targets.
- Use generic entity terminology in systems/resources/APIs that are not inherently domain-specific. Avoid naming generic runtime structures with `Ship*` prefixes (for example visibility maps, control maps, authority registries). Reserve ship-specific names only for truly ship-only behavior.
- Platform branching uses `cfg(target_arch = "wasm32")` only. Never use a cargo feature flag to gate native-vs-WASM code paths; `target_arch` is set automatically by the compiler and cannot be miscombined.
- Early-development schema discipline is strict: do not add legacy compatibility aliases/default backfills/migration shims for renamed or reshaped gameplay/script component payloads. Update all producers/consumers to one canonical schema and reset local/dev databases when schema changes.
- Large runtime refactors must split mixed concerns into domain modules; avoid continuing monolithic growth in client/server entrypoints. Keep entrypoints focused on app wiring and plugin composition.

### 3.4 Distribution (DR-0040)

Per DR-0040 (Distribution and Persistence Authority Model), any PR that adds new replicated state, new gameplay systems that own runtime state, or changes persistence shape must answer these three questions in the change description or PR body:
  1. Which shard owns this state authoritatively?
  2. What happens to this state during `ShardRegion` handoff (frozen, mirrored as ghost, destroyed-then-respawned)?
  3. Is this state visible across shards, and if so, through which lane and with what redaction?

These questions apply even during the single-shard milestone so that contributors do not bake single-shard assumptions into new APIs. New gameplay/distribution work must align with DR-0040 and must not introduce TiDi-first, hard-gate-only, or distributed-persistence assumptions.

### 3.5 Networking / Lightyear (fork policy)

- If Lightyear behaviour appears unexplained, check `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md` before assuming the issue is local-only or introducing a workaround. If the behaviour matches an upstream issue, reference it in the change; if not, update the snapshot with the new upstream search result.
- Sidereal owns and depends on the `Dastari/lightyear` fork as the canonical networking dependency. When a missing capability, bug, or integration problem belongs in Lightyear, prefer a small, generic fork fix over a Sidereal-side workaround. Future Lightyear work should be expressed as a concise handoff prompt for a dedicated Lightyear-fork agent/session, with the required behavior, tests, and Sidereal validation context. These fork changes must remain project-agnostic, avoid Sidereal-specific policy or game concepts, and be shaped as direct, focused PR-sized patches that could be offered upstream later. Only implement a workaround in Sidereal when a generic Lightyear fix is clearly infeasible or would be unsafe, and document that rationale.

## 4. Domain Rule Packs (load the matching pack before working in that area)

Detailed, enforceable rules for specific areas live in canonical rule packs under `skills/`. Edit those files only. `.claude/skills` is a symlink bridge for the Claude harness; `.agents/skills` is vendored/tool-managed skill content and is not a Sidereal project-rule bridge. These rule packs are still part of this contract — when your change touches an area below, read the pack first. (If your harness auto-triggers project skills, the matching pack loads automatically; this table is the authoritative cross-harness index.)

| Touching… | Read pack | Key doc |
|---|---|---|
| adding a new crate/module/component/system/shader family/Lua registry/message/persistence rule/asset — deciding engine (generic) vs Sidereal content | `skills/sidereal-engine-boundary/SKILL.md` | `docs/plans/completed/engine_content_separation_refactor_plan_2026-06-02.md`, `docs/decisions/dr-0041_generic_lua_authored_shader_parameter_schema.md` |
| gameplay components, persistence/hydration, mass/inertia, scripting-connected components | `skills/sidereal-components/SKILL.md` | `docs/guides/component_authoring_guide.md` |
| visibility/range, replication delivery, AOI, redaction, replication input routing | `skills/sidereal-visibility-replication/SKILL.md` | `docs/features/active/visibility_replication_contract.md` |
| `bins/sidereal-client`, prediction/reconciliation, transport, client deps, native client UI | `skills/sidereal-client-wasm/SKILL.md` | `docs/guides/ui_design_guide.md` |
| `dashboard/` routes, forms, API handlers, UI, styling, bundling | `skills/sidereal-frontend/SKILL.md` | `docs/guides/frontend_ui_styling_guide.md` |
| shaders/materials, Lighting V2, asset delivery/cache, Lua asset registry | `skills/sidereal-shaders-assets/SKILL.md` | `docs/features/active/asset_delivery_contract.md` |
| backend diagnostics/metrics, BRP, link conditioner, gateway admin/bootstrap auth | `skills/sidereal-observability-net/SKILL.md` | `docs/features/active/server_observability_metrics_contract.md` |
| launching/managing dev servers, build/quality/db tasks, or editing `dev.toml`/`siderealctl`/`Makefile` | `skills/sidereal-dev-tooling/SKILL.md` | `docs/decisions/dr-0043_local_dev_orchestration_and_config_sot.md` |
| documentation structure, Markdown headers, docs indexes, decision records, reports/prompts, or `.claude/skills` docs | `skills/sidereal-docs/SKILL.md` | `docs/rules/documentation_governance.md`, `docs/rules/markdown_header_schema.md` |

## 5. Implementation Workflow Requirements

- Implement in phase order from `docs/architecture/implementation_checklist.md` unless dependency constraints require otherwise.
- For each feature change, include:
  - code updates,
  - unit tests in touched crates,
  - integration test updates if cross-service behavior changes,
  - doc updates for protocol/runtime/architecture changes.
- Replicated component changes require bincode Serde roundtrip tests alongside JSON/hydration coverage; tagged JSON and optional-field omission must not break the binary transport. See the components rule pack.
- Default new Rust tests to `tests/*.rs` rather than inline `src/*.rs` modules. If private-item access requires an inline `src/*.rs` test, add the file to `scripts/inline_rust_test_allowlist.txt` in the same change so the inline-test guard stays explicit.
- Keep boundaries explicit between crates/services (no persistence/network leakage into gameplay core).
- Area-specific change requirements (component persistence mapping, WASM parity validation, doc native/WASM impact notes, etc.) live in the matching §4 rule pack — apply them in the same change.

## 6. Runtime and Environment Conventions

- Local dev process env is defined once in `dev.toml`. Everything runs through one tool, `scripts/siderealctl` (`siderealctl --help`): service stacks (`up <profile>`/`status`/`restart`/`logs`/`stop`/`down`) and build/quality/db tasks (`fmt`/`clippy`/`check`/`test`/`pg-*`/`build-wasm`/`publish-client-windows`/…). Do not start/kill the service binaries directly (`cargo run`/`make run-*`/`pkill`) — a `PreToolUse` guard blocks it and points at `siderealctl`. Do not re-add inline env or `run-*` recipes to the Makefile (now a deprecated multi-shard `dev-stack-multi` holdout) or leak new secrets via a global `export`; declare per-service env in `dev.toml` (ambient secrets via `dotenv_passthrough`). See DR-0043 and the `sidereal-dev-tooling` rule pack.
- Core service readiness is declared with `[service.*].readiness_probe` in `dev.toml`; generated profiles wait on `process_healthy` before starting the next dependent service. Do not replace readiness with fixed startup sleeps.
- `siderealctl up` renews expired/near-expiry development WebTransport certificates before resolving gateway pins. After manually refreshing a certificate, use a full `down`/`up` so the serving certificate and advertised hash change together.
- Public dashboard reverse proxies must declare each exact HTTPS browser origin in `SIDEREAL_DASHBOARD_TRUSTED_ORIGINS` through `dev.toml`. Dashboard mutation CSRF checks may accept those explicit origins but must not trust arbitrary `Forwarded` or `X-Forwarded-*` headers as authority.
- Postgres + AGE local infra is defined in `docker-compose.yaml`; initialization SQL for AGE/graph lives under `docker/init/`.
- Ordinary SQL account/control-plane tables belong in `public`; the AGE graph schema is disposable. Database search paths must not resolve ordinary SQL through the graph schema. Graph reset must refuse non-graph relations in that schema; never bypass this guard to force a reset.
- Reset a local evolved world with `scripts/siderealctl world-reset` while the tracked stack is down. It preserves accounts and content-control-plane SQL state while clearing the runtime graph and bootstrap/seed markers through replication's canonical reset implementation. Use `pg-reset` only for an intentional whole-volume wipe. Follow `docs/guides/runtime_world_reset_guide.md` for reseed and verification.
- After a world reset, reseed missing active character worlds with `siderealctl up persistence-maintenance` and `siderealctl reseed-characters --apply`, then stop maintenance and start the gameplay profile. Every gateway and shard must remain stopped during this explicit reseed; login does not recreate erased player graphs.
- Asset root default is `./data`.
- Replication and gateway tracing output is written to both the console and workspace-relative `./logs/` with a fresh timestamped file per process start; use the persisted log files for debugging service startup, transport, auth, and runtime behavior.
- DR-0040 Phase 3 runtime persistence goes through `sidereal-persistence-service` by default at `SIDEREAL_PERSISTENCE_ENDPOINT`; `SIDEREAL_REPLICATION_PERSISTENCE_INPROCESS=1` is a dev/test-only fallback and must not be used for production-style validation.
- Follow runtime defaults and env vars listed in `docs/architecture/sidereal_design_document.md`.

### 6.1 Publishing the downloadable native client (DR-0042)

- Publishing a new downloadable client is a single command: `scripts/siderealctl publish-client-windows` (wraps `scripts/publish_client.py`). It bumps the canonical workspace version, builds the size-optimized binary (`--profile dist`), and writes the binary + `manifest.json` into the gateway release dir. Do not hand-build/copy artifacts or hand-edit `manifest.json` — the script is the only writer.
- When to publish: only on explicit request, or when shipping a client build for download/testing on a remote machine. Each publish advances the version (`--bump patch` default; `--set X.Y.Z`/`--bump minor|major` for intentional jumps; `--no-bump` to re-publish the same version). Do not publish casually — it edits the tracked workspace version.
- The client version of record is `[workspace.package].version` (DR-0042). `LIGHTYEAR_PROTOCOL_VERSION` is the separate wire-compat key; bump it per the §3.5 rule when the protocol changes, independently of a publish.
- The release directory is the dev.toml single source of truth (`SIDEREAL_CLIENT_RELEASE_DIR` on the gateway service, default `dist/client`), per DR-0043 — do not reintroduce a second hardcoded path. The gateway serves it auth-gated at `GET /client/manifest` and `GET /client/download`; the dashboard app-bar button reads it via the `/api/desktop-client/*` proxy routes.
- The published binary bakes its default gateway URL from dev.toml `[vars].gateway_public_url` at build time (`SIDEREAL_BAKED_GATEWAY_URL` → `option_env!` in `platform/native/config.rs`, rebuild-tracked by `bins/sidereal-client/build.rs`). A bare downloaded `.exe` connects there with no env/flags; `GATEWAY_URL`/`--gateway-url` still override at runtime. To change the baked URL, edit `gateway_public_url` and republish — do not hardcode a second URL in source.
- Build profiles are size-tuned and dedicated, never applied to `[profile.release]` (which the server/tests use): `[profile.dist]` for the native exe, `[profile.dist-wasm]` for the production WASM client. Flip `opt-level` to `"s"`/`3` if the size/perf trade-off hurts the game loop.
- Dashboard proxy/route files must not be named `*.client.*`: TanStack Start import-protection treats that pattern as client-only and importing it into the server route tree fails with a cryptic `Cannot convert object to primitive value` router-build crash. Use a non-`client` segment (e.g. `desktop-client`).

### 6.2 Dashboard WASM client size

- WASM is built **separately from Vite** and **not by `package.json`** (DR-0043): build it with `scripts/siderealctl build-wasm` (dev) or `scripts/siderealctl build-wasm --dist` (production); `pnpm dev`/`pnpm build` only run Vite and consume the prebuilt artifacts in `dashboard/public/wasm/`. The dashboard *server* runs via `siderealctl up dashboard` / `up dashboard-prod`.
- The dashboard-served WASM client is size-optimized only on the production build (`scripts/siderealctl build-wasm --dist`): the `dist-wasm` cargo profile plus a binaryen `wasm-opt -Oz --strip-debug` pass (`dashboard/scripts/build-game-client-wasm.mjs`, gated by `SIDEREAL_CLIENT_WASM_OPTIMIZE=1`). The dev build (`scripts/siderealctl build-wasm`) stays on `--release` with no `wasm-opt` for fast iteration — do not move the heavy pass onto the dev path. `wasm-opt` comes from the `binaryen` package; the size pass warns and is skipped (non-fatal) if it is missing.

## 7. Quality Gates (Minimum)

Blender art tooling (2026-09-06) also runs through `siderealctl`:
`setup-blender`, `art-mcp`, `art-build`, `art-check`. Keep its session configuration
in `dev.toml`, isolated from gameplay profiles. Exports under `artifacts/space_tiles`
are review artifacts until promoted through the canonical asset/package publisher;
Blender does not write authoritative world state. See
`docs/guides/blender_space_asset_pipeline.md` and the dev-tooling rule pack.

Before marking work complete, run:

```bash
cargo fmt --all -- --check
CARGO_INCREMENTAL=0 cargo clippy --workspace --all-targets -- -D warnings
CARGO_INCREMENTAL=0 cargo check --workspace
```

If client code was touched, also verify the WASM and Windows targets compile:

```bash
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target wasm32-unknown-unknown --features bevy/webgpu
CARGO_INCREMENTAL=0 cargo check -p sidereal-client --target x86_64-pc-windows-gnu
```

This requires the targets to be installed (`rustup target add wasm32-unknown-unknown x86_64-pc-windows-gnu`) and a MinGW cross-linker (`x86_64-w64-mingw32-gcc`). The workspace `.cargo/config.toml` configures the linker for the Windows GNU target. If a target toolchain is not installed in the local environment, note it in the change but do not skip the check in CI.

Run targeted tests for touched crates; run broader integration tests when flow boundaries are impacted. For documentation changes, run `scripts/siderealctl docs-check`.

Use `CARGO_INCREMENTAL=0` for documented Clippy/check quality gates so repeated agent runs do not accumulate large Cargo incremental snapshots under `target/*/incremental`. Normal development `cargo run`/`cargo build` commands may still use incremental compilation unless a task explicitly opts out.

## 8. Documentation Standards and Maintenance (Enforceable)

### 8.1 Placement and taxonomy

- Audit reports live under `docs/reports/`; implementation/investigation plans under `docs/plans/`; active feature/implementation contracts and feature-scoped notes under `docs/features/`; decision detail docs under `docs/decisions/` as `dr-XXXX_<slug>.md`; prompts under `docs/prompts/`; samples under `docs/samples/`.
- Do not place new audit reports, plans, or decision detail docs under `docs/features/`.
- When updating or adding substantive documentation, include a dated `YYYY-MM-DD` status/update note. When a doc already has dated notes, append a new one rather than silently replacing older context unless the old text is clearly incorrect and being directly superseded.

### 8.2 Feature document standard

- Feature documents under `docs/features/` start with a title, then metadata for `Status`, `Last updated`, `Owners`, `Scope`, and `Primary references` where applicable.
- Status values (unless a more specific label is justified): `Active implementation contract`, `Active feature reference`, `Active partial implementation spec`, `Proposed feature contract`, `Deferred`, `Superseded`.
- Every feature doc includes an early `## 0. Implementation Status` (or `## 0. Status Notes`) section with dated notes separating what is implemented, what remains open, and any native/WASM impact for client/runtime features. Describe enforceable current behavior first, then proposed direction. When a feature doc becomes mainly a historical plan, move it to `docs/plans/` or remove it after transferring a concise dated summary into the active doc.

### 8.3 Maintenance rule

When adding any new **critical or enforceable** behavior (security rule, protocol contract, transport rule, runtime default, operational requirement), you must, in the same change (do not defer to a later PR):

1. Update the relevant docs under `docs/`.
2. If this is an in-depth/project-wide decision, add or update a decision detail file under `docs/decisions/` as `dr-XXXX_<slug>.md`, and link it from `docs/decision_register.md`.
3. Update this `AGENTS.md` (and the matching §4 rule pack) if the rule changes contributor/agent behavior or enforcement expectations.

2026-09-06 documentation checker note: generated Playwright reports and test
results under `dashboard/playwright-report/` and `dashboard/test-results/` are
excluded from source-document header enforcement (see the docs rule pack).
