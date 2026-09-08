# Dashboard Game Authoring Audit

Status: Reference
Lifecycle: historical-report
Category: report
Last updated: 2026-09-05
Owners: dashboard + gateway + scripting + replication + content
Scope: Code-backed assessment of authored content, live persistent world editing, script and lifecycle authoring, and the missing connections between them.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/active/unified_content_authoring_pipeline_plan_2026-06-12.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md

## 1. Assessment

2026-09-05: Sidereal has substantial dashboard authoring UI and durable publishing
infrastructure. It does not yet provide a complete game authoring suite in which a
designer can compose an entity, wire its behavior, instantiate it, change the running
instance, and independently update its original authored state with verified persistence.
The principal gaps are in runtime integration and application semantics.

This audit inspected the current working tree, including pre-existing uncommitted work.
`scripts/siderealctl status` reported the `full-stack-debug` persistence, replication,
gateway, and dashboard processes running. This is process evidence, not an authenticated
browser publish or a gameplay verification. No world reset, content publication, or
service restart was performed for this audit.

## 2. Capability map

| Surface | What is connected in code | Remaining limitation |
|---|---|---|
| Foundry | Component forms, sprite/shader references, hook code and wiring, validation, revision-aware disk package publication and derived index | Generic instantiation does not consume separate visual or hook fields; package hooks do not enter runtime dispatch |
| Script Editor | Gateway draft/publish, durable disk source, derived SQL catalog, runtime catalog reload | AI handlers must use the runtime's existing module/binding format; world-init is once-only; this is not package hook execution |
| Shipyard / Genesis | Structured registry definitions publish as disk packages and feed runtime registry projections | Live refresh is family-specific, not arbitrary live component editing |
| Registry live refresh | Planet synchronization, module/ship presentation refresh, asteroid ambient/profile refresh | General gameplay-stat refresh is not the default; evolved values must be preserved |
| Shader / asset / sound tools | Asset authoring and delivery infrastructure; Shader Workshop can publish baseline-owned backdrop parameters | Baseline parameter publication still depends on the baseline application lifecycle; a stored revision is not proof of live application |
| Firmament | Disk baseline placements, overrides, zones, generators, backgrounds and supporting world records | Baseline changes are applied at startup through scoped replacement/reseed; production three-way reconcile is deferred |
| Live entity editor routes | Persisted entity classification, components, provenance/context, definition navigation | Ship/planet instance pages are read-only placeholders; component/hierarchy/registry-link patch capabilities are false |
| Runtime script intents | Navigation, stop, script state, allowlisted bundle spawn/despawn, notifications | General quests, dialogue, economy, scheduling and lifecycle overrides are not supplied by merely editing Lua |
| Rust engine/game code | Normal source/build/restart workflow | No dashboard Rust compilation/deployment workflow; Lua customization cannot replace unsupported engine capabilities |

## 3. Findings and evidence

### A1. Foundry package hooks are stored but not connected to runtime handlers

`dashboard/src/features/foundry/publish-serializer.ts` sends structured
`entity.hooks` plus opaque `hooks_lua`. Gateway
`content_packages::publish_entity_package` validates these, writes the files atomically,
and refreshes `content_package_index`.

The consumer path diverges:

- `bins/sidereal-replication/src/replication/runtime_scripting.rs`:
  `discover_ai_script_paths` selects only `ai/` catalog paths; `ScriptRuntime::from_catalog`
  expects module-level `on_tick` / `on_<event>` functions and a handler name.
- `parse_event_handler_config` reads `ScriptState.data.event_hooks[event]`.
- `crates/engine-content/src/translate.rs::blueprint_to_graph_records` merges component
  payloads and placement components; it does not lower `EntityBlueprint.hooks`.
- `simulation_entities.rs::apply_universe_baseline_seed` retains the loaded blueprint,
  discarding the package's separate hook source before passing templates to the seed core.

Consequently, a bound Foundry `destructible.destroyed -> drop_salvage` callback can
validate and publish without executing when its placed entity is destroyed. Existing
combat events and typed hook metadata do not close the module-loading/binding gap.
The Lua-bundle destruction/spawn integration test is evidence for the existing runtime
path, not for this package path.

### A2. Generic blueprint instantiation omits authored presentation fields

The same translator only reads `components`, `labels`, and placement context. It does
not translate `visual`, `display_name`, `tags`, or hook bindings into runtime components.
The Firmament entity-package seed path supplies position, provenance, faction, spawner
configuration, and component overrides, but does not supply the missing visual mapping.

A concrete example is `data/content/entities/container.goods/entity.json`: its cargo
sprite is in `visual.visual_asset_id`. Its separately authored `map_icon` component is
carried through; the separate visual field is not. A successful typed component decode
test cannot detect a field that never became a component record.

This needs one shared lowering contract used by validation, spawn and baseline seeding,
with defined precedence between authored visual shorthand and explicit components.
Do not implement dashboard-side Lua generation to compensate.

### A3. Baseline publish is durable, but applying it replaces seeded state

Gateway `content_packages::publish_universe_baseline` returns a disk revision and hash.
At boot, replication's `apply_universe_baseline_seed` calls
`prepare_universe_reapply_blocking` when the revision changed. The code explicitly
clears the baseline's previously seeded entities and markers before reseeding.

That is a development iteration mechanism, not a live merge preserving mined resources,
destroyed objects, changed inventory or other evolved state. DR-0054 explicitly defers
U6 and the complete per-entity merge-base provenance. Restarting to see a baseline edit
must not be presented as the final persistent live-edit workflow.

