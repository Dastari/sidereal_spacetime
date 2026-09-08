# Unified Content Authoring Pipeline Plan

Status: Active
Lifecycle: source-of-truth
Category: plan
Last updated: 2026-09-05
Owners: architecture + dashboard + gateway + replication runtime + content
Scope: Roadmap to a single secure authoring pipeline (code, Lua, shaders, planets, ships, world, sounds) with live fleet/client propagation, a Lua-resilient dashboard, runtime scripting power (spawning, lifecycle hooks, quests), and the Lua-vs-Rust authority line — including the asteroid-fracture root-cause fixes.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0025_runtime_script_catalog_authority.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/plans/completed/registry_live_entity_resync_plan_2026-06-12.md
- docs/features/active/scripting_support_contract.md
- docs/features/reference/scripting_support_reference.md
- docs/features/implemented/asteroid_damage_driven_fracture_implemented.md

## 1. Goal

One pipeline for all authored content: an author (human via dashboard, or AI agent via
files/CLI/API) edits Lua registries, shaders, planets, ship prefabs, world records, sounds,
or assets; publishes through one secure path; every replication shard converges without
restart; live entity instances refresh; connected clients receive the update. The dashboard
grows into the full authoring surface (ships, modules, planets, shaders, sounds, world,
eventually quests) and never breaks because of author-side Lua.

## 2. Current state (what already works)

2026-09-05 code audit: the dashboard has durable authoring surfaces, but the full
package → live instance → persistence workflow is incomplete. The detailed evidence
and end-to-end acceptance sequence are in
`docs/reports/audits/dashboard_game_authoring_audit_2026-09-05.md`. In particular,
Foundry's package hook bindings are not consumed by the runtime AI-handler dispatcher;
generic blueprint translation omits its separate visual/hook fields; live entity
editor routes are read-only; baseline publication applies through boot-time scoped
reseed, not a drift-preserving live reconcile. The typed script API schema and
service-token spawn authorization are already present.

The pipeline largely exists as four planes:

1. **Script/content plane** (DR-0025/0026, disk-publish cutover): published standalone
   Lua lives on disk; SQL holds its derived published catalog and ephemeral drafts.
   Gateway publication commits the source to disk before refreshing the cache; every
   shard polls the catalog and reloads its consumers. Reloading source does not rerun
   once-only world initialization or connect package-contained hook modules.
2. **Asset plane** (DR-0046): Lua asset registry → content-addressed catalog
   (`asset_id` → immutable `asset_guid` + sha256) → authenticated gateway HTTP delivery →
   client checksum cache → live `catalog_version` invalidation push to in-world clients
   (shaders, images, SVGs, audio all rebind live).
3. **Authoring plane** (DR-0049): dashboard editors read the authoritative store (graph DB /
   gateway content endpoints, never one live shard), write via gateway draft→publish under
   MFA'd scoped tokens; registry republish now resyncs live instance presentation via
   `RegistrySource` (registry_live_entity_resync plan, v1 = ship modules).
4. **Runtime scripting plane**: sandboxed `mlua`, interval handlers + six combat events
   (`shot_fired`, `shot_impact`, `damage_applied`, `health_depleted`, `before_destroy`,
   `destroyed`), per-entity opt-in via `ScriptState.data.event_hooks`, read-only world
   snapshots, intent-only writes. Implemented intents are `set_navigation_target`,
   `set_script_state`, `stop`, `spawn_entity`, `despawn_entity` (WS4), plus
   `ctx:notify_player`. The remaining rich surface in the scripting reference
   (`fire_weapons`, `create_mission`, `schedule_after`, economy) is **not implemented**.

Rust code remains the one intentional outlier: build + restart via `siderealctl` (DR-0043).

## 3. Known structural gaps

