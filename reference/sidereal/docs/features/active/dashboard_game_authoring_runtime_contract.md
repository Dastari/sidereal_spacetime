# Dashboard Game Authoring Runtime Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-09-05
Owners: gateway + replication + persistence + dashboard
Scope: Published package code, baseline reconciliation, and durable live instance edits.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md
- docs/features/active/scripting_support_contract.md
- docs/plans/active/dashboard_authoring_completion_plan_2026-09-05.md

## 0. Implementation Status

2026-09-05: The shared package projection, package-contained Lua dispatch, live code
reload, retained per-entity authoring base, owner-shard live edit queue, baseline
compiler/preview/application, and dashboard navigation/capture controls are implemented.
Verification is tracked in the completion plan. The tracked development services have
been rebuilt and restarted; readiness and unauthenticated route guards passed. The
initial activation preserved the old world. The subsequently authorized reset and
authenticated verification are recorded below; visual gameplay and multishard
acceptance remain open.
Native and WASM clients consume the existing authoritative component replication.
No client Lua VM or new client mutation protocol is introduced.

## 1. Three distinct actions

- **Save definition:** Foundry publishes the actual entity package, including
  `hooks.lua`. The server spawn dispatcher resolves these packages before Lua bundles.
  Display name, labels, visual shorthand and hook bindings become typed components.
  Published callbacks reload on shards; non-baseline package instances reconcile
  component changes against their retained base.
- **Save baseline:** Firmament validates and saves the complete original authoring
  document. Package references, published builder scripts, planet definitions,
  component payloads, and asset references must resolve. This refreshes the derived
  preview index; it does not change the active live application target.
- **Apply live:** Either submit an explicit component edit for one UUID, or preview
  a saved baseline and apply its exact revision and compiled projection hash.
  Baseline application checks dependencies again; a changed projection requires a
  new preview. Each shard reports its own application/persistence outcome.

First-world construction pins an initial baseline projection before creating any
entities. Subsequent starts reuse that target and per-entity creation markers, so
restarting after a save does not implicitly apply new placements. Atomic creation
markers survive consumption and deletion. A baseline generated under the former
group-marker scheme has no safe retained merge history: the runtime preserves that
world and reports the limitation. It never invents an old authored base from live
values. An explicitly requested development world reset establishes fresh history.

## 2. Ownership, merge and durability

`AuthoredEntitySource` is a persisted, non-replicated engine component. It retains
package/baseline/placement IDs and revisions, canonical authored component JSON,
placement overrides, the proposed-source hash, unresolved field conflicts, tags,
and creation/spawn completion flags. Canonicalization uses the real reflected Rust
types before storing a merge base, preserving f64 coordinates while accounting for
presentation f32 fields. Arrays merge atomically; objects merge by key; absence and
JSON null differ. An unchanged authored value preserves the evolved value. When both
author and runtime changed a field differently, the runtime value and old base stay
and the conflict is reported. Resolving the live value and reapplying retries that
comparison. Validation finishes for the entity's whole merged change before mutation.

Missing placements create only once. Removing an unchanged placement removes its
entity; an evolved entity is retained with a conflict. Runtime-created entities and
procedural field consumption state are not cleared. Field compilation retains the
recipe root; generated members remain owned by their existing runtime generator.
Unsupported generator shapes/member-blueprint substitutions fail validation explicitly.

Live component edits carry an operation UUID, target UUID, and expected/proposed
values for 1–32 existing allowlisted components. Identity, owner, hierarchy and motion
are not exposed in this generic live-edit lane. Health bounds are validated; script
bindings and interval policy must be edited through authored code/definitions.
The gateway resolves the persisted owning shard. The shard rechecks ownership,
handoff freeze/ghost state, current values and typed payloads at a fixed-step boundary.
A stale comparison changes nothing. `AuthoringOperationState` persists the accepted
request with the entity; a retry of that request does not reapply stale values.

The SQL operation queue, baseline projection/target caches, and delivery receipts are
control-plane metadata. Gameplay values are authoritative only in owner ECS and its
canonical graph snapshots. An `applied` receipt precedes persistence; only an
acknowledged canonical persistence-service write permits `durable`. Persistence
failures retain/retry the work. Baseline results also include per-entity conflicts,
errors and deferrals; `durable` does not mean those conflicts were overwritten.

The persistence writer atomically claims monotonically increasing per-entity write
versions alongside graph updates. `graph_entity_write_versions` contains only graph
name, UUID, ordering tick and deletion status, never a parallel gameplay state store.
Hydration and handoff advance the receiving shard’s monotonic write clock past the
durable high-water mark, including when its wall clock is slower. Equal/older writes
are idempotent no-ops. Deletion and its retained record commit in
one transaction; delayed snapshots cannot resurrect that UUID even with a later tick.
Re-creation requires a new UUID. Dropping the graph clears its ordering/deletion
metadata. An explicit world reset also cancels pending authoring commands and clears
active baseline application targets/receipts while retaining authored content.

DR-0040 answers:

1. The entity's owning shard is the only runtime writer. Positionless baseline-global
   records use the lowest configured shard ID; spatial placements/zones use existing
   region ownership rules.
2. Source metadata and operation receipts travel in normal persisted handoff snapshots.
   Frozen entities and ghosts reject/defer edits; a rejected instance command requires
   refreshing the owner and submitting a new operation. Handoff is not a deletion and
   must not invoke permanent graph removal.
