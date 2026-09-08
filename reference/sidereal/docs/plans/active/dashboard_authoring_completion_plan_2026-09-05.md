# Dashboard Authoring Completion Plan

Status: Active
Lifecycle: source-of-truth
Category: plan
Last updated: 2026-09-05
Owners: engine + content + gateway + replication + dashboard
Scope: Execute the dashboard authoring audit recommendations after updating frontend and backend dependencies.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/reports/audits/dashboard_game_authoring_audit_2026-09-05.md
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md

## 1. Execution status

2026-09-05: The user authorized all recommendations, with dependency updates first.
The existing working tree contains substantial unrelated/in-flight work; preserve it.
The running development world must not be used as a destructive test fixture.

- [x] Refresh Rust lockfile against current crates.io releases and check the canonical Lightyear fork head.
- [x] Refresh dashboard direct/transitive dependencies, including TypeScript 7 and Vitest 5.
- [x] Update the matching wasm-bindgen CLI to 0.2.128; compile native, WASM/WebGPU and Windows GNU targets.
- [x] Complete final dependency checks/documentation.
- [x] Complete shared blueprint lowering and package-contained hook loading/dispatch.
- [x] Connect package revisions to existing instances while preserving evolved values.
- [x] Expose lifecycle events with explicit creation/hydration/despawn semantics.
- [x] Add authenticated, UUID-addressed, shard-owned live edits with conflict handling and durable results.
- [x] Complete baseline dependency/typed validation, retained merge bases, drift preview and nondestructive application.
- [x] Connect dashboard definition, baseline placement and live instance navigation and application status.
- [x] Run unit/integration and isolated persistence/restart verification, plus required quality gates.

Dependency exceptions: bincode 3.0.0 is a compile-error-only publication, so retain
2.0.1. Lightyear's current main is already pinned at
`1758f81a9fd52d4d84db84e0485dd64e9e8a0c6f`. TypeScript 7 is installed under
`@typescript/native`; API consumers use Microsoft's TS6 alias. The current
tsconfck package declares a TS5-only peer range; retain the warning until upstream
updates it (typecheck/lint/build/test are the compatibility evidence).

2026-09-05 earlier implementation progress: shared blueprint lowering and package Lua
dispatch are connected, including live code reload that retains pending actions
and the last working VM after invalid code. Package instance reconciliation now
uses a retained field-level merge base and preserves placement overrides. New
creation/spawn flags and retired event snapshots connect lifecycle dispatch.
The live component command/receipt lane and dashboard editor are implemented and
under integration verification. Baseline compilation/reconciliation, full
definition/placement/instance navigation and isolated restart tests remain open;
the unchecked acceptance items above are not claims of completion.

## 2. Runtime and persistence boundaries

- Generic package lowering, hook module handling and three-way comparison belong in
  engine crates. Concrete component/asset policy is injected from content where needed.
- Persist provenance and the previously applied authored values on each relevant ECS
  entity. Keep immutable authored source separate from runtime/evolved values.
- Gameplay edits are typed commands applied only by the owning shard. Dashboard and
  gateway never authoritatively patch graph state beside the simulation.
- Conflict detection compares the expected field/component base with the authoritative
  current value. Retry identifiers and application results must not become an alternate
  gameplay state store. Persist before reporting durable completion.
- Handoff carries persisted entity authoring metadata in the normal snapshot; commands
  must be rejected/rerouted while ownership is changing. Published content converges
  through the control plane; player replication retains current redaction rules.
- Baseline reconciliation compares old authored state, new authored state and evolved
  runtime state. Preserve conflicts and runtime-created state; never use the current
  blanket baseline replacement as the live application mechanism.

## 3. Acceptance

Execute the five end-to-end scenarios in the audit §4. In particular, tests must use
the actual Foundry package source/bindings rather than the independent Lua bundle
with a similar name. Native/WASM consume the same authoritative results; no client VM
or client-authoritative mutations are introduced.


## 4. Implementation verification and deployment acceptance

2026-09-05 final repository verification: all implementation items in §1 are now
complete. The earlier progress note records an intermediate state. The authoritative
behavior and API contract are in
`docs/features/active/dashboard_game_authoring_runtime_contract.md`.

Verified:

- Workspace formatting, Clippy with warnings denied, and workspace check passed.
  WASM/WebGPU and Windows GNU client checks passed with incremental compilation off.
- Dashboard typecheck, lint/authoring guards, production build, and all 399 tests
  across 55 files passed. The production dashboard build consumes existing WASM
  artifacts; this does not claim a freshly published native or WASM game client.
- Engine content and scripting suites passed, including blueprint lowering, retained
  merge bases and scoped package hook dispatch. The 21 runtime scripting tests include
  actual package spawning without a same-name Lua bundle, create/spawn callbacks,
  persistence hydration without completed callback replay, and removed-entity events.
- Gateway dry-run tests (9) and baseline publication tests (15) passed, including
  invalid unbound hooks and concurrent revision compare-and-swap publication.
- Owning-shard authoring tests (5), initial-world/write-clock tests (2), and shared
  baseline compiler tests (2) passed. Baseline compilation exercises the committed Maw
  content through its real builders and canonical reflected component types.
- Existing persistence lifecycle tests (2) and the new persistence-service durability
  integration test passed. The latter creates its own temporary database and exercises
  canonical protocol handlers, service reconstruction, atomic creation markers,
  stale-write rejection, deletion protection, baseline target compare-and-swap and
  explicit reset cancellation. It never resets the running development database.
- Documentation validation passed; `git diff --check` passed.

Deployment acceptance remains open:

- [x] Activate the new backend binaries and verify service readiness and route guards.
- [ ] Perform an authenticated dashboard/game smoke test of the five scenarios in §3.
- [ ] Verify code delivery and live-edit rejection during an actual two-shard handoff.
- [x] Establish fresh baseline history through the authorized development-world reset
  and verify authenticated baseline preview/application receipts.
- [ ] Verify baseline appearance and observer-driven field generation in the game client.

A read-only query confirmed that the running Maw world has the old `universe:maw`,
`universe-planet:maw:*` and `universe-field:maw:*` group markers. It lacks the retained
per-entity creation/merge history required by the new baseline reconciliation lane.
The new runtime preserves this world and reports the limitation; it cannot safely
infer an old authored base from evolved values. This restriction does not disable
allowlisted live component edits on existing entities after backend activation.
2026-09-05 activation: a local PostgreSQL custom archive was captured and its archive
index verified at `/root/sidereal-backups/before-authoring-2026-09-05.dump` (mode 0600).
Persistence, replication, gateway and dashboard were restarted through `siderealctl`.
Backend health endpoints returned 200; new package-instance, baseline-preview and
operation-result routes returned 401 without credentials. The owning shard reported
loaded `container.goods` revision 5 and `spawn.player` revision 1, no failed script
revision, and no instance application errors/conflicts. Replication logged the expected
old-baseline-history warning and preserved the existing world. No world reset or test
content publication was performed.

The new `build-backend` task builds each service separately before restart so Cargo
feature unification matches individual launches. A service/profile naming collision
that rejected `restart dashboard` was fixed and checked with a focused regression.
The final task preserves normal development build settings; quality gates remain
non-incremental. Obsolete test executables and inactive incremental build directories
were removed to recover space during activation; no project source was removed.

There is no content service token in this agent session. Authenticated browser-to-game
replication, visual appearance and live multishard behavior therefore remain deployment
acceptance work, not claims established by service readiness or automated suites.


## 5. Authorized reset and live persistence verification

2026-09-05: The user explicitly authorized the development-world reset. The reset
exposed an existing PostgreSQL schema isolation defect: ordinary account, catalog and
audit tables had resolved through `$user` into the disposable AGE `sidereal` schema.
AGE's cascading graph drop removed those tables. They were recovered from the verified
pre-activation archive into `public`, including both accounts and all 36 registry
packages; remaining control metadata was separated as well. The database default
search path is now `public`. Infra initialization enforces that default, and graph
drop now refuses non-AGE relations before deletion. A regression demonstrates refusal
and preservation of an unrelated SQL table, followed by a successful clean graph drop.
No compatibility shim or automatic gameplay backfill was introduced.

Live reset verification also exposed and fixed two authoring defects: unchanged
reconciliation now completes locally without sending an invalid empty persistence
request, and single-shard baseline ownership respects the existing disabled-region-
filter mode instead of omitting negative-coordinate placements. Regression tests cover
both. Workspace formatting, Clippy and check passed again; graph lifecycle tests (3),
reconciliation/clock tests (3) and baseline application tests (3) passed.

The recovered stack is running with Maw revision 15, 21 per-entity creation markers
and 21 persisted authoring-source components. Authenticated baseline preview reports
`blocked: false` with 21 reconciliation candidates; shard 0 reports `durable` with
no issues. Three authored container instances are discoverable through Foundry.
The Playwright admin login/MFA setup passed using the existing local credential
fixture; the matching Chromium browser was installed after the dependency update.
An authenticated live edit temporarily changed one container's display name, received
a durable receipt, survived a replication restart, and was then restored through a
second owner-shard command with a durable receipt. No test name remains authored or live.

Visual gameplay acceptance, observer-driven asteroid chunk generation and actual
two-shard handoff remain separate checks. With no active game observer, no field-member
entities were present at this verification point; this is not evidence of in-game
field coverage. The original backup remains available outside the repository.


2026-09-05 public gateway repair: local service health had missed a reverse-proxy
failure affecting the remote native client. On the authorized NPM host `10.0.1.248`,
proxy host 24 (`gateway.dastari.net`) still forwarded to the retired
`http://10.0.1.9:8080`. Its saved database entry now forwards to
`http://10.0.1.200:8080`; NPM regenerated the host configuration, validated Nginx
and reloaded it. The previous row and configuration were backed up on the NPM volume.
Public `/health` and `/startup-assets/manifest` now return 200, and every required
startup asset passed download-size and SHA-256 verification through the public URL.
The tracked stack uses `full-stack-public`, advertising `sidereal.dastari.net` for
replication instead of loopback. This verifies public gateway/preload access; it does
not claim remote UDP gameplay or multishard acceptance.


2026-09-05 remote game transport diagnosis: the router's Sidereal forwarding rule
also targeted the retired `10.0.1.9`. Direct LAN probes reached both UDP listeners
while probes sent through the public address did not. The user updated the rule to
`10.0.1.200`; subsequent public-address probes reached UDP 7001 and 7003 on the server.
The v0.2.58 downloadable client was the August 31 artifact, so publication of a
matching current-source v0.2.59 Windows build was started through `siderealctl`.
Transport timeout text alone was not evidence of a protocol mismatch; public packet
delivery was a separately confirmed blocker.


2026-09-05 matching client publication completed: `siderealctl
publish-client-windows` published v0.2.59 (59,258,368 bytes) with the configured
`https://gateway.dastari.net` URL. The public stack was rebuilt and restarted at
v0.2.59 and public gateway health remained 200. Dashboard login/MFA passed again;
the authenticated public dashboard manifest reports v0.2.59. The router forwarding
change was verified by receiving probes sent through the public address on both
UDP ports. A completed remote gameplay session still requires client acceptance.