1. **Dashboard parses Lua itself.** A hand-rolled literal-tables-only `LuaSubsetParser` is
   duplicated across `dashboard/src/lib/{shipyard,genesis,audio-studio,shader-workbench}.server.ts`
   (~3,000 lines). Any non-literal authoring (helper functions, expressions) breaks editors —
   demonstrated 2026-06-12 by `shader_param_values()` in `engine_main_mk1.lua` breaking
   Shipyard. The gateway already runs the real interpreter and holds typed validated
   registries; the dashboard should never see raw Lua except in the generic script editor.
2. **No non-interactive authoring credential.** Gateway tokens come from account login +
   verified MFA. AI agents need a scoped service credential and a deterministic reload
   trigger instead of waiting on the poll.
3. **World-init is once-per-`init_key`.** Edits to `world/world_init.lua` records (render
   layers, lighting, world defaults, field roots) never reach an existing world without a
   marker reset. DR-0049's "per-instance value publishing" follow-up plus a guarded
   re-apply path are missing.
4. **No runtime spawn from Lua.** Spawning exists only at bundle/bootstrap time and via the
   gateway admin path (`POST /admin/spawn-entity` → control channel → bundle build →
   persist → hydrate). Missions, encounters, loot, and economy all need a validated
   `spawn_entity`/`despawn_entity` intent.
5. **Two entity-birth paths.** Graph-record hydration sets up replication
   (`Replicate`/`InterpolationTarget` in `hydrate_records_into_world`); raw Rust spawns do
   not. Projectiles got a bespoke attach system; asteroid fracture fragments got nothing
   (see §5). Every future runtime spawn re-risks this bug class.
6. **Silent hydration drops.** `insert_registered_components` (engine-runtime-sync) skips a
   component on reflect-deserialization failure with no log. Authoring-time validation does
   not round-trip payloads through the real typed deserializer, so shape mismatches surface
   as invisible runtime behavior holes (see §5).
7. **Quest/dialogue/economy**: accepted in principle (DR-0020..0024), nothing implemented;
   designs parked in the scripting reference.

## 4. The Lua ↔ Rust authority line (lifecycle/destruction)

Adopt the scripting reference §2.3.1 contract as the operating rule, with the asteroid as
the worked example:

| Behavior class | Lives in | Mechanism |
|---|---|---|
| Default, scale-path behavior (fracture resolution, explosion VFX, standard loot) | Rust system | Driven by Lua-**authored profile data** (`AsteroidFractureProfile`, destruction/loot profiles) |
| Exceptional per-entity behavior (loot container on this rock, cancel a death, mission trigger) | Lua | `event_hooks` handler on `before_destroy`/`destroyed` emitting **intents** |
| New mechanic categories | Rust first | New validated intent + applier system; then Lua can use it |

Rationale: fracture is physics-coupled (colliders, mass, impulses), runs on the 60 Hz
authority path, and must stay deterministic and Rust↔WGSL parity-exact — Lua cannot and
should not do that per-death. Lua's power grows by **growing the intent catalog**
(deliberate, validated, auditable), never by letting scripts mutate ECS state or become the
default per-event code path. "Spawn a goods container instead" is exactly: hook `destroyed`
→ `ctx:emit_intent("spawn_entity", { bundle_id = "container.goods", position = ..., ... })`
once WS4 lands. "Cancel the death / restore health" is a `cancel_destruction` intent on
`before_destroy` — added only when needed, with explicit authority rules.

## 5. Asteroid fracture: root cause (investigated 2026-06-12)

Live-DB + code investigation found the persisted starter-field data **correct** (root has
`asteroid_field`, `asteroid_fracture_profile`, `asteroid_field_damage_state`; 150 members
have full component sets and correct `field_entity_id` linkage). Two real defects:

