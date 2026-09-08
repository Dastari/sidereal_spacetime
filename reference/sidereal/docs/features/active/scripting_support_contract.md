# Scripting Support Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-09-05
Owners: feature owners
Scope: Scripting Support Contract.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/reference/scripting_support_reference.md
- docs/features/proposed/gameplay_scripting_runtime_proposal.md
- docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md

## 0. Implementation Status

2026-06-15 forward-design note:
- A committed forward design now exists for expanding scripting into a full gameplay authoring runtime (lifecycle/proximity/interaction/combat/quest/dialogue hooks, read-only world + spatial/range queries, entity-identity access, runtime spawn, quest + dialogue + inventory + map-marker authoring, and an introspectable API schema for dashboard linting): `docs/features/proposed/gameplay_scripting_runtime_proposal.md` and `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md` (DR-0051, Proposed).
- This contract intentionally remains scoped to current behavior; it is updated (or the proposal is promoted to active) when implementation begins (proposal WS1), per the documentation lifecycle rule.
- Flight stays Rust-owned (IFCS is not moving to Lua, reaffirming DR-0034); Lua flight control is the already-live `set_navigation_target` ("GoHere") goal intent that routes through IFCS.

2026-06-04 documentation cleanup:
- This file is the concise source-of-truth contract for current scripting behavior.
- The original long-form `scripting_support.md` content was preserved as `docs/features/reference/scripting_support_reference.md` so future quest/dialogue/economy/modding ideas remain available and are not consolidated away.
- Native impact: no runtime behavior changed. WASM impact: no client authority or transport behavior changed.

Current implemented baseline:
1. Lua content is loaded, validated, and applied server-side; scripts do not gain client authority.
2. Runtime script catalogs are authoritative once loaded by gateway/replication paths.
3. Lua-authored registries define asset, audio, shader, entity, planet, ship, module, asteroid, and related content records consumed by runtime systems and dashboard tooling.
4. Script-authored graph records are validated before persistence/hydration and must preserve the canonical component schema.
5. Broad quest/dialogue/economy/modding APIs remain proposed future work; keep those ideas in the reference document until implementation begins.

## 1. Contract

2026-09-05 authoring validation update:
- Entity-package dry-run validation and publication reject a supplied `hooks.lua`
  that fails sandboxed module loading or does not return scope-to-handler tables,
  including when the blueprint has no hook bindings. Handler enumeration for editor
  suggestions may still degrade to an empty list; publish must retain the load error.
- Empty valid modules and valid functions awaiting a binding remain publishable.
  This gate loads the module; it does not execute callback bodies or prove that their
  requested gameplay actions are supported.
- Foundry package hook storage/validation is implemented, but package-to-runtime
  handler loading and binding are still missing. The existing runtime executes
  catalog `ai/` handlers bound through `ScriptState`; these are distinct paths today.
- Native/WASM impact: validation runs on the gateway before the durable disk commit;
  no client protocol, prediction, or runtime authority changes.

Scripting is a content-authoring and high-level intent layer. Rust systems remain responsible for authority, deterministic simulation, validation, persistence encoding, replication, and side effects.

Scripts may author:
- content registries,
- bootstrap/world-init graph records,
- asset/audio/shader metadata,
- bundle definitions,
- validated high-level mutation intents where Rust handlers exist.

Scripts must not:
- authoritatively mutate client runtime state,
- bypass server validation,
- introduce ad-hoc component schemas outside the generated registry path,
- write direct persistence records without canonical validation.

## 2. Future Work Parking

Future scripting mechanics, including quests, dialogue, economy, mod security, custom per-entity script state, and broader mutation APIs, remain intentionally preserved in `docs/features/reference/scripting_support_reference.md`. The committed forward design and its engine/content placement, IFCS evaluation, and introspectable-API-schema plan are captured in `docs/features/proposed/gameplay_scripting_runtime_proposal.md` and `docs/decisions/dr-0051_gameplay_authoring_scripting_runtime.md`; this section graduates into the contract proper when implementation begins.

2026-09-05 implementation update: published entity-package callbacks now execute
through the actual package dispatcher. Valid code reloads retain queued actions,
schedules and ECS state; invalid replacements retain the last working VM. Authored
creation/spawn completion flags survive hydration, and queued destruction/despawn
callbacks retain removed targets' read-only snapshots. These callbacks are not a
durable exactly-once event outbox. See
[the authoring runtime contract](dashboard_game_authoring_runtime_contract.md).
