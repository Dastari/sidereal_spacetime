# Universe Baseline Seeding (Authored Baseline → Seed/Apply → Evolved World)

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-17
Owners: content authoring + replication runtime + persistence + gateway + dashboard + engine architecture
Scope: A first-class, disk-authored Universe Baseline content package (systems, placements, generators, spawn tables) that is the durable source of truth for the initial universe, compiled and applied into the resettable graph DB via a versioned seed/apply+reconcile pipeline, with deterministic identity, engine-generic provenance, on-demand procedural materialization, and a two-mode (baseline-authoring / live-world) dashboard.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/features/proposed/galaxy_world_structure_proposal.md
- docs/features/active/world_bootstrap_fixed_entity_identity_contract.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md

## 0. Status & relationship to existing work

Proposed direction, not current behavior. The architectural decision is **DR-0054** (universe baseline vs. evolved world separation); this is its concrete spec. It builds on:

- **DR-0053** — disk content packages are the durable source of truth (the universe baseline is another package *kind*).
- **Entity authoring proposal** — blueprints (`blueprint_id`), the placement/override model (§3.6), and the identity split (`blueprint_id` / `placement_id` / runtime GUID). A universe baseline is, in essence, an authored *collection of placements + generators* over those blueprints.
- **Composition plan WS5** — world-map authoring; this elevates it from "place one blueprint" to "author and apply the whole universe," and adds the Seed Manager. Tracked as plan **WS7**.
- **Galaxy world structure proposal** — the flat f64 coordinate model and solar-system entity model the baseline populates.

No new authority/distribution substrate: it reuses fixed-identity GUIDs, the existing apply-on-empty/reset shape, the graph persistence/hydration path, and the gateway disk-as-truth control plane.

## 1. Problem

A single hand-written `world_init.lua` is fine as a bootstrap hack but is the wrong long-term source of truth for a large authored universe (DR-0054 Context): not diffable or dashboard-authorable at scale, mixes data with code, applied once via an opaque `init_key` marker, and offers no way to separate *what was authored* from *how the world evolved*. The graph DB is the **evolved** world and must be resettable, so the **authored initial universe** must live on disk, durably, and be applied through a deliberate, versioned pipeline.

## 2. The model

```
disk-authored universe baseline   (the recipe + curated placements — durable, diffable, dashboard-authored)
        │  seed / apply (compile → graph + generator records → persist)
        ▼
graph persistence DB              (the evolved world — disposable, resettable)
        │  runtime evolution (mining, combat, loot, movement, player builds)
        ▼
drift                             (live diverges from baseline; reconcile or reset deliberately)
```

Three content tiers (DR-0054):

| Tier | Examples | Identity | Where it lives |
|---|---|---|---|
| **Explicit authored landmarks** | stations, planets, quest objects, named wrecks | fixed-identity GUID from `placement_id` | baseline (placement records) |
| **Deterministic procedural specs** | asteroid belts, debris fields, background resources, random cargo | deterministic GUID from `(generator_id, index)` | baseline (generator records); materialized on demand |
| **Runtime/evolved state** | destroyed asteroids, looted containers, moved ships, player builds | runtime GUID | graph DB only |

The baseline is a **recipe plus curated placements, not a database dump** — it never stores every procedural asteroid/wreck/NPC/loot as an individual record unless that object is hand-authored and important.

## 3. The Universe Baseline package (on disk)

A baseline is a content package (DR-0053 substrate), a sibling *kind* to entity packages, supporting multiple named baselines (`main`, test scenarios, tournament maps):

```
data/content/universes/<baseline_id>/
  manifest.json                     # kind:"universe", baseline_id, schema_version, revision, content hash inputs, region/file index
  universe.json                     # global: universe seed, default backdrop, region list, metadata
  systems/arcturus.json             # a solar system / region: center, radius, SolarSystemVisuals (nebula/backdrop)
  systems/maw.json
  placements/treasure.hidden_cache.cargo.json   # one explicit authored placement
  generators/arcturus.asteroid_belt.outer.json  # one deterministic procedural spec
  spawn_tables/pirate_patrols.json  # population/spawn rules
```