**Bug A — `entries: {}` kills hydration of `AsteroidFieldDamageState` (primary).**
`bundles/starter/asteroid_field.lua` authors `asteroid_field_damage_state = { entries = {} }`.
An empty Lua table serializes to JSON `{}` (object); the component field is
`entries: Vec<AsteroidMemberStateEntry>` and the typed deserializer rejects a map where a
sequence is expected. `insert_registered_components` then **silently skips the component**
(engine-runtime-sync `lib.rs` ~line 180). The field root therefore runs without
`AsteroidFieldDamageState`; both `fracture_damaged_asteroid_members` and
`fracture_depleted_asteroid_members` require it in their `fields` query, so the root never
matches, every member silently `continue`s, and the generic `begin_pending_destructions`
(member has `Destructible`) vaporizes the rock with zero fragments. Crack rendering driven
by `AsteroidMemberDamage` octant stress still works (that component is inserted on first
impact), which matches "cracks but no break-up".

**Bug B — fragments are never replicated (latent, bites after fixing A).**
`spawn_fracture_child` (sidereal-game) raw-spawns fragments with gameplay components only.
`Replicate`/`InterpolationTarget` are inserted exclusively at graph-record hydration and by
the bespoke projectile system (`configure_ballistic_projectile_replication`). No system
attaches replication to fragments: the server would simulate them, persistence would store
them (`Added<EntityGuid>` dirty marking), but clients see nothing until a restart hydrates
them through the graph path.

### Fixes (WS0)

Status 2026-06-13: items 1–5 implemented; item 6 unit/CI coverage landed, live
fracture verification pending next replication rebuild+restart.

1. ✅ Log every hydration component-decode failure (entity, kind, error). Silent skip is
   forbidden. (`engine-runtime-sync` `insert_registered_components` — error-level with
   entity id, kind, error.)
2. ✅ Normalize empty-table ambiguity: canonical location is the typed decode
   (`engine_runtime_sync::decode_component_payload_typed`), used by both hydration and
   the authoring gate. Retry ladder: as-authored → graph metadata keys stripped
   (`engine_persistence::GRAPH_COMPONENT_METADATA_KEYS` — persisted vertices merge
   `component_id`/`component_kind`/`last_tick` into the payload) → empty objects→arrays
   (recursive) → `null` when the remaining payload is an empty container. The last rung
   exists because the gate exposed a second latent defect: unit-struct marker components
   (`ship_tag`, `weapon_tag`, `player_tag`, `public_visibility`, `mass_dirty`,
   `controlled_start_target`) are authored in Lua as `{}` but deserialize from `null`,
   so they were silently dropped from every bundle-spawned entity at hydration.
   Verified live 2026-06-13: fresh shard boot hydrates 196 entities with zero decode
   failures; BRP dump shows `AsteroidFieldDamageState` on the field root and marker
   components present on live entities.
3. ✅ Authoring round-trip gate: `sidereal_game::authoring::validate_authored_graph_records`
   wired into replication bundle-spawn + world-init record builds and gateway bundle +
   world-init loaders; existing world-init CI tests now enforce it repo-wide.
4. ✅ Repaired the persisted record (`entries` `{}` → `[]`) via one-shot SQL on the AGE
   `Component` vertex (2026-06-13); hydration also self-heals such records now.
5. ✅ Generic replication-attach for runtime-born entities:
   `attach_replication_to_runtime_born_entities` (FixedPostUpdate) applies the shared
   hydration decision table (`replication_targets_for`) to `Added<EntityGuid>` entities
   without `Replicate`/`GhostMarker`/`BallisticProjectile`. The projectile system was
   deliberately NOT re-based: its owner-prediction + PreSpawned + per-client
   interpolation-exclusion flow is bespoke by design.
6. ◐ Unit tests cover decision table, filter semantics (one-shot Added matching, ghost/
   projectile exclusion), and Bug-A hydration regression. Live test (shoot starter-field
   asteroid → visible fragments without restart; restart → consistent) still to run.

## 6. Workstreams and priority order

**WS0 — Asteroid fracture + hydration trust (immediate).** §5 fixes. Small, high-value,
and items 1/3/5 harden the exact seams the rest of this plan builds on.

