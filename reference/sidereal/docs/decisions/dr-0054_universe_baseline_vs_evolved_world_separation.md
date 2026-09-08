# DR-0054: Universe Baseline vs. Evolved World Separation

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-09-05
Owners: content authoring + replication runtime + persistence + gateway + engine architecture
Scope: Separate the authored *initial universe* (a disk content baseline, durable source of truth) from the *evolved runtime world* (the resettable graph DB), with a versioned seed/apply+reconcile pipeline, deterministic identity for authored and procedurally-generated content, and engine-generic provenance enabling drift detection and 3-way reconciliation.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/decisions/dr-0025_runtime_script_catalog_authority.md
- docs/features/active/world_bootstrap_fixed_entity_identity_contract.md
- docs/features/proposed/universe_baseline_seeding_proposal.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/features/proposed/galaxy_world_structure_proposal.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md

## 0. Implementation Status

- 2026-08-31: The disk-backed universe baseline, deterministic placement/field member
  identities, baseline provenance tags, first seed, and revision-driven scoped
  blow-away/reseed loop (Ui) are implemented. Firmament edits placement component
  overrides, zones, field generators, and boundary falloff. Starter planets and the
  starter asteroid field are baseline-owned.
- 2026-08-31: U6's production three-way reconcile, full
  `authored_baseline_source`/canonical-hash provenance, and spatial cluster-key refinement
  remain deferred while authoring stabilizes. `world_init.lua` still owns engine-level
  render/rule and tactical defaults plus the pirate patrol. Native/WASM impact: both
  targets consume the same baseline-derived replication; authoritative seed/reconcile
  remains server-side.

## DR-0054: Universe Baseline vs. Evolved World Separation

- Status: Active
- Date: 2026-06-17
- Owners: content authoring + replication runtime + persistence + gateway + engine architecture

## Context at Decision Time

- World seeding today runs a single hand-written `data/scripts/world/world_init.lua` once: `apply_scripted_world_init_once` (`simulation_entities.rs:1008`) → transactional persist (`persistence.rs:512`) → an opaque one-shot marker row in `script_world_init_state` keyed by `init_key`. Reset (`admin.rs` `reset_persisted_runtime_world`) clears the graph + markers and re-applies on next boot; `pg-reset` destroys the volume entirely.
- Fixed-identity GUIDs (UUIDv5 from stable logical keys, `world_bootstrap_fixed_entity_identity_contract`) already make authored static content idempotent across re-seeds. But procedurally-generated members (e.g. asteroid fields) use **random v4** GUIDs and track damage field-wide, so an individual generated entity has no stable identity across re-materialization or reset. Persistence is uniform component-level `persist=true`; there is **no static/dynamic or authored/evolved classification**.
- A giant hand-written `world_init.lua` is acceptable as a bootstrap hack but is the wrong long-term source of truth for a large authored universe: it is not diffable or dashboard-authorable at scale, it mixes data (where things are) with code (how to generate them), its one-shot `init_key` marker is opaque, and it gives no way to distinguish *what was authored* from *how the world evolved*.
- The graph DB represents the **evolved** runtime world and must be resettable; the **authored initial universe** must therefore live elsewhere, durably (surviving wipes), per the disk-as-source-of-truth model already decided for content packages (DR-0053). This DR extends that model from per-entity packages to the whole universe layout.

## Decision