- Text/JSON, content-addressed, gateway-written, disk-durable — identical storage rules to entity packages (DR-0053; disk-write safety = entity authoring proposal §6.4).
- `manifest.json` carries `baseline_id`, `kind: "universe"`, `schema_version`, a monotonic `revision`, and the file/region index; the gateway computes the content hash at publish.
- The package references entity `blueprint_id`s; it never inlines blueprint definitions (those are entity packages).

## 4. Record schemas

### 4.1 Placement (explicit authored landmark)

Reuses the entity authoring override schema (§3.6) verbatim — a placement is `blueprint_id` + position + overrides:

```json
{
  "placement_id": "treasure.hidden_cache.cargo",
  "blueprint_id": "cargo.container",
  "system_id": "arcturus",
  "position": { "x": 184200.0, "y": -53100.0 },
  "overrides": {
    "components": { "quest_trigger": { "quest_id": "quest.hidden_cache", "radius_m": 800.0 } },
    "hooks": { "entity": { "on_create": "seed_relic" }, "destructible": { "on_destroyed": "advance_on_open" } }
  }
}
```

Mints `runtime_guid = uuid_v5(namespace, "placement:treasure.hidden_cache.cargo")`. The `placement_id` is the authored identity; the runtime GUID is derived from it (never hand-authored).

### 4.2 Generator (deterministic procedural spec)

```json
{
  "generator_id": "arcturus.asteroid_belt.outer",
  "kind": "asteroid_belt",
  "seed": 491203,
  "system_id": "arcturus",
  "bounds": { "center": [120000.0, 45000.0], "radius_m": 20000.0 },
  "density": 0.35,
  "blueprints": ["asteroid.rock.small", "asteroid.ore.iron"],
  "materialization": "on_demand"
}
```