**WS1 — Dashboard stops parsing Lua (highest leverage).** Gateway endpoints that return
*decoded, validated* registry JSON (ships, modules, planets, audio, shader params) straight
from the typed registries, plus structured write-back (gateway round-trips JSON patches
into the Lua source or stores structured data beside it). Dashboard deletes
`LuaSubsetParser` everywhere; editors fail soft per-definition ("definition X failed
validation: <error>" + raw-source fallback) instead of breaking routes. Aligns with
DR-0049; CI guard extends to forbid dashboard-side Lua parsing.

Status 2026-06-13 (gateway plane landed; dashboard migration + CI guard pending):
- ✅ Read: `GET /admin/dashboard/registries/{ships,ship-modules,planets,audio}` serve
  decoded JSON from the active script catalog with pending drafts overlaid
  (`authoring_sources_with_drafts`), fail-soft per definition
  (`sidereal_game::lua_content::AuthoringRegistryEnvelope` — `error` per id, never a
  route failure). Shader params already covered by `/admin/dashboard/shader-schemas`.
  Scope `scripts:read`; reads the authoritative store, never a live shard (DR-0049).
- ✅ Write generator: `engine_script::json_to_lua_return_source` (deterministic
  pretty-printed Lua, float-vs-int preserved, identifier-vs-bracket keys). The
  dashboard never emits Lua.
- ✅ Write-back (all structured registries):
  `POST /admin/dashboard/registries/{ship-modules,ships,planets}/{definition,index}`
  and `POST /admin/dashboard/registries/audio` decode JSON → run the strict
  validator (ships against current module+asset registries; planets against the
  registry entry; indexes round-trip through the real index decoder; audio
  whole-file through the audio decoder) → generate Lua → save draft via the
  standard draft→publish path (`scripts:write`). Spawn entity_id stays
  loader-derived, never trusted from the request.
- ✅ Dashboard migration: all four structured editors now consume the decoded
  registry JSON and write structured JSON back, with the parser silos deleted —
  Shipyard (`LuaSubsetParser`, ~240 lines), Genesis (~480 lines of regex field
  parsing; types reshaped to the server `PlanetDefinition` incl. nullable spawn +
  signal fields, no shim), Audio Studio (~435 lines of table-bounds parsing +
  in-place marker text-patching → structured JSON marker patch), Shader Workbench
  (~140 lines of dead registry regex; it already read `/admin/assets/catalog`).
  Fail-soft: definitions the gateway can't validate are hidden and surfaced via a
  catalog `errors` list (audio is whole-file, so a decode failure surfaces the
  gateway error). Generic script editor keeps raw Lua by design.
- ✅ CI guard `dashboard/scripts/check-no-dashboard-lua-parsing.mjs` (in the
  `lint` chain) forbids re-introducing dashboard-side Lua parsing/generation
  (`LuaSubsetParser`, `parse*RegistrySource`/`*DefinitionSource`,
  `serialize*Registry/Definition`, Lua registry structure indexing).
- Behavior change accepted: per-definition + registry-index Lua files become
  canonically formatted on dashboard save (the gateway regenerates from validated
  structured data) — uniform across all editors.

WS1 status 2026-06-13: complete (gateway read/write plane + full dashboard
migration + CI guard). Verified: dashboard tsc, vitest (76), all four guards, and
the gateway/sidereal-game Rust suites green.

**WS2 — Agent credential + deterministic reload + CLI.** Scoped non-interactive service
tokens (e.g. `scripts:write`, `admin:spawn`; revocable; audit-tagged as agent);
`POST /admin/scripts/reload` and `/admin/assets/reload`; `siderealctl content`
publish/status/spawn verbs wrapping the gateway APIs. Closes the "AI agent securely
triggers hot reload" requirement end-to-end.

Status 2026-06-14 (complete except agent-spawn, deferred):
- ✅ Service (agent) tokens: `auth_service_tokens` (hash-only, label, scopes,
  expiry, `revoked_at`, `created_by`); `POST/GET /admin/service-tokens`,
  `DELETE /admin/service-tokens/{id}`. Minted ONLY by an MFA'd admin holding
  `admin:accounts:write`; granted scopes must be in the grantable set
  {`scripts:read`,`scripts:write`,`admin:spawn`} AND held by the minting admin.
  Plaintext `svc_…` returned once.
- ✅ **Security decision (deliberate MFA exception):** the existing interactive
  admin routes are UNCHANGED — still require `session_context.mfa_verified`. A
  service token is a distinct credential class accepted by the content
  authorization path (`ContentActor` / `authorize_content`) WITHOUT per-call MFA,
  because automation cannot present MFA and the security boundary is "an MFA'd
  admin authorized this credential at mint time." It is revocable (unlike a JWT)
  and every content action audit-logs the actor (`account:<id>` or
  `agent:<label>(<id>)`). Recorded in the gateway-admin-security rule
  (`.claude/skills/sidereal-observability-net`). Reuses DR-0049's authoring
  control-plane authority model; no new DR.
- ✅ Deterministic reload: `POST /admin/scripts/reload` (service-capable alias of
  reload-from-disk) + `POST /admin/assets/reload` (new). Scripts read path
  (`list_scripts`/`get_script`) also service-token capable so `content status`
  works with a `scripts:read` token.
- ✅ CLI: `siderealctl content {status|publish|draft|reload}` over the gateway with
  a service token (`--token`/`$SIDEREAL_CONTENT_TOKEN`). The full agent flow
  (publish a module edit + reload, no browser session, audit shows agent) is wired.
- ◐ Deferred: `content spawn` / service-token `POST /admin/spawn-entity`. Admin
  spawn resolves the owner + actor from the interactive admin's player entity,
  which a service token lacks; wiring it needs an actor-model change (synthesize a
  system owner, require explicit `owner_id`). The `admin:spawn` scope is already
  grantable for when this lands.

Tests: 8 service-token tests (mint→authorize, scope-subset + grantable-set,
`admin:accounts:write` gate, revoke, expiry, unknown). Live: all routes auth-gate;
CLI end-to-end against the live gateway (bogus token → 401, exit 1). Full
mint→publish→reload click-through needs an MFA'd admin (headless-auth limitation).

**WS3 — Resync ladder + world-init re-application.** Extend `RegistrySource` resync to
ship roots and asteroid-field profiles; implement DR-0049 per-instance value publishing
(world-init records through script draft/publish); add guarded world-init re-apply
(content-hash per record or admin re-run) so existing worlds pick up world edits. Decide
the dev-mode policy for resyncing gameplay-stat kinds (off in production, optional in dev).

2026-08-31 progress: ship-root presentation and asteroid-field ambient/profile resync are
implemented. Gameplay-stat refresh is default-off; the dedicated
`full-stack-authoring-debug` profile opts in, while every production-style profile stays
off. Baseline-owned field layout/radius/seed are excluded. Firmament placement overrides
provide per-instance publishing for baseline placements. The remaining WS3 item is global
world-init render/rule record value publication/re-apply.

**WS4 — Runtime spawn/despawn intents (keystone for the game).**
`ctx:emit_intent("spawn_entity", { bundle_id, position, owner?, overrides })` validated
against the bundle registry + override allowlist + budgets, executed through the **same
records → persist → hydrate path as admin spawn** (one birth path; replication setup free).
`despawn_entity` symmetric. Audit-logged. Unlocks loot containers, encounters, missions.

Status: **done 2026-06-17.** Implemented as hand-built `SpawnEntity`/`DespawnEntity` ScriptIntents
(`bins/sidereal-replication/src/replication/runtime_scripting.rs`) drained by a dedicated
`apply_script_spawn_intents` applier: default-deny spawnable allowlist (`ScriptSpawnableBundles`,
seeded with `container.goods`), non-player owner constraint (`owner_id`/`entity_id` server-stamped,
never script-chosen), per-tick + live-count budgets, despawn gated to non-player-owned entities, all
through the shared `spawn_bundle_into_world` (records → typed authoring gate → `hydrate_records_into_world`;
async `Added<EntityGuid>` dirty persist — no blocking persist on the tick). Demo `container.goods`
bundle + `data/scripts/ai/loot_on_destroyed.lua` worked example. **Part A** also closed the WS2
`content spawn` deferral: gateway `admin_spawn_entity` accepts service tokens via `authorize_content`
with an explicit owner (player or system, e.g. `world:system`) + `siderealctl content spawn`. The full
trigger chain is proven headlessly by `triggered_destruction_fires_loot_hook_and_spawns_container_e2e`
(real-App: deplete a `Destructible`'s `HealthPool` → `begin/advance_pending_destructions` →
`destroyed` event → `loot_on_destroyed` hook → `spawn_entity` intent → applier births
`container.goods`, which hydrates with scannable cargo and attaches `Replicate`; the wreck despawns).
Known follow-up: these hand-built intents will port onto the typed `#[script_intent]` registry from DR-0051 WS0.

**WS5 — Quest/mission v1.** Event allowlist growth (`player_session_start/end`,
`system_enter`, `entity_spawned/despawned`), `schedule_after`, quest template registry
(`data/scripts/quests/` + typed loader + draft/publish like every other registry),
`ScriptState`-backed instances, dialogue presentation payloads per the scripting reference
UI contract. Dashboard quest editor comes after the registry exists.

**WS6 — Editor creation flows.** Create-new ship/module/planet from the dashboard; texture
and sound upload through the existing `POST /admin/assets/by-id/{id}/payload` model plus a
create-asset route. Cheap once WS1 lands.

**WS7 — Multi-shard authoring hygiene.** Region-routed admin spawn via the
`ShardRouteTable` (DR-0040), shard-aware debug BRP for the explorer. Authoring reads and
catalog convergence are already shard-correct (DR-0049); this closes the two remaining
single-shard assumptions.

## 7. Verification

2026-09-05 closure order for the full dashboard authoring suite:

1. Complete generic package instantiation: lower authored visual/name fields and
   scope-keyed hook bindings through shared engine mechanisms; load published package
   hook sources into the runtime. Prove Foundry publish → placed entity → combat hook
   → validated intent → persisted result → restart, using the package path itself.
2. Add package revision propagation to existing instances, preserving evolved values
   and reporting which revision the owning shard actually applied. Extend lifecycle
   emission only with explicit event timing and restart/hydration semantics.
3. Design and implement typed, UUID-addressed live authoring commands applied by the
   owning shard, with conflict/idempotency handling and persistence acknowledgement.
   This requires an explicit extension of DR-0049's current per-instance authoring
   contract; do not implement it as dashboard BRP or direct graph writes.
4. Complete DR-0054 U6: retain the applied merge base, expose drift and an application
   preview, and reconcile baseline changes without replacing evolved gameplay state.
   Keep baseline publication and live application outcomes separately visible.

The tests below remain workstream acceptance targets; historical coverage of the
Lua bundle path is not proof that Foundry packages execute their hooks.

- WS0: unit tests for decode-failure logging, empty-table normalization, authoring
  round-trip gate; live test: shoot a starter-field asteroid → cracks → staged detach →
  visible fragments without restart; restart → state consistent.
- WS1: dashboard builds with `LuaSubsetParser` removed; editors render error panels (not
  route failures) against a deliberately broken definition; CI guard updated.
- WS2: agent-token request publishes a module edit and triggers reload with no browser
  session; audit log shows agent identity.
- WS3: edit a world-init render-layer value → publish → existing world + connected client
  update without restart.
- WS4: scripted `destroyed` hook spawns a container bundle; entity replicates same-tick,
  persists, despawns via intent; budget/validation rejections logged. Covered headlessly by
  `triggered_destruction_fires_loot_hook_and_spawns_container_e2e` (the whole hook → intent →
  birth → hydrate → replicate chain through the real production systems).
- All: fmt, clippy `-D warnings`, workspace check, wasm client build, docs-check.
