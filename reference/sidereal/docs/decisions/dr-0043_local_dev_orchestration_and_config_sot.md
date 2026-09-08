# DR-0043: Local Dev Process Orchestration and Config Single Source of Truth

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-09-01
Owners: architecture
Scope: DR-0043: Local Dev Process Orchestration and Config Single Source of Truth.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-30
Owners: dev tooling + backend runtime + agent workflow

Primary references:
- `dev.toml`
- `scripts/devenv.py`
- `scripts/devenv_golden/`
- `Makefile`
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`

2026-08-31 update:
- `full-stack-authoring-debug` selects `replication-authoring`, the only tracked
  service variant that enables `SIDEREAL_REGISTRY_RESYNC_GAMEPLAY_STATS=true`.
  Normal debug, release, and public profiles keep the production-safe default `false`.
- Core services now declare HTTP readiness probes in `dev.toml`. Generated profiles
  use `process_healthy` for the next dependency when a probe exists, preventing the
  client/dashboard from racing replication hydration and transport startup; services
  without a probe retain `process_started` ordering.

2026-09-01 update:
- `[service.dashboard.env]` declares the exact public HTTPS browser origin through
  `SIDEREAL_DASHBOARD_TRUSTED_ORIGINS`. This is the config source of truth for
  reverse-proxy mutation CSRF validation; forwarded headers are not an authority.

## 1. Context

Local development of Sidereal runs four service binaries (`sidereal-gateway`,
`sidereal-replication`, `sidereal-persistence-service`, `sidereal-client`) plus
multi-shard topologies. Two distinct problems had accreted in the Makefile:

1. **Config sprawl.** ~180 distinct environment variables are read across the
   binaries; the Makefile inlines ~80 of them and copy-pastes the same client env
   block across `run-client`, `run-client-release`, `run-client-wsl-perf`,
   `run-client-wsl-safe`, `run-client-headless`, and `run-client2`. There was no
   single source of truth, so changing one default meant editing several targets.

2. **No process lifecycle or visibility.** Nothing records what is running, in
   debug vs release, or who started it. Logs land in `./logs/` PID-tagged, but
   there is no registry. The recurring failure: an agent kills a human's
   foreground server and relaunches it in the background, leaving the human blind.

A third, latent issue surfaced during Phase 1: the Makefile supplies four gateway
secrets (`GATEWAY_AUTH_SECRET_KEY_B64`, `GATEWAY_BOOTSTRAP_TOKEN`,
`GATEWAY_EMAIL_DELIVERY`, `GATEWAY_PUBLIC_BASE_URL`) to the gateway process *only*
via a global `export` from `.env`. They appear in no recipe, so launching the
gateway any way other than from a Make-prepared shell silently drops them
(`bins/sidereal-gateway/src/auth/config.rs` reads two of them directly).

The Makefile also conflates **process orchestration** (`run-*`, `dev-stack-*`)
with **task running** (`fmt`, `clippy`, `test`, `pg-*`, `clean-*`,
`setup-environment`). These want different tools.

## 2. Decision

### 2.1 Config single source of truth — `dev.toml`

A declarative file is the one source of truth for dev process env:

- `[vars]` — reusable scalars referenced as `${name}`.
- `[service.<name>]` — one launchable process: cargo `package` (+ optional `bin`),
  an `env` block, optional `extends`/`env_remove` for variant inheritance,
  optional `needs_cert`, optional HTTP `readiness_probe`, and optional
  `dotenv_passthrough` for ambient secrets.
- `[profile.<name>]` — a named composition of services plus build `mode`
  (debug/release). Mode is orthogonal to env (`run-client` and
  `run-client-release` set identical env; only the cargo `--release` flag differs),
  so it is a profile flag, not duplicated env.

Substitution tokens: `${var}` from `[vars]`, and `@cert_sha256` computed from the
WebTransport cert DER at expand time.

### 2.2 Supervisor — `process-compose` + `siderealctl`

Process orchestration leaves the Makefile for a thin `siderealctl` wrapper over
`process-compose`. `process-compose` owns supervision, status, health checks,
per-process restart, and a REST/Unix-socket API. `siderealctl` owns only the
domain logic (cert generation, shard-route string building, debug/release
selection) and *generates* the `process-compose` spec from a `dev.toml` profile.
We do not build a process supervisor from scratch.

### 2.3 Task runner — `just`

Build/quality/db/admin tasks move to a `justfile`. The Makefile is retired once
`siderealctl` and `just` both exist.

### 2.4 One arbiter + hard enforcement

Both humans and agents go through the single arbiter; nobody uses raw
`cargo run`/`pkill` of service binaries. This is enforced by a Claude Code
`PreToolUse` Bash hook that rejects direct start/kill of the service binaries and
points at `siderealctl`, not by AGENTS.md convention alone.

### 2.5 Agent interface

The agent interface starts as the `siderealctl` CLI (also useful to humans). An
MCP server is added later only if the CLI proves insufficient, and only as a thin
wrapper over the supervisor's API — MCP is an interface, not the solution.

## 3. Alternatives considered

- **From-scratch Rust supervisor** — rejected for now; re-implements signal
  handling, log multiplexing, and restart backoff that `process-compose` provides.
- **Docker Compose for all services** — rejected; bad fit for the native GPU
  client and fast Rust rebuild loops. Kept for Postgres only.
- **`.env`-per-profile as source of truth** — rejected; cannot express dependency
  ordering or shard topology the supervisor needs.
- **MCP-first agent interface** — deferred; the arbiter + hook is what stops
  stomping, not the interface shape.
- **Convention without a hook** — rejected; ignored under pressure.

## 4. Phasing and status

- **Phase 1 (done).** `dev.toml` + `scripts/devenv.py` (`list`/`env`/`run`/`verify`).
  `devenv.py` reproduces every `run-*` target's env exactly, proven against
  committed golden snapshots in `scripts/devenv_golden/` (secrets normalized to
  defaults so nothing sensitive is committed). The Makefile `run-*` recipes now
  delegate to `devenv.py run`; `dotenv_passthrough` closes the gateway-secret gap.
- **Phase 2 (core landed 2026-05-30).** `scripts/siderealctl` wraps `process-compose`
  (v1.110.0; install to `~/.local/bin`). It imports `devenv.py` for env expansion (no
  duplication), ensures the WebTransport cert when a service declares `needs_cert`,
  generates a process-compose spec from a `dev.toml` profile (one process per service,
  cargo command + build mode, `environment` from devenv, readiness-aware ordered
  `depends_on`,
  `restart: no` so crashes stay visible), and launches it **detached** with a repo-local
  unix socket (`.siderealctl/`, gitignored). Commands: `up <profile>`, `doctor <profile>`,
  `status`, `restart/start/stop <svc>`, `logs <svc>`, `down`, `spec <profile>` (dry run),
  `attach`, `profiles`. `--disable-dotenv` is passed so only the explicit per-service env
  applies (no global `.env` re-leak). process-compose only manages processes it started, so
  `down` never touches externally-launched servers — the no-stomp property §1.2 wants.
  Active preflight: `up` parses each service's *bind* ports from `dev.toml` (`*BIND*` and
  bare `*_PORT` keys; connect/advertise addrs like DB URLs and `*_PUBLIC_ADDR` are excluded
  so healthy deps such as Postgres:5432 are never flagged) and refuses to launch (exit 2) if
  any is already held by a process siderealctl did not start, naming the holder pid;
  `--force` overrides and `doctor` reports without launching.
  Verified: spec generation + `--dry-run` validate; detached `up`/`status`/`logs`/`down`
  round-trip over the socket; `down` left pre-existing externally-started servers alive;
  `doctor`/`up` detected a running `make run-*` stack on the bind ports and refused while
  ignoring Postgres on 5432.
  Still open in Phase 2: retire the Makefile `dev-stack*`/`run-*` recipes once this is
  the blessed path; multi-shard profiles.
- **Phase 3 (largely done 2026-05-30).** `justfile` owns all build/quality/db/admin
  tasks (`fmt`, `clippy`, `check`, `test*`, `pg-*`, `wasm-check`, `windows-*`,
  `publish-client-windows`, `clean-*`, `target-size`, `ensure-webtransport-cert`,
  `brp-dump-*`, `register-demo`, `setup-environment`); verified with
  `just --list`/`--fmt --check` and dry-run rendering. Single-shard service launch is
  `siderealctl`. README/AGENTS references repointed (`just`/`siderealctl`); no CI or
  scripts invoked `make`. The Makefile is **reduced to a deprecated multi-shard
  `dev-stack-multi` holdout** (plus `ensure-webtransport-cert`) with a banner — it is
  NOT yet deleted, because `siderealctl` has no multi-shard profile (the Phase 2 open
  item). Full Makefile removal is gated on porting multi-shard topology into
  `dev.toml`/`siderealctl`. `just` (v1.51.0) must be installed (`just.systems/install.sh`),
  like `process-compose` in Phase 2.
- **Decision revised (2026-06-01): single CLI — `justfile` folded into `siderealctl`, then removed.**
  The original §2.2/§2.3 split (`just` for tasks, `siderealctl` for processes) is **superseded**:
  having two entry points was friction. `siderealctl` is now the one dev CLI — it owns both the
  build/quality/db/publish **tasks** (a `TASKS` registry of bash snippets: `fmt`, `clippy`, `check`,
  `test*`, `pg-*`, `wasm-check`, `windows-*`, `publish-client-windows`, `build-wasm`/`build-game-client-wasm`,
  `dashboard-build`, `clean-*`, `target-size`, `ensure-webtransport-cert`/`cert`, `brp-dump-*`,
  `register-demo`, `setup-environment`) **and** the process lifecycle (`up`/`status`/… over
  process-compose). The `justfile` was deleted; README/AGENTS/skill/Makefile references repointed to
  `siderealctl <task>`. The build-vs-process *concept* still holds (tasks vs `up`), but behind one tool.
  `just` is no longer a dependency.
- **Phase 3 follow-on (2026-05-31): dashboard as a tracked service + richer status + WASM decoupling.**
  - `dev.toml` services gained a raw `command` form (vs cargo `package`), plus per-service
    `mode`, `version_source`, and `ports` fields. The dashboard is now tracked:
    `[service.dashboard]` (`vite dev`, mode dev) and `[service.dashboard-prod]` (`vite preview`,
    mode prod), with `[profile.dashboard|dashboard-prod|full-stack-debug]`. `siderealctl`
    `build_spec` runs the raw command (vars substituted) for command services.
  - `siderealctl status` is enriched: per service it reports running state (from
    `process list -o json`), dev/prod mode, product version (workspace version for Rust;
    `dashboard/package.json` for the dashboard), bound ports (env `*BIND*`/`*_PORT` + the
    `ports` field), and full env via `--env`/`--json`. Works with the supervisor down.
  - WASM build is **decoupled from `package.json`** (it no longer builds WASM): `just build-wasm`
    / `just build-wasm --dist` (calls `dashboard/scripts/build-*-wasm.mjs` directly) and
    `just dashboard-build` (Vite only). `pnpm dev`/`pnpm build` just consume prebuilt
    `dashboard/public/wasm/` artifacts. The guard also blocks direct `vite dev/preview` and
    `pnpm … dashboard … dev/preview` so dashboard launch goes through `siderealctl`.
- **Phase 4 (done 2026-05-30).** `scripts/hooks/guard_server_processes.py` is wired as a
  `PreToolUse` Bash hook in committed `.claude/settings.json` (team-wide, not local). It
  denies agent Bash calls that directly start/stop service binaries — `cargo run` of a
  service package (carve-out: one-shot `--bin` tools like `seed_phase0_character` are
  allowed), `make run-*`/`dev-stack*` targets, `devenv.py run`, direct `target/*/sidereal-*`
  execs, and `pkill`/`killall` of sidereal/cargo/process-compose — with a message pointing
  to `siderealctl`. It fails open on malformed input and only acts on `tool_name == "Bash"`.
  `python3 scripts/hooks/guard_server_processes.py --selftest` covers the block/allow matrix;
  verified live (a blocked pattern was denied, ordinary commands passed). The hook is the
  enforcement teeth behind §2.4 — it constrains agents only; a human's own terminal is
  unaffected.
- **CLI simplified (2026-06-16): trimmed to the essential surface; tasks are pass-through.**
  The earlier phase records above enumerate the historical (broader) command set. The CLI
  was pared back to the commands actually used day-to-day. The current surface is:
  - **Lifecycle** (process-compose backed): `up <profile> [--force]`, `down`,
    `restart <svc>`, `stop [svc]`, `status [--json] [--env]`, `logs <svc> [-n N]`,
    `profiles`, `content <verb>` (agent content ops over the gateway).
  - **Quality**: `fmt`, `clippy`, `check`, `test`, `wasm-check`, `docs-check`.
  - **Build**: `build-wasm [--dist]` (folds the former `build-shader-preview-wasm` and
    `build-game-client-wasm` into one pass), `dashboard-build`,
    `publish-client-windows [--no-bump | --set X.Y.Z]`.
  - **Database**: `pg-up`, `pg-reset`.
  - **Setup**: `cert` (the old `ensure-webtransport-cert` alias is gone; `up` still
    ensures the cert automatically), `setup-environment`.
  Removed: `doctor`, `start`, `spec`, `attach`, `ensure-webtransport-cert`,
  `inline-test-guard`, `engine-boundary-guard`, `test-gateway`/`test-replication`/`test-client`,
  `windows-check`/`windows-build`/`windows-release`, `pg-down`/`pg-logs`/`db-reset`/`pg-wait-ready`,
  `build-shader-preview-wasm`/`build-game-client-wasm`, `target-size`, `clean-lite`/`clean-full`,
  `register-demo`, and the `brp-dump-*` family. Behavior changes: tasks now **pass flags
  through verbatim** (`siderealctl publish-client-windows --no-bump`, `siderealctl build-wasm
  --dist` — no `--` separator), bare `siderealctl`/`-h` prints a **grouped** help list
  (Lifecycle / Quality / Build / Database / Setup), and `status` uses colored `●`/`◐`/`○`
  state indicators (still with `--json`/`--env`).

## 5. Maintenance notes

- `dev.toml` and `scripts/devenv_golden/` must stay in sync. When the *intended*
  env genuinely changes, update `dev.toml` and regenerate the affected golden, then
  confirm `python3 scripts/devenv.py verify` is green.
- New per-service ambient secrets must be declared via `dotenv_passthrough`, not
  leaked through a global environment `export`.


2026-09-05 operational correction: ordinary SQL must resolve in `public`, outside
the disposable AGE graph schema. Docker initialization sets the database search path
accordingly. Graph reset refuses non-AGE relations in the graph schema before its
transactional deletion. `build-backend` prebuilds each service's exact development
feature set; `setup-dashboard-browser` and `dashboard-e2e` support authenticated
browser verification against the tracked stack. See the runtime world reset guide.