- The generator expands **deterministically** (seeded) into members; each member mints `uuid_v5(namespace, "gen:<generator_id>:<cell_key>:<local_member_key>")` from a **stable spatial/sample key — never a global array index**. A global `index` is fragile: changing density, bounds, ordering, or algorithm would shift every later index and churn identity, making reconciliation noisy. The key must be stable under local changes (a member in cell `(12,34)` keeps its identity as members are added elsewhere or density changes). Stable across re-materialization and reset; replaces today's random v4. *Defining the stable member key is a pre-WS7 requirement.*
- `materialization`: `on_demand` (shards materialize by region/chunk when a region becomes active/owned) or `eager` (for small/always-loaded sets).
- `kind` resolves to a registered generator runtime (engine mechanism; the kinds and `world_init.lua`'s seeded layout logic are content). Generator output must be a pure function of `(seed, bounds, params, cell)` — no wall-clock/ambient RNG (consistent with DR-0051 determinism) and no dependency on global member ordering.

### 4.3 Spawn table / population rule

Population over time (pirate patrols, ambient traffic) — references blueprints + spawn cadence/conditions, applied by the runtime spawn surface (composition plan WS6 / unified pipeline runtime spawn). Stored as data; behavior is the runtime's.

### 4.4 System / region

Center, `SolarSystemRadius`, `SolarSystemVisuals` (nebula/backdrop param set), membership — per the galaxy proposal. Systems are themselves authored placements with the solar-system blueprint; this file is the authoring-friendly grouping.

## 5. Identity & provenance

- **Placement → fixed identity:** `uuid_v5(ns, "placement:<placement_id>")` (extends `world_bootstrap_fixed_entity_identity_contract`).
- **Generator member → deterministic identity, keyed stably:** `uuid_v5(ns, "gen:<generator_id>:<cell_key>:<local_member_key>")` — a stable spatial/sample key, **never a global array index** (§4.2). This is the load-bearing change from today's random v4 and is what makes on-demand materialization idempotent and per-member deltas durable without churning identity when generator parameters change.
- **Provenance component (engine-generic `authored_baseline_source`)** on every seeded entity:

  ```
  authored_baseline_source:
    baseline_id            # "main"
    baseline_revision      # the applied revision (the merge base)
    source_key             # "placement:treasure.hidden_cache.cargo" | "gen:<id>:<cell>:<member>"
    blueprint_id           # "cargo.container"
    baseline_content_hash  # canonical hash of the baseline-derived state that produced this entity
  ```

  **Persisted and server-side only — not normally replicated to clients;** debug/dashboard read it through admin APIs. It gives three abilities: (1) know which DB entities came from the baseline, (2) diff live state against the authored source, (3) reconcile baseline updates without clobbering evolved entities. Engine-generic so the deletion test stays green (DR-0045); space vocabulary lives in the baseline content.
- **The merge base must be materially available.** A 3-way reconcile needs the *content* of the old applied baseline, not just its revision — disk files may have been overwritten. Provide it via **content-addressed snapshots** of applied revisions (the gateway already content-addresses packages) **or** the per-entity `baseline_content_hash` above (enough to detect each entity's drift without whole snapshots). Revision + a single global hash is **not** sufficient.

## 6. Seed lifecycle

Replace "run a giant Lua script once, record an opaque `init_key`" with "apply a compiled, versioned baseline":

```
on empty DB:
  load the active universe baseline from disk
  validate blueprints/assets/components/placements/generators
  compile placements → graph records; generators → generator records (+ eager materialization)
  persist transactionally
  record applied marker: baseline_id + revision + content_hash   (replaces init_key)
  retain the merge base: content-addressed snapshot of this revision,
    and/or per-entity baseline_content_hash in provenance   (needed for later 3-way reconcile)

on dev reset:
  clear graph runtime state + applied markers
  re-apply the selected baseline   (idempotent via fixed identity)

on production update:
  reconcile (3-way merge), never blind-reset evolved state   (§6.1)
```

### 6.1 Reconciliation (3-way merge)

Updating a live world from baseline rev N → N+1 is a merge of **old applied baseline (merge base) · new baseline · live state**, made tractable by the applied-revision marker + per-placement provenance:

| Per placement | Author changed? (new baseline hash vs stored `baseline_content_hash`) | Evolved? (canonical hash of live vs the base) | Action |
|---|---|---|---|
| New in baseline | — | absent | add |
| Removed from baseline | — | unmodified | remove (or orphan, by policy) |
| Changed in baseline only | yes | no | update to new baseline |
| Changed in live only | no | yes | keep live |
| Changed in both | yes | yes | **conflict** |

**Conflict defaults:** dev → *baseline wins*; production → *keep live + flag for manual resolution*. Without the materially-available merge base (§5), authored changes can't be distinguished from evolved changes — so the snapshot/per-entity-hash and provenance are mandatory, not optional.

**Canonical hash (pre-WS7 definition).** "Evolved" is decided by comparing the **canonical hash** of live state against the base; a sticky dirty bit may pre-filter but is not authoritative. The canonical hash covers **only authoring-significant component state** and **excludes** provenance (`authored_baseline_source`), timestamps/`applied_at`, runtime-only/non-persisted fields, transient motion/physics scratch, and shard/visibility bookkeeping — otherwise reconcile reports false drift on every tick. The same normalization is used for both the stored `baseline_content_hash` and the live comparison, so a pristine entity hashes identically to its base.

## 7. Procedural scale & materialization

For huge areas, do **not** seed millions of graph entities. Persist only:

- the generator spec,
- materialized *important* entities (hand-authored / quest-relevant),
- evolved deltas (destroyed/looted/modified) keyed to the deterministic member id.

Shards materialize a generator's members for a region/chunk on demand when they take ownership (DR-0040: baseline is global, deltas are region-owned). **V1** persists materialized authored entities fully; **later**, sparse/copy-on-write persistence (DB stores only deltas from baseline; a pristine authored entity needs no row) is enabled by provenance + deterministic identity and must not be designed out.

## 8. Frontend

The concrete routes, layout, and shared components are specified in `authoring_dashboard_frontend_proposal.md` (`/firmament` hosts the Seed Manager and the baseline map; `/foundry` is the entity composer). In summary — two clearly distinguished modes, and the UI must never blur "editing the design" with "editing the live world":

**Baseline (authoring) mode** — edits the disk-authored universe packages:
- The world-map authoring layer (composition WS5) on **`/firmament`** — which *reuses* the `/game-world` canvas component, not `/game-world` itself: drag-place a blueprint (or right-click → "Add entity"), set `placement_id`, set position / system membership, add overrides, assign quest trigger / spawn table / shader-backdrop params, then **publish to the disk baseline package**.
- Region-scoped, lazy-loaded editing so a huge universe never loads at once; generators keep the artifact compact and preview deterministically on the map (expand at `seed` to show the scatter before committing).

**Live world mode** — the existing `/game-world` BRP/graph explorer, read-mostly, showing the current persisted/evolved state.

**Seed Manager panel:**
- selected baseline: `main`; disk revision/hash; DB applied revision/hash;
- status: `not applied | current | drifted | conflicts`;
- actions: **Dry Run**, **Apply To Empty DB**, **Reset Runtime World To Baseline** (dev workhorse), **Reconcile Baseline Into Live World** (production; shows conflicts explicitly).

**Sequencing note:** drift *status* (cheap disk-hash vs applied-hash) ships early; the per-placement **seed-vs-live diff overlay** on the map (this station is destroyed in live but authored; these ships exist in live but aren't authored) is the highest-value, highest-effort piece and is a later milestone — the "Reconcile" button must not imply the diff overlay is done.

## 9. Role of Lua

- **Good Lua use:** `on_create`/`on_destroyed`/quest triggers/loot behavior, special scripted placements, and *validated named generator behavior*.
- **Not Lua's job:** storing the universe; encoding every coordinate/placement in code; opaque procedural output the dashboard cannot diff or validate.
- `world_init.lua` is reframed as a **generator runtime** — its deterministic seeded asteroid-layout logic is reused, driven by generator records — not the authoring surface.

## 10. Engine / content boundary (DR-0045)

- **Engine (mechanism):** baseline package format/schema, validation, the compile/apply/reconcile pipeline, the `authored_baseline_source` provenance component, deterministic-identity derivation, the generator-materialization API, and the Seed Manager API. None names a space concept.
- **Content (`data/`):** the universe packages, system names, generator kinds, spawn-table content, and the seeded layout logic. Multi-shard: baseline global, deltas region-owned, materialization shard-aware (DR-0040).

## 11. Open decisions / non-goals

Decided (2026-06-17 review):
- **Provenance visibility** — persisted, **server-side only**, not client-replicated; admin/dashboard read via admin APIs (§5).
- **Generator member identity** — a stable spatial/sample key (`gen:<id>:<cell>:<member>`), never a global array index (§4.2/§5).
- **Merge base availability** — content-addressed applied-revision snapshots or per-entity `baseline_content_hash`; revision+single-hash is insufficient (§5/§6.1).
- **Canonical hash for drift** — authoring-significant state only; excludes provenance, timestamps, runtime-only fields, shard/visibility bookkeeping (§6.1).

These three are **pre-WS7 implementation requirements** (DR-0054 Follow-up): the exact cell/sample-key scheme, the snapshot-vs-stored-hash choice, and the exact canonical-hash field set are settled at WS7 start.

Still open:
- **Reconcile conflict UX** beyond the dev/prod defaults (per-placement override, bulk policies).
- **Sparse/copy-on-write persistence timing** (V1 full materialization; later optimization).
- **Generator-member identity migration** for existing worlds (asteroid members are random v4 today) — a one-time remap.
- **Orphan policy** for entities whose baseline placement was removed but which have evolved.

Non-goals:
- Not a per-entity blueprint editor (that is the entity authoring proposal); this authors *where blueprints go* and *how the universe is generated*.
- No binary baseline dump; the baseline is text/JSON + content-addressed (DR-0053).
- No blind production reset; production updates reconcile (§6.1).
- Not storing evolved/runtime state in the baseline; the baseline is the recipe, the DB is the evolved world.

## 12. References

- `docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md` — the decision this specs.
- `docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md` — disk-as-truth substrate (baseline is a package kind).
- `docs/features/proposed/entity_authoring_system_proposal.md` — blueprints, placements, override schema (§3.6), identity split (§3.4).
- `docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md` — WS5 (placements) / WS7 (this).
- `docs/features/proposed/galaxy_world_structure_proposal.md` — coordinate/solar-system model populated by the baseline.
- `docs/features/active/world_bootstrap_fixed_entity_identity_contract.md` — fixed-identity GUID derivation.
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md` — shard ownership for materialization/deltas.
- Code: `bins/sidereal-replication/src/replication/simulation_entities.rs` (`apply_scripted_world_init_once`), `.../persistence.rs` (`apply_scripted_world_init_blocking`, `script_world_init_state`), `.../admin.rs` (`reset_persisted_runtime_world`), `crates/engine-core/src/fixed_entity_guid.rs`, `data/scripts/world/world_init.lua`, `data/scripts/bundles/starter/asteroid_field.lua`.
