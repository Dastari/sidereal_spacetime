# Hierarchy Replication Cost Audit - 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Hierarchy Replication Cost Audit - 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/architecture/sidereal_design_document.md`

## 0. Status Notes

2026-05-22 status note:

1. No evidence was found that Bevy hierarchy components (`ChildOf` / `Children`) are replicated per tick.
2. The authoritative cross-runtime hierarchy contract is UUID-based `MountedOn` / `ParentGuid`.
3. `MountedOn` / `ParentGuid` are replicated gameplay components, so they are sent on spawn and when changed. No production system was found that rewrites these components every tick.
4. No Lightyear fork follow-up is required for hierarchy cost at this stage.

## 1. Findings

Replication server hierarchy rebuild is explicitly disabled:

- `bins/sidereal-replication/src/main.rs` inserts `HierarchyRebuildEnabled(false)` before adding `SiderealGamePlugin`.
- The comment there states that replication must not rebuild Bevy `ChildOf` / `Children` because those relationships can leak into network replication.

Hydration and runtime code use UUID relationships instead of Bevy entity references:

- `bins/sidereal-replication/src/replication/simulation_entities.rs` documents that server-side hierarchy is tracked via `MountedOn`, not Bevy `ChildOf` / `Children`.
- `crates/sidereal-game/src/hierarchy.rs` reconstructs local Bevy hierarchy from `ParentGuid` in runtimes that enable hierarchy rebuild.
- `MountedOn` carries `parent_entity_id: Uuid` plus a hardpoint id.
- `ParentGuid` carries the UUID parent reference for local hierarchy reconstruction.

Protocol registration does not register Bevy hierarchy components directly:

- `crates/sidereal-net/src/lightyear_protocol/registration.rs` manually registers Avian motion components and then registers `sidereal_component` annotated gameplay components.
- Repository search found no `register_component::<ChildOf>` or `register_component::<Children>` call.
- `MountedOn` and `ParentGuid` are public replicated gameplay components, not Bevy `Entity` relationship components.

Mutation search did not find a production per-tick writer for `MountedOn` or `ParentGuid`:

- Production references use `Changed<MountedOn>` / `Changed<ParentGuid>` to update combat, visibility, and persistence indexes.
- Test-only code mutates `MountedOn` for coverage of changed/removed relationship behavior.

## 2. Risk

The remaining risk is future churn, not current cost. If a future gameplay system rewrites `MountedOn` or `ParentGuid` every fixed tick, Lightyear will treat those components as changed and replicate them. That should be rejected in code review; mount relationship mutation must remain event-driven.

## 3. Conclusion

Phase 1.1 hierarchy replication cost audit passes. Sidereal is not relying on per-tick Bevy hierarchy replication, and the current UUID-based relationship components should replicate on spawn/change only.