3. Authoring metadata is server-only. Gameplay changes use existing component
   replication/AOI/redaction lanes. Admin receipts expose UUIDs and shard IDs only.

## 3. Code and lifecycle

The runtime loads `hooks.lua` from the published package index into its sandbox and
maps scoped bindings to `package:<id>` handlers. It does not substitute an independent
bundle that happens to have the same name. Hot reload preserves ECS script data,
pending intents and callback scheduling. A failed replacement retains the last
working VM and is retried when a catalog revision changes; a bad startup catalog can
recover on a later valid publication. Foundry shows loaded package revisions,
failed-reload state and report timestamps for each shard.

`entity.on_create` and `entity.on_spawn` run in that order for a new authored entity.
Persisted completion flags prevent rerunning completed callbacks on hydration or
handoff. Completion is marked after queued actions pass through the fixed-step
appliers. An interrupted callback/checkpoint can retry: handlers receive a stable
`event_id` and should make external or multi-entity side effects idempotent. This is
not an exactly-once transactional event-outbox guarantee.

`entity.on_tick` uses the existing scheduler. `entity.on_destroy` maps to the existing
`destroyed` combat event. `entity.on_despawn` fires for explicit script removal,
baseline removal and completed destruction, not unloading/handoff. Removed entities'
read-only snapshots remain available while their queued callbacks are pending;
permitted actions can affect surviving targets. In-memory gameplay events are not a
durable replay log.

## 4. Dashboard and API boundaries

New mutations share the MFA-admin/scoped-service-token authorization guard. Baseline
and component authoring require `scripts:write`; results and provenance reads require
`scripts:read`. Browser proxies retain shared CSRF and exact trusted-origin checks.
These authoring controls use no direct graph or BRP mutation. Existing diagnostic
surfaces are not a substitute for the operation/receipt workflow.

| Gateway endpoint under `/admin/dashboard` | Purpose |
| --- | --- |
| `POST /entities/{uuid}/live-edits` | Queue expected/proposed component changes |
| `GET /authoring-operations/{uuid}` | Read application/persistence receipt |
| `POST /universes/{id}/preview-live` | Compile saved source/dependencies and compare persisted state |
| `POST /universes/{id}/apply-live` | Activate the reviewed revision and projection hash |
| `GET /universes/{id}/application` | Read per-shard baseline outcomes |
| `POST /entities/{uuid}/capture-baseline` | Return a selected-value baseline draft, without saving |
| `GET /entity-packages/{id}/instances` | Link instances, provenance and shard code delivery |
| `GET /universes/{id}/placements/{id}/instance` | Resolve the canonical placement UUID |

Foundry links definitions to instances and placements. Firmament accepts validated
baseline/placement selection in its URL and links placements to their definition and
live instance. `/entities/{uuid}` owns its initial read and exposes the live editor.
Capture reads persisted values into a reviewable draft; saving that draft and applying
it to the world are separate actions. Failed saves, revision conflicts, queued edits,
applied-but-not-durable edits and per-shard results remain visibly distinct.


2026-09-05 reset isolation: account/control-plane SQL tables must remain in `public`.
Graph reset checks AGE's label catalog and refuses to drop a schema containing ordinary
SQL relations. Graph deletion and write-version cleanup are transactional. The local
database default search path is `public`, avoiding `$user` resolution into the graph.


2026-09-05 authorized reset verification: Maw now has fresh per-entity history,
authenticated preview is unblocked, and shard application reports durable with no
issues. A live instance edit was acknowledged, survived replication restart and was
restored through the same command lane. Empty reconciliation batches complete without
a wire write; single-shard baselines include negative-coordinate placements whenever
region filtering is disabled. See the completion plan §5 for recovery and test evidence.

2026-09-06 expected-value correction: live operations decode expected component
payloads through the registered component schema and serialize them through the
same typed JSON path as the current ECS snapshot before comparing. Browser JSON
`2` and a typed `2.0` no longer create false conflicts. This is schema-aware;
there is no blanket rounding, f32 conversion or integer-to-f64 conversion. Tests
retain sub-metre f64 precision at large coordinates and distinguish adjacent u64
values up to `u64::MAX`. All expectations still pass before any component is
inserted, and stale requests remain conflicts.


2026-09-07 aggregate authoring: constructed ship refits use the dedicated
`hull-editor` command path described in the ship construction contract. The
`hull_authoring_state` payload is not added to the generic live-component allowlist;
its owning-shard handler validates/recompiles the entire aggregate before changing
ECS. Root/fitting/crew snapshots and deletion records commit together through
`PersistenceServiceRequest::GraphMutation` (internal protocol v3). An in-memory
`AuthoringPersistenceBarrier` holds ordinary snapshots and root handoff until the
canonical persistence acknowledgement, preventing restart from hydrating half a
refit. The barrier is runtime-only; durable source and operation state transfer
through normal graph hydration. Shared blueprint publishing remains a separate
explicit operation.

2026-09-07 lighting authoring: `stellar_light_source` is an explicit admin live-edit/capture kind, validated for normalized color/elevation, finite nonnegative intensity and ordered radii. Updates still use the owning shard, typed expected-value checks and durable receipts; public visibility and handoff behavior remain the existing stellar component contract. Door runtime state remains excluded from generic live component edits.