- **Two layers, explicitly separated.** The **authored universe baseline** is a disk content package (extends DR-0053) and is the durable source of truth for the *initial* universe; the **graph DB is the evolved world** derived from it and is disposable/reset-able. Baseline survives wipes; the DB does not need to.
- **The baseline is a recipe + curated placements, not a world dump.** It stores: systems/regions, explicit authored placements (referencing entity `blueprint_id` + position + overrides), deterministic procedural generator specs, spawn tables/population rules, shader/backdrop assignments, and a global universe seed/revision. It does **not** store every procedurally-generated asteroid, wreck, NPC, or loot item as an individual record unless that object is hand-authored and important.
- **Three content tiers.** (1) Explicit authored landmarks (stations, planets, quest objects, named wrecks) → fixed-identity GUIDs. (2) Deterministic procedural specs (asteroid belts, debris fields, background resources, random cargo) → generator records. (3) Runtime/evolved state (destroyed asteroids, looted containers, moved ships, player-built things) → graph DB only.
- **Deterministic identity for both authored and generated content — keyed stably, never by global array index.** A placement mints `uuid_v5(namespace, "placement:<placement_id>")`; a generator member mints `uuid_v5(namespace, "gen:<generator_id>:<cell_key>:<local_member_key>")` — a **stable spatial/sample key**, **not** a global sequential `index`. A global index is fragile: changing a generator's density, bounds, ordering, or algorithm would shift every later index and churn identity, making reconciliation noisy. The member key must be stable under local parameter changes (a member in a given cell keeps its identity even as members are added elsewhere or density changes). This replaces today's random v4 for generated entities, and is what makes on-demand materialization idempotent and lets per-member evolved deltas survive reset and lazy unload/reload. **Defining the stable member key is a pre-WS7 implementation requirement.**
- **Engine-generic provenance on seeded entities — persisted, server-side only.** Seeded entities carry an engine-generic `authored_baseline_source` component: `baseline_id`, `baseline_revision`, `source_key` (placement id or generator member key), `blueprint_id`, and `baseline_content_hash` — the **canonical hash of the baseline-derived state that produced this entity** (the per-entity merge base, §below). It is **persisted and server-side only — never normally replicated to clients**; debug/dashboard read it through admin APIs. This lets the system know which DB entities came from the baseline, diff live state against the authored source, and reconcile baseline updates without clobbering evolved entities. (Same conceptual family as registry-source/live-resync, applied to world placement.)
- **The merge base must be materially available, not just named.** A 3-way reconcile needs the *content* of the old applied baseline, not only its revision number/hash — disk files may have been overwritten by the newer revision. Provide it one of two ways (decide at WS7): (a) **content-addressed snapshots** of each applied baseline revision (the gateway already content-addresses packages), or (b) the **per-entity `baseline_content_hash`** stored in provenance, sufficient to detect drift of each entity against the old base without keeping whole snapshots. Revision + a single global hash alone is **not** enough.
- **Apply pipeline replaces giant-Lua-once.** Seeding compiles the selected baseline → graph records + generator records → persists transactionally → records the **applied `baseline_id` + revision + content hash** (replacing the opaque `init_key` marker). The apply keeps the existing apply-on-empty / reset-and-reapply shape; only the *source* changes from a Lua script to a validated, compiled baseline package. Idempotent via fixed identity.
- **Reconciliation is a 3-way merge over a canonical hash.** Updating a live world to a newer baseline is a merge of **old applied baseline (merge base) · new baseline · live state**, made tractable by the per-entity `baseline_content_hash` and provenance: per placement, decide authored-changed (new baseline hash vs stored `baseline_content_hash`) vs evolved (canonical hash of live state vs the same base). Conflict defaults: **dev = baseline wins; production = keep live + flag for manual resolution**. "Evolved" is decided by a **canonical-hash comparison** at reconcile time (a sticky dirty bit may pre-filter but is not authoritative). **The canonical hash is a pre-WS7 definition:** it covers only authoring-significant component state and **excludes** provenance, timestamps, runtime-only/non-persisted fields, shard/visibility bookkeeping, and any non-authoring noise — otherwise reconcile reports false drift constantly.
- **Static content is derivable from the baseline; persistence may become sparse.** V1 persists materialized authored entities fully (simpler). Sparse/copy-on-write persistence — the DB storing only deltas from the baseline, so a pristine authored entity needs no row — is a later optimization that the provenance + deterministic-identity model **enables and must not design out**.
- **Lua stays for behavior and validated generators, not universe storage.** `world_init.lua` is reframed as a *generator runtime* (its deterministic seeded layout logic is reused, driven by generator records) — it stops being the authoring surface. Hooks (`on_create`/`on_destroyed`/quest triggers/loot) remain Lua per the entity authoring model.
- **Engine/content boundary (DR-0045) and distribution (DR-0040).** The baseline format/schema, the apply+reconcile pipeline, the provenance component, the deterministic-identity derivation, and the generator-materialization API are **engine**; the universe packages, system names, generator kinds, and spawn-table content are **content**. Multi-shard: the baseline is global (every shard reads it), evolved deltas are region-owned, and materialization is shard-aware (a shard materializes a region when it takes ownership).

## Alternatives considered

- **Keep the giant `world_init.lua` as source of truth:** rejected — does not scale, is not diffable/dashboard-authorable, mixes data and code, and the one-shot `init_key` marker is opaque with no authored-vs-evolved distinction.
- **DB as the baseline source of truth:** rejected — the DB must be resettable and is wiped (`pg-reset`); the authored universe would be lost. Disk-as-truth (DR-0053) is the established model.
- **Full reset only, no reconcile:** insufficient long-term — a live production universe could never receive authored updates without nuking player progress. Reset-to-baseline is the dev path; 3-way reconcile is the production path.
- **Random generator identity + full materialization:** rejected — random v4 members cannot carry per-member evolved deltas across re-materialization or reset, and seeding millions of entities as graph rows does not scale. Deterministic identity + on-demand materialization is the scalable model.
- **Provenance as a space-specific component:** rejected — an engine-generic `authored_baseline_source` keeps the deletion test green (DR-0045); the space vocabulary lives in the baseline content.
- **Seed every procedural entity as a graph record:** rejected — the baseline is a recipe + curated placements, not a database dump.