### A4. There is no general authoring path for a live entity instance

`dashboard/src/features/entities/EntityInstancePlaceholderPage.tsx` displays context
and component names but has no mutation action. Gateway
`admin_dashboard.rs::entity_edit_context_from_snapshot` returns
`can_patch_components`, `can_patch_hierarchy`, and `can_patch_registry_link` as false.
Its `can_edit_live_instance` classification flag is not evidence of an enabled editor.

The missing capability is an authenticated, typed command routed to the owning shard,
validated against the entity revision and field policy, applied in the authoritative
simulation phase and acknowledged after normal persistence. It cannot be supplied by
writing graph rows beside a live shard or treating debug BRP edits as authored state.
This is an explicit extension to DR-0049's current per-instance contract, requiring the
decision and runtime contract to change with the implementation.

### A5. Publish validation does not establish executable behavior

Before this audit's fix, `extract_hook_handlers` swallowed module-load failures and
returned an empty handler set. With no bindings, `validate_entity_package` then accepted
invalid Lua. A regression using `hooks_lua = "return {"` produced **zero errors**.

Fixed in this change: publish and dry-run validation retain module-load/table-shape
errors even for unbound code; editor autocomplete retains its existing empty-suggestion
fallback. The shared validator runs before the disk commit.

Still open: `admin_dashboard.rs::analyze_script` performs compilation plus a scan for
literal unknown intent names. It is not full semantic checking of `ctx` access or
callback bodies, and package publication does not invoke that complete diagnostic path.
Module validation must not be described as proof that every callback can run.

### A6. Application status and dependency validation are incomplete

Foundry publication reports a package revision/hash and optional `index_pending`.
Baseline publication reports revision/hash. These responses contain no per-shard
applied revision, affected-instance result or persistence acknowledgement.

Baseline validation checks structural relationships and background validity; it does
not load referenced entity packages and compile every resulting placement through the
runtime's typed component decoder. Missing entity-package references can instead be
logged and skipped during seeding (`seed_world_from_baseline` returns unresolved
placements). Validation should identify these before an author publishes an unusable
placement.

### A7. Planning documents overstate some blockers and understate integration gaps

The generated script API schema, typed event/intent registries, schema endpoint,
validation endpoint and anti-drift test already exist. The gap-closure plan still called
WS0 a missing dependency. Likewise, `AuthService::admin_spawn_entity` already supports
service-token actors with required explicit `owner_id`; the missing actor-model note
was stale. Both entries were corrected in this change.

Runtime spawning still addresses bundle IDs: `scripting/bundle_spawn.rs` resolves a
Lua graph-record builder. Editing a Foundry package with the same familiar content
name is not proof that this independent bundle path consumes the edited package.

## 4. Completion sequence

The active implementation order is recorded in the unified content authoring pipeline
plan §7. The concrete acceptance tests should be:

1. **Package to world:** create a new Foundry package with a display name, sprite and
   health/destruction components; place it; verify the displayed name and sprite in
   game. Bind its destruction hook to a permitted persistent script action and verify
   that the package callback actually executes. Restart and verify the result.
2. **Live code publication:** change that package callback and publish while the entity
   exists. Verify the owning shard loads the new revision and the next event executes
   the new code while preserving its existing script/gameplay state. Validate failed
   reload behavior and state transfer during handoff. Add creation/spawn/despawn/tick
   events with explicit once-only versus hydration semantics.
3. **Live persistent edit:** from the instance editor change one allowlisted field;
   verify shard application, replication and persistence acknowledgement. Restart and
   verify it remains. Reject stale revisions and duplicate commands deterministically;
   route or reject commands correctly during region transfer.
4. **Baseline reconciliation:** change the baseline of an already evolved world and
   preview the diff. Apply a nonconflicting authored change while preserving runtime
   damage/depletion/movement; report conflicts instead of silently overwriting them.
   Verify results survive restart and missing dependencies are rejected before publish.
5. **Unified workflow:** navigate definition ↔ baseline placement ↔ live instance using
   provenance. Let the author explicitly save the definition, save the baseline, or
   apply a live edit. Copying selected live values back to a baseline should create a
   reviewable draft. If an action updates both layers, show both outcomes independently.

For the future stateful work, DR-0040 answers must stay explicit: the entity's owning
shard owns runtime state; accepted state transfers through canonical persistence and
handoff while commands are rerouted/rejected during ownership changes; authored package
revisions converge through the control plane, and runtime values reach clients only
through existing authorized replication/redaction lanes. Authoring operation metadata
must not become a second authoritative gameplay store.

## 5. Validation and limits

- Dashboard unit suite: 53 files, 395 tests passed.
- Gateway package dry-run suite: 9 tests passed, including the new negative regression
  and acceptance of valid unbound/absent hooks. The negative regression was observed
  failing before the fix.
- Script API schema/LuaCATS anti-drift suite: 4 tests passed.
- Gateway hook enumeration/insertion suite: 9 tests passed.
- Workspace Clippy with warnings denied and incremental compilation disabled passed;
  workspace check with incremental compilation disabled and workspace formatting passed.
  Dashboard TypeScript checking and lint/authoring guards passed.
  Documentation/skill validation passed.
- The focused test command uses `scripts/siderealctl test-rust`, added so Cargo test
  selectors can run through the project CLI without invoking the broad suite's
  database-mutating durability tests against the running development database.
- No live publish/restart/handoff or database-wipe durability claim is made by this
  audit. Native/WASM runtime code and the transport protocol are unchanged.
