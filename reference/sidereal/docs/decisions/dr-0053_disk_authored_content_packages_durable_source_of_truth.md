# DR-0053: Disk-Authored Content Packages as Durable Source of Truth

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-18
Owners: content authoring + gateway + replication runtime + persistence + engine architecture
Scope: Establish that dashboard/CLI/agent-authored content packages (entity blueprints and their co-located files) are stored on disk as the durable source of truth, with the catalog/persistence database as a derived cache that re-seeds from disk after a wipe — amending DR-0025's disk-is-seed/DB-is-durable model for this content class.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0025_runtime_script_catalog_authority.md
- docs/decisions/dr-0026_sql_script_catalog_persistence.md
- docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md

## DR-0053: Disk-Authored Content Packages as Durable Source of Truth

- Status: Accepted
- Date: 2026-06-17
- Owners: content authoring + gateway + replication runtime + persistence + engine architecture

## Context

- The entity authoring system (`docs/features/proposed/entity_authoring_system_proposal.md`, composition plan WS2) lets authors define entities — name, tags/labels, components, sprite/shader, component-implied Lua hooks — from the dashboard, with the authored definition stored as a per-package directory of text files (`manifest.json`, `entity.json`, `hooks.lua`, optional `shaders/`, `params/`, `assets.json`).
- A hard product constraint is that **the database is wiped frequently** (`siderealctl pg-reset` runs `docker compose down -v`, destroying the whole Postgres volume; the gateway script catalog and world/graph persistence share that one instance). Authored content must survive resets.
- Investigated current behavior (2026-06-17): dashboard **publishes land in PostgreSQL only** (`engine-persistence` `publish_script_catalog_draft` → `script_catalog_documents`/`_versions`); there is no write-back to disk. Disk is seed-only. Therefore **dashboard-published content does not survive a wipe today** — it has no disk copy to re-seed from. Asset *bytes*, by contrast, are already written to disk (`bins/sidereal-gateway/src/api.rs` asset payload endpoint) and do survive.
- DR-0025 (Runtime Script Catalog Authority) deliberately made the opposite call for the **runtime script catalog**: in-memory Bevy resources are the execution authority, filesystem `.lua` is "bootstrap seed input and explicit reload source only," and DR-0026 persists published scripts to SQL as durable runtime content. That model is correct for live script editing/hot-reload of the standalone script catalog, but it is the wrong default for reset-surviving *authored content packages*.
- This conflict must be resolved by an explicit decision, not feature prose, because two source-of-truth documents (DR-0025 and the entity authoring proposal) otherwise state opposite durability models.

## Decision

- **Authored content packages are disk source of truth.** For dashboard/CLI/agent-authored content packages under `data/content/**` (entity blueprints and their co-located manifest, hooks, shader, param, and asset-reference files), the **on-disk package is the durable, authoritative record**. The catalog/persistence database is a **derived cache/index** built from disk and rebuilt by the existing seed-from-disk path after a wipe.
- **Publish writes to disk.** The gateway publish path commits the package to disk via an atomic, transactional, sanitized write (per the entity authoring proposal §6.4), then refreshes the catalog. The **disk commit is the commit point**; catalog refresh is downstream, retryable, and never treated as more authoritative than disk (proposal §6.5). On any disk/cache divergence, disk wins and the cache is re-derived.
- **Drafts may remain ephemeral in SQL.** Unpublished drafts stay in the database and are acceptable to lose on a wipe. Only **published** content carries the disk-durability guarantee.
- **Scope and reconciliation with DR-0025.** DR-0025 continues to govern the **standalone runtime script catalog** (scripts authored/edited through the script editor, executed from in-memory resources, DB-persisted per DR-0026). This DR governs **authored content packages**. Where a package contains scripts (`hooks.lua`), the package's disk directory is the publish target and durable record; the runtime script catalog **indexes/seeds those package scripts from disk** rather than holding them as the durable original. DR-0025's execution model (in-memory authority, hot-reload) is unchanged; only the *durable storage substrate* for package-contained content is disk, not DB.
- **Engine/content boundary (DR-0045).** The mechanism — package manifest schema, scoped disk-write, seed-from-disk, validation, derived-cache indexing — is engine (`engine-content`/gateway). The packages themselves are content under `data/`. The deletion test stays green.
- **Reuse, don't rebuild.** This rides the existing gateway authoring control plane (DR-0049), content-addressed asset delivery (DR-0046, already disk-durable), and the existing catalog seed/poll path. It adds two narrowly scoped gateway capabilities (create-new files under a confined content root; seed-from-disk for packages), both modeled on existing code.