## Consequences

- Positive:
  - The authored universe survives database wipes (disk-durable), is diffable/dashboard-authorable, and is cleanly separated from evolved runtime state.
  - Deterministic generator identity makes a huge universe cheap to seed (recipe, not dump) and lets evolved deltas attach to stable ids.
  - Provenance enables drift detection and safe production reconciliation rather than blind reset.
  - Reuses fixed-identity GUIDs, the existing apply-on-empty/reset shape, and the disk-as-truth substrate (DR-0053); `world_init.lua`'s seeded generation logic is reused, not thrown away.
- Negative:
  - Reconciliation into a drifted live world is a genuine 3-way merge with a conflict UI — real engineering, deliberately phased after dev reset-to-baseline.
  - Generated entities must move from random v4 to deterministic GUIDs — a concrete change to current asteroid-field generation and a one-time identity migration for existing worlds.
  - Two persistence regimes may coexist (full materialization now, sparse/copy-on-write later); the provenance model must be designed to support both.
  - The provenance component touches persistence registration and must be sequenced.

## Follow-up

- **Three pre-WS7 implementation requirements (settle before WS7 starts):**
  1. **Stable generator member key** — replace any global array `index` with a stable spatial/sample key (`gen:<generator_id>:<cell_key>:<local_member_key>`) that does not churn when density/bounds/ordering/algorithm change.
  2. **Materialize the merge base** — content-addressed snapshots of applied baseline revisions, or the per-entity `baseline_content_hash` in provenance; revision + a single global hash is insufficient for a reliable 3-way merge.
  3. **Canonical baseline/live hashing rules** — a normalization that hashes only authoring-significant component state and excludes provenance, timestamps, runtime-only fields, and shard/visibility bookkeeping, so reconcile does not report false drift.
- Lock `authored_baseline_source` visibility: persisted, server-side only, not client-replicated; admin/dashboard read via admin APIs.
- Write the feature proposal (`docs/features/proposed/universe_baseline_seeding_proposal.md`) — package schema, record schemas, seed lifecycle, materialization, and the Seed Manager frontend.
- Add the workstream to the content-authoring composition plan (WS7), sequenced after WS5 (placements).
- Refine asteroid generator `cluster_key` to a world-space spatial/sample function before
  U6 so local boundary/density edits do not churn unrelated member identity. Current
  member GUIDs are deterministic and stable across `layout_seed` rerolls.
- Define the reconcile conflict-policy detail and the seed-vs-live diff surface; ship drift *status* before the visual diff.
- Decide provenance replication/visibility (default: persisted, server-side, not client-replicated) and copy-on-write persistence timing (later).

## References

- `docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md` — disk-as-truth for content packages (this extends it to the universe).
- `docs/decisions/dr-0025_runtime_script_catalog_authority.md` — the seed-vs-DB authority lineage.
- `docs/features/active/world_bootstrap_fixed_entity_identity_contract.md` — fixed-identity GUID derivation.
- `docs/features/proposed/galaxy_world_structure_proposal.md` — solar-system/coordinate model the baseline populates.
- `docs/features/proposed/entity_authoring_system_proposal.md` — blueprints, placements, and the override schema baselines reference (§3.6).
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md` — shard ownership; baseline-global vs delta-region-owned.
- `docs/decisions/dr-0045_engine_content_separation_achieved.md` — engine/content boundary.
- Code: `bins/sidereal-replication/src/replication/simulation_entities.rs` (`apply_scripted_world_init_once`), `.../persistence.rs` (`apply_scripted_world_init_blocking`), `.../admin.rs` (`reset_persisted_runtime_world`), `crates/engine-core/src/fixed_entity_guid.rs`, `data/scripts/world/world_init.lua`, `data/scripts/bundles/starter/asteroid_field.lua` (seeded generation).

2026-09-05 update: the revision-driven deletion/reseed loop is superseded by a
pinned initial projection, per-entity atomic birth markers, retained typed merge
bases and explicit preview/apply reconciliation. Saving does not activate a new live
target. Evolved/conflicting/consumed state is preserved. Worlds without retained
history are reported and preserved, never backfilled or reset automatically.
See [the implemented runtime contract](../features/active/dashboard_game_authoring_runtime_contract.md).
