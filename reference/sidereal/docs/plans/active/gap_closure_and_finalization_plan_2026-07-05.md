# Gap Closure and Finalization Plan - 2026-07-05

Status: Active
Lifecycle: source-of-truth
Category: plan
Last updated: 2026-09-05
Owners: implementation owners
Scope: Consolidated post-Bevy-0.19 closure plan covering every known remaining gap, open bug, unfinished implementation tail, and evidence follow-up across the runtime, netcode, content pipeline, dashboard, and docs.
Source of truth: yes
Supersedes: docs/plans/superseded/f64_world_precision_migration_plan_2026-04-24.md, docs/plans/superseded/full_audit_remediation_plan_2026-05-14.md, docs/plans/superseded/lighting_v2_overhaul_plan_2026-04-29.md
Superseded by: n/a
Primary references:
- `docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md`
- `docs/plans/active/ifcs_navigation_and_thrust_allocation_implementation_plan_2026-04-27.md`
- `docs/plans/active/firmament_universe_authoring_and_seed_plan_2026-06-20.md`
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/plans/completed/server_authoritative_tactical_scanner_and_contact_index_plan_2026-04-27.md`
- `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md`
- `docs/decision_register.md` (DR-0035, DR-0038, DR-0040, DR-0048, DR-0049, DR-0051, DR-0053, DR-0054)

## 1. Context

The Bevy 0.19 migration shipped 2026-06-27 (fork mainline `a608a099`, game on Bevy 0.19 +
avian 0.7, client v0.2.57) and the June content-authoring arc (disk-SoT registries D1+D2,
unified pipeline WS0+WS1, Firmament U1–U5+Ui+Z1–Z5, Shipyard V2 A–D) is largely complete.
What remains across the project is a long tail of partially-finished workstreams, known
bugs, and evidence captures that were individually parked while the larger arcs landed.

This plan consolidates all of them into one prioritized closure document. Three
partially-executed plans are superseded by this document and their remaining scope is
absorbed here: f64 world precision (→ WS-F), full audit remediation (→ WS-G), and
Lighting V2 (→ WS-H). Plans that remain independently active (IFCS, unified content
pipeline) are referenced, not duplicated.

2026-08-31 progress note:
- WS-A is implemented and live-verified: world seed persistence is no longer shard-filtered,
  `siderealctl world-reset` provides a guarded reset/reseed path, and the starter field
  reseeded with all four quadrants.
- WS-B items 1, 5, and 6 are implemented. Starter planets, the starter asteroid field,
  and all five global fullscreen backdrop layers have moved from `world_init.lua` into
  the `maw` baseline. `main_world`, `midground_planets`, their assignment rule, tactical
  and lighting defaults, and the pirate patrol remain in world-init pending suitable
  generic baseline lanes.
- WS-C items 1–3 are implemented/verified. The safe registry-resync ladder now covers
  ship roots and asteroid-field profiles, and Shader Workshop publishes baseline-owned
  render-layer instance values through the authoritative whole-baseline write path.
- WS-D items 1–4 are implemented with focused regressions. Motion velocity is full-state;
  the input limiter is connection-keyed; muzzle flashes use presentation-only hull insetting;
  static world-position roots seed their first transform before reveal; hierarchy parents gain
  `GlobalTransform` before propagation; pooled weapon effects are named for BRP/debug inspection.
  Native/WASM target checks and the matched v0.2.58 stack are live-verified. A browser-only
  `std::time::Instant` startup trap found during the evidence pass was replaced by Bevy's
  platform clock; the headless-WebGPU route now reaches ready with no browser errors. A
  signed-in native Ghost-row soak completed under an orchestrated Xvfb/software-Vulkan
  session: the v0.2.58 client reached `ServerSessionReady`, bound the canonical
  controlled entity with flight authority, streamed 82 debug entities, and retained
  exactly one suppressed controlled-GUID counterpart for the Confirmed Ghost lane with
  no unknown suppressions. The soak also exposed and closed two host/bootstrap gaps
  (`libxkbcommon-x11-0`, exact `wasm-bindgen-cli` 0.2.127) and a first-start race;
  `siderealctl` profiles now wait for declared core-service HTTP readiness before
  launching each dependent service.
- The 2026-08-31 dependency pass is complete at the newest valid dependency graph.
  Dashboard peer checks, TypeScript compilation, tests, lint, formatting, and the
  production build are green; TypeScript remains at 5.9.3 because the current
  `vite-tsconfig-paths`/`tsconfck` chain requires TypeScript 5 and `typescript-eslint`
  does not yet accept TypeScript 7. Cargo resolves zero compatible lockfile updates.
  Its three apparent holdbacks are upstream constraints: `generic-array` and `matchit`
  are exact-pinned transitively, while the published `bincode` 3.0.0 crate is an
  intentional compile-error stub rather than a usable successor to 2.0.1. The
  canonical Lightyear fork is pinned to `1758f81a9fd52d4d84db84e0485dd64e9e8a0c6f`,
  including the generic server link-conditioner inheritance fix ported from upstream
  PR #1569.

## 2. Workstream Index

| WS | Title | Priority | Depends on |
| --- | --- | --- | --- |
| WS-A | World reset + world-seed filter robustness | P0 | — |
| WS-B | Firmament finalization | P1 | WS-A (verification) |
| WS-C | Content-pipeline tail + authoring bug fixes | P1 | — |
| WS-D | Netcode + client visual bug fixes | P1 | — |
| WS-E | Replication idle-CPU adaptive runner | P2 | WS-D stability |
| WS-F | f64 compliance closure | P2 | — |
| WS-G | Audit remediation tail (Phases 4–7) | P2 | — |
| WS-H | Lighting V2 finalization | P3 | — |
| WS-I | Evidence captures + test debt | P3 | — |

## 3. WS-A: World Reset + World-Seed Filter Robustness (P0)

The live dev world carries baked-in damage and stale one-shot markers; a controlled
world reset closes several open items at once and is a precondition for WS-B
verification.

Known state being repaired:
- The starter asteroid field is missing its entire +x/+y quadrant: world-init once ran
  as shard 11 with the per-shard owned-region filter on, and
  `filter_records_for_shard_runtime` (`bins/sidereal-replication/src/replication/simulation_entities.rs`)
  dropped the region-(0,0) quadrant at persistence write. The damage is baked in by the
  world-init one-shot marker (`world/world_init.lua:phase2:shard-11`).
- The Firmament planet-placement gate (`build_planet_records` skipping
  `baseline_placed` planets) only takes effect on a fresh world-init.
- Prior `pg-reset` wiped admin/test accounts, so recent Firmament/Shipyard dashboard
  work has not been live-verified in-world.

Tasks:
1. Robustness first: exempt fixed world-seed content from the per-shard owned-region
   filter in `simulation_entities.rs` (world seed must persist fully regardless of which
   shard boots first), or guarantee the initializing shard owns the origin regions.
   Add a regression test that an origin-straddling seed survives a filtered init.
2. Reset the runtime world via `reset_persisted_runtime_world` (re-runs world_init with
   the filter now inert). Do NOT just delete the marker and re-init: field members get
   random GUIDs, so that would duplicate the three surviving quadrants.
3. Re-provision accounts (dashboard e2e fixture: `pnpm e2e:provision`; plus the user's
   own admin account) and bring the stack up clean.
4. Post-reset verification checklist:
   - asteroid field has all four quadrants (~38–46 members each; live DB was NE=0,
     NW=39, SW=43, SE=46);
   - `baseline_placed` planets seed from the universe baseline only (no world_init
     duplicates);
   - universe seed marker `universe:maw` re-applies cleanly (Ui revision loop);
   - world_defaults edits from `data/scripts/world/world_init.lua` are picked up.

Acceptance: full-circle asteroid field in live play; planet placements sourced from the
baseline; documented reset procedure (either in `docs/guides/` or the dev-tooling skill).

## 4. WS-B: Firmament Finalization (P1)

Backend U1–U5 + Uc + Ud + the Ui iteration loop and zone UI Z1–Z5 are shipped. Remaining
(see `docs/plans/active/firmament_universe_authoring_and_seed_plan_2026-06-20.md` for
design detail):

1. **Done 2026-08-31:** per-instance component-overrides editor UI (Z5 backend groundwork exists:
   `BaselinePlacement.component_overrides`). Reuse Foundry's schema-driven
   `ComponentEditorRenderer` (`dashboard/src/components/brp-editors/`), wired to
   `component_overrides[kind]` via a new draft mutator and a right-rail/popup slot in
   `PlacementDetailPanel`.
2. Live deploy verification of the merged-but-unverified aspects: author zones, field
   zones, and backgrounds in the `maw` baseline, restart the stack, and verify in-game —
   especially Uc per-zone background compositing and Ud distance-fade.
3. U6 baseline↔evolved three-way reconcile. Gated on three user decisions recorded in
   the design doc: stable generator member key (spatial/sample key, never array index),
   merge-base materialization (snapshot vs per-entity hash), canonical-hash field set.
   Blow-away-and-reseed (Ui) remains the valid interim while the universe is still being
   designed — U6 can stay design-deferred until authoring stabilizes.
4. **Partially done 2026-08-31:** world_init → baseline migration (DR-0054 end-state).
   Starter planets, the asteroid field, and global fullscreen layers now live in the
   baseline. Remaining world-space render/rule, tactical/lighting, and pirate-patrol
   defaults still need generic baseline lanes before `world_init.lua` can retire.
5. **Done 2026-08-31:** polygon/path smooth distance-fade in `engine-render/src/components/zone.rs`
   (circles fade today; polygon/path are binary in/out) — small engine nicety.
6. **Done 2026-08-31:** field seed now participates in every generated member's spatial
   and visual samples. Changing `layout_seed` rerolls the layout while stable member keys
   remain unchanged; regression coverage proves both properties.

Caveat carried forward: Ui revision re-apply is single-shard v1 (delete-by-tag is not
shard-partitioned); multi-shard re-apply still requires `pg-reset`.

## 5. WS-C: Content-Pipeline Tail + Authoring Bug Fixes (P1)

The unified content authoring pipeline plan stays active as the architecture SoT; the
concrete remaining items are:

1. **Done 2026-08-31:** post-D2f, the Shipyard/Genesis "Publish"/"Discard draft" buttons still target
   the deleted `ships|ship_modules|planets/registry.lua` catalog paths — likely
   broken/no-op. Repoint them at the package endpoints (or remove the buttons where the
   package editors already cover the flow).
2. **Verified 2026-08-31:** silent hydration drop auditing — every
   `insert_registered_components` reflect-deserialization failure must log entity, kind,
   and error (plan §5 item 1 claims this landed 2026-06-13; verify in
   `engine-runtime-sync` and add the missing logging if not). The canonical insertion
   path already logs persisted entity id, Bevy entity, component kind, and decode error,
   with regression tests; no additional implementation was needed.
3. **Done 2026-08-31:** WS3 resync ladder: extend `RegistrySource` live resync beyond
   presentation-allowlisted module kinds to ship roots and asteroid-field profiles;
   implement DR-0049 per-instance value publishing (world-init records through script
   draft/publish); decide the dev-mode policy for resyncing gameplay-stat kinds
   (off in production). Ship-root presentation and asteroid-field ambient/profile resync
   are implemented; gameplay-stat refresh is default-off and isolated to the explicit
   `full-stack-authoring-debug` profile. Baseline-owned layout/radius/seed are excluded.
   Firmament overrides cover baseline placement instances. Global fullscreen render-layer
   values are baseline-owned and publishable from Shader Workshop; world-space rules and
   tactical defaults remain world-init content and are not silently live-mutated.
4. **Code-verified 2026-09-05:** service-token spawn authorization already accepts an
   explicit `owner_id` in `AuthService::admin_spawn_entity`; the old missing-actor-model
   blocker is obsolete. Runtime spawn still addresses Lua bundle IDs, so this does not
   prove a newly authored Foundry package can spawn with its visual and hook fields.
5. **Code-verified 2026-09-05:** the typed event/intent registry, versioned
   `script_api_schema.json`, gateway schema/validation endpoints, and anti-drift test
   exist. WS0 is no longer a missing-foundation blocker. Package hook execution,
   complete blueprint lowering, live instance authoring, and baseline reconciliation
   remain the concrete gaps; see
   `docs/reports/audits/dashboard_game_authoring_audit_2026-09-05.md` and the closure
   order in the unified content authoring pipeline plan §7.

## 6. WS-D: Netcode + Client Visual Bug Fixes (P1)

2026-08-31 implementation note: all four items below are implemented. Historical loss/stall
logs still contain retained-base fallback warnings, which was sufficient to retain the planned
full-state fix even though the exact client-side `DeltaCompressionError` string was not present
in the currently persisted server logs. The final joint deploy and live visual soak are tracked
in the acceptance pass.

1. Velocity `DeltaCompressionError` spam: `LinearVelocity`/`AngularVelocity` are the
   last delta-compressed motion components; under loss/stalls the client logs
   `DeltaCompressionError` on their `ConfirmedHistory` (same bug class as the old
   Position/Rotation origin/flip issues, both fixed by full-state replication in
   `crates/engine-transport/src/predicted_physics.rs`).
   - First re-verify the spam still reproduces on the 0.19 fork mainline build.
   - Implemented: both velocities replicate full-state. With no motion component left on
     delta compression, `SIDEREAL_REPLICATION_MOTION_KEYFRAME_EVERY_N_TICKS` is retired.
   - This is a protocol change: client + server must deploy together, and the client
     must be republished (`siderealctl publish-client-windows`).
2. REPL-MSG-03: implemented by keying the replication input rate-limiter on the bound
   Lightyear client entity instead of the claimed id. Existing input-lane tests plus a
   spoofed-claim quota regression cover the hot path.
3. Mounted-module sprite-scale mismatch: hardpoint `offset_m` is authored in the ship
   model frame, but hull sprites draw fit-to-box (`resolved_world_sprite_size`,
   `bins/sidereal-client/src/runtime/assets.rs`), so module-anchored visuals float
   beyond the drawn hull (plume already worked around via
   `THRUSTER_PLUME_MOUTH_HULL_FRACTION`; muzzle flashes carry the same latent offset).
   Needs a decision: (a) global fix scaling hardpoint offsets into drawn-sprite space
   (affects collision/gameplay), or (b) per-visual runtime anchoring like the plume.
   Implemented as (b): muzzle flashes inset from the authoritative projectile origin toward
   the hull centre at presentation time. Projectile rays/origins, hardpoints, and collision
   remain unchanged.
4. Minor visual stragglers (detector-only): static `world_position` planets can render
   one frame at (0,0) on stream-in before the WorldPosition→Transform sync; the
   persistent unnamed renderable at exact (0,0) (suspected pooled/UI mesh — impact
   spark/explosion pools are not excluded from the ghost detector); B0004 warnings for
   children under GUID-named parents without `GlobalTransform`. Batch these into one
   client visual-hygiene pass; the overlay Ghost row is the regression check. Implemented:
   first-frame static transforms and hierarchy-parent `GlobalTransform` have regressions,
   attachment ordering waits for the reveal gate, and pooled effects carry diagnostic names.

## 7. WS-E: Replication Idle-CPU Adaptive Runner (P2)

Shelved on 2026-06-01 explicitly "until netcode/prediction stabilizes" — that gate has
now cleared. The headless replication `Update` loop free-runs at ~426 Hz idle (~1.4
cores); gameplay/physics correctly hold 60 Hz in `FixedUpdate`/`FixedPostUpdate`.

1. Implement the adaptive custom runner (`set_runner`): uncapped while clients or
   handoffs are active, throttled (~30 Hz) when idle. The flat `REPLICATION_UPDATE_CAP_HZ`
   env knob already parses in `bins/sidereal-replication/src/main.rs` as a fallback.
2. Follow-ups (separate, larger): event-driven non-blocking transport wakeups + sim
   dormancy (avian body sleeping / empty-region hibernation) to cut the 60 Hz floor.
3. Guard: this alters Update-loop timing (input drain/prediction/networking). Land after
   WS-D item 1 settles, behind an env switch with the uncapped baseline as rollback.
   Remember dev.toml env changes need `siderealctl down` + `up`, not `restart`.

Acceptance: idle replication CPU under ~15% of one core with zero clients; no regression
in input latency or prediction under live play.

## 8. WS-F: f64 Compliance Closure (P2)

Absorbs the remaining scope of the superseded f64 migration plan. Phases 1–2 (Avian
lanes, `WorldPosition`, protocol) shipped; the single-representation rule is in
AGENTS.md. Remaining is a compliance audit + hardening pass (original plan §3 Phase 8,
plus any unfinished Phase 3–5 remnants — re-audit first, several items may already be
done):

1. Audit every remaining world-position-adjacent `Vec2`/`Vec3`/`[f32; N]`/`as f32` in
   `engine-runtime-sync`, `engine-persistence`, `sidereal-net`, `sidereal-game`,
   `sidereal-replication`, `sidereal-client`, `sidereal-gateway`, `dashboard/src`;
   authoritative JSON helpers become f64/DVec, f32 helpers demoted to presentation-only.
2. Known concrete stragglers (from the audit plan's Phase 6 tail): shared flight code
   f32 fallbacks (`crates/sidereal-game/src/flight.rs` navigation/heading,
   `character_movement.rs` sync) — deferred earlier because the f32 fallback may be
   load-bearing on the client prediction path; needs a native-client check before
   changing. Serialized `VisibilityRangeSource` disclosure DTO still f32 (`TODO(f64)`).
3. Tests: persistence round-trip at ±5e12-scale coordinates (`WorldPosition(DVec2)`,
   `WorldRotation(f64)`, AGE graph write/read); server large-coordinate paths
   (visibility cell keys, observer anchors, tactical contacts, owner manifests,
   notifications, VFX/audio origins, scripting snapshots, BRP read models); client
   camera-relative projection (f64→f32 at the render boundary); dashboard BRP parser +
   mutation payloads.
4. Docs: mark DR-0035 implemented-with-guardrails; remove the hardening caveat from
   `galaxy_world_structure_proposal.md`; align AGENTS.md wording.

## 9. WS-G: Audit Remediation Tail (P2)

Absorbs Phases 4–7 of the superseded full-audit remediation plan.

1. Phase 4 — dashboard API validation + admin guards: shared helpers for route-param
   parsing, query parsing, Zod body validation, proxy error shaping, and admin scope
   enforcement (`dashboard/src/server/api-route.ts`, `dashboard-auth.ts`); migrate
   destructive/admin/script-publish routes first (`api.admin.spawn-entity`,
   `api.scripts.publish`, `api.scripts.draft`, then the rest of `api.*.tsx`); tests for
   missing MFA/scope, invalid params/bodies. Gates: `pnpm --dir dashboard lint` + `test`.
2. Phase 5 — docs authority cleanup: fix the stale "March 2026 native runtime ownership
   audit" reference in AGENTS.md; resolve the duplicate `DR-0019` numbering; update
   decisions still marked Proposed but implemented; mark plan docs historical where
   feature contracts supersede them. (The 2026-07-05 plans-folder cleanup that created
   this document did the plans-lifecycle half of this phase.)
3. Phase 6 tail — transform fallback audit remnants are the same items as WS-F item 2
   (tracked once, there).
4. Phase 7 — frontend hardening polish: QR SVG sanitizer tests
   (`TotpSetupPanel.tsx`: script tags, event attributes, unsupported elements, external
   references); document route-boundary requirements for data-owning routes; normalize
   remaining route pending/error boundary gaps using the Phase 4 helpers.

## 10. WS-H: Lighting V2 Finalization (P3)

Core V2 contract shipped (top-2 stellar + top-8 dynamic local lights;
`StellarLightSource` with outer-radius delivery). Remaining polish from the superseded
plan (§8–§10):

1. Art-response tuning per material family: asteroids (normal-map space light
   rotation), planets (`PlanetBodyUniforms` accumulation), generic/ship sprites (lit
   sprite upgrade of `StreamedSpriteShaderMaterial`), runtime effects (emissive +
   scene tint, emitting local lights without self-feedback).
2. Richer authored local emitter profiles (Lua-side authoring).
3. Debug overlays for light selection/falloff.
4. Remove the remaining documented exemptions to `system.lighting.v2`.
5. Manual acceptance sweep (plan §9): coherent lit side near a shared star; readable
   dimming outside stellar radius; moving bullet light + impact flashes; two-star
   overlap blending; no unlit ships/sprites.

## 11. WS-I: Evidence Captures + Test Debt (P3)

1. Non-saturated tier-100/250/500 load baselines (distribution plan Phase 1.4 closure;
   procedure in
   `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md`).
   Evidence-only — no implementation blocker.
2. Dense-area A/B captures proving the client-side optimization wins (runtime
   optimization plan follow-up), including the post-authority TickGap lane separation.
3. Tactical scanner M1: dense multi-player, multi-landmark captures validating candidate
   reduction across sparse sectors and the landmark-cache integration.
4. Per-tier scanner redaction tests: explicit Basic → Iff → Classified → Telemetry
   coverage for `redact_tactical_contact_for_scanner`.
5. Test debt: `dashboard/src/lib/shader-preview.test.ts` and the full dashboard suite
   are green after the dependency refresh; continue regenerating
   `registry-uniform-defaults` (`pnpm generate:uniform-defaults`) when it drifts.
   Lightyear's targeted workspace tests and Clippy are green at the pinned fork SHA.
   The old fork branch's all-feature examples still contain pre-existing Bevy 0.19 UI
   API mismatches; keep example modernization separate from Sidereal runtime work.

## 12. Sequencing

1. WS-A first — it is quick, unlocks WS-B live verification, and repairs the live world.
2. WS-B and WS-C in parallel (dashboard-heavy vs backend-light); WS-C item 1 (broken
   publish buttons) is a same-day fix worth pulling forward.
3. WS-D as its own netcode batch: item 1 is a protocol bump, so co-schedule the joint
   server deploy + client publish; items 2–4 ride along.
4. WS-E once WS-D has soaked.
5. WS-F/WS-G/WS-H as rolling background work, each independently landable.
6. WS-I opportunistically, when the relevant systems are touched or hardware is free.

2026-08-31 next-focus note:

1. WS-A and the selected WS-B/WS-C/WS-D closure batch are complete and live-verified.
2. WS-E is now the next bounded technical slice: the netcode soak gate is clear, the
   rollback switch already exists, and reducing the idle free-running replication loop
   pays back every subsequent development and load-test session.
3. The next major player-facing feature after that bounded pass is IFCS Phase 2 reliable
   navigation orders/right-click move. Complete its authority/ACK/owner-route boundary
   before Phase 5 directional hardpoint allocation.

## 13. Deferred Register (explicitly out of scope here)

- Block-ship runtime (ship construction WS2–11): next major feature; authoring side
  shipped via Shipyard V2 A–D. See
  `docs/plans/proposed/ship_construction_blocks_system_v1_plan_2026-06-13.md`.
- Shipyard V2 Phase E (Atelier tile art) — deferrable, see
  `docs/plans/proposed/shipyard_v2_block_authoring_route_plan_2026-06-25.md`.
- DR-0051 WS0 typed event/intent registry + the content-authoring composition plan it
  gates.
- Quest/mission v1 (pipeline WS5) and the fleet-spawner/quest-driving runtime behaviors
  behind Firmament spawner/quest components.
- Target-selection follow-ups: active scan resolution + field-scope disclosure
  evaluator, multi-target, hover soft-focus.
- IFCS Phases 2–4 (navigation orders, feedback controller, actuator fuel accounting) —
  independently active plan.
- NPC lifecycle (distribution Phase 9) — needs its own contract-driven plan
  (`docs/features/proposed/npc_simulation_lifecycle_proposal.md`).
- Lossy motion quantization (DR-0040-permitted bandwidth optimization, after clean
  capacity baselines).
- Replication TUI nice-to-haves; thruster plume particle accents + damage sparks.
- WASM game-client parity (parked; native-primary per DR-0042).
- Space backdrop galaxy-movement generation.

## 14. Validation Gates

- Rust: `scripts/siderealctl fmt`, `clippy`, `check`, `test` (replication tests run via
  `--bins`; hydrate tests need lightyear `ServerPlugins`).
- Dashboard: `pnpm --dir dashboard lint`, `test`, `build` (+ e2e where touched).
- Docs: `scripts/siderealctl docs-check` after any documentation change.
- Any client-visible change: `siderealctl publish-client-windows` (a cargo build alone
  leaves the user on a stale build). Protocol-affecting changes (WS-D item 1) require a
  matched server restart + client publish.
- Env changes in dev.toml: `siderealctl down` + `up` (restart does not reload env).