## Alternatives considered

- **Keep DR-0025's DB-durable model for authored entities (status quo):** rejected — authored content would not survive `pg-reset`, defeating the primary constraint; the DB is explicitly treated as disposable dev state.
- **Amend DR-0025 in place instead of a new DR:** rejected — DR-0025 is an accepted source-of-truth decision about *runtime script execution authority*; entity content packages are a distinct, new content class. A separate DR with an explicit scope split is clearer than overloading DR-0025 and risks not regressing its (still-correct) execution model.
- **Dual-write (DB authoritative + disk mirror):** rejected — two authoritative stores require a distributed transaction and a conflict-resolution policy; the single durable commit (disk atomic rename) with a derived cache is simpler and matches how asset bytes already work.
- **Binary `.dat` package on disk:** rejected (entity authoring proposal §3.2) — kills diff/merge/review and AI/CLI authoring and fights the seed/hot-reload-on-text machinery; delivery is already solved by content-addressed assets.
- **Store packages in a separate database from world/graph persistence so a world wipe spares them:** rejected for V1 — does not survive a full `pg-reset` (volume destroy) and adds operational surface; disk-as-truth survives any DB reset uniformly.

## Consequences

- Positive:
  - Dashboard/CLI/agent-authored entities survive database wipes via the existing seed-from-disk path — the durability the authoring system requires.
  - Content is text on disk: diffable, mergeable, code-reviewable, AI/CLI-authorable, and consistent with the unified pipeline's agent-authoring goal.
  - Publish has clean single-commit-point failure semantics without a cross-store transaction.
  - Reuses asset-bytes durability and the catalog seed/poll path; minimal new machinery.
- Negative:
  - The gateway gains a privileged create-new-files disk-write surface that must be hardened (path/symlink confinement, atomic/transactional writes, locking, audit — proposal §6.4) before it is trusted.
  - Two durability models now coexist (DB-durable standalone scripts per DR-0025; disk-durable packages per this DR); the scope split must be documented and honored to avoid ambiguity for package-contained scripts.
  - Seed/aggregation cost grows with package count; the catalog index must rebuild from disk efficiently on boot.

## Follow-up

- Implement under composition plan WS2 (`docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md`): scoped disk-write, seed-from-disk for packages, manifest/`entity.json` validation, and the wipe-survival + disk-write-safety tests.
- Confirm the reconciliation for package-contained scripts (`hooks.lua`) against DR-0025/DR-0026: package scripts are indexed/seeded from disk; standalone script-editor scripts keep the DR-0025/0026 path until/unless migrated.
- Refresh `entity_authoring_system_proposal.md` and the composition proposal/plan to cite this DR as the durability decision (done at authoring time).
- Decide whether existing per-type registries (`ships`, `planets`, `assets`, `audio`) migrate onto the disk-package model (composition plan WS4) or remain on their current seed/catalog path in the interim.

## References

- `docs/decisions/dr-0025_runtime_script_catalog_authority.md` — runtime script execution authority + disk-as-seed (the model this scopes/amends for packages).
- `docs/decisions/dr-0026_sql_script_catalog_persistence.md` — SQL persistence of the published script catalog.
- `docs/decisions/dr-0046_lua_asset_registry_gateway_http_delivery.md` — content-addressed asset bytes on disk (the durable pattern reused).
- `docs/decisions/dr-0049_dashboard_authoring_control_plane.md` — gateway authoring control plane.
- `docs/decisions/dr-0045_engine_content_separation_achieved.md` — engine/content boundary.
- `docs/features/proposed/entity_authoring_system_proposal.md` — concrete storage model, manifest, disk-write safety (§6.4), publish failure semantics (§6.5).
- `docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md` — WS2 implements this.
- Code: `crates/engine-persistence/src/lib.rs` (publish → SQL today), `bins/sidereal-gateway/src/api.rs` (asset upload → disk + sanitization), `bins/sidereal-gateway/src/auth/starter_world_scripts.rs` (seed-from-disk).
