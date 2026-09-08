# Entity Package Format Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-06-18
Owners: content authoring + gateway + replication runtime + persistence + engine architecture
Scope: The operative on-disk format, durability model, publish-time validation, gateway API, and disk-write safety for authored entity content packages (DR-0053 / composition plan WS2). Disk is the durable source of truth; the catalog database is a derived cache that re-seeds from disk after a wipe.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0053_disk_authored_content_packages_durable_source_of_truth.md
- docs/features/proposed/entity_authoring_system_proposal.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/decisions/dr-0049_dashboard_authoring_control_plane.md
- docs/decisions/dr-0045_engine_content_separation_achieved.md

## 1. Status

This contract is operative as of WS2 (the read+write backbone). The
`entity_authoring_system_proposal.md` remains the design rationale (storage
model §2–§3, `entity.json` schema §4, disk-write safety §6.4, publish failure
semantics §6.5); this document records what is **implemented and guaranteed**.
The Composer dashboard UI (WS3) and per-instance placement/overrides (WS5) build
on this and are out of scope here.

## 2. On-disk model

One directory per package, plain-text authoring files, under a future-proof
content root:

```
data/content/entities/<package_id>/
  manifest.json     # package descriptor (schema_version, package_id, kind,
                    #   primary_blueprint, files[], revision)
  entity.json       # the declarative blueprint definition
  hooks.lua         # optional: component-keyed hook handler functions
  params/*.json     # optional: shader parameter sets
  shaders/*.wgsl    # optional: custom shaders
  assets.json       # optional: asset rows the package contributes
```

- The directory name **is** the `package_id` (sanitized, §6).
- `manifest.json` carries `files` (the authoritative list the seed/aggregator
  reads) and a monotonic `revision` bumped on each successful publish.
- The package **content hash** is sha256 over the listed files (excluding
  `manifest.json`), recorded in the catalog index and audit log.

The mechanism lives in the engine crate `engine-content` (project-agnostic); the
packages themselves are content under `data/`. The DR-0045 deletion test and
the engine-boundary guard stay green.

## 3. Identity (§3.4)

Three identifiers stay distinct:

- `blueprint_id` (= `package_id`) — the reusable authored definition (this
  package). `entity.json` carries it; it is **never** a runtime GUID and has no
  position.
- `placement_id` — an authored world-map placement (WS5).
- runtime entity GUID — a concrete spawned instance, minted at the birth path.

A placement-less blueprint is therefore not directly spawnable on its own: the
runtime instance's identity and placement-time components (position, owner) are
supplied at instantiation, not stored in the blueprint.

## 4. Durability (DR-0053)

- **Disk is the durable source of truth.** Published packages are the
  authoritative record.
- **`content_package_index` is a derived cache.** On boot the gateway
  reconciles the cache to the on-disk package set (disk wins on any divergence).
  A `pg-reset` clears the cache; the next boot re-seeds it from disk, so
  authored packages survive a database wipe.
- **Drafts may remain ephemeral in SQL.** Only published content carries the
  disk-durability guarantee.

## 5. Publish-time validation (§4.2, all blocking)

A publish is refused (nothing written) unless every check passes:

1. Every `component_kind` is registered and every payload round-trips through
   the real typed deserializer.
2. Every referenced asset/shader id in the `visual` block resolves; a
   `parameter_set` is a package `params/` path or a known asset id.
3. Every hook binding resolves: an `entity`-scope hook is one of the universal
   lifecycle names; a component-scope hook's component is present and exposes
   that hook (WS1 `component → hooks` map). Every bound `handler_id` is defined
   under its scope in `hooks.lua`.

Component-embedded asset ids (e.g. a `map_icon` component's `asset_id`) are
typed-decoded as strings but are **not yet** resolved against the asset catalog;
only the explicit `visual` block is (a tracked partial of check 2).

## 6. Disk-write safety (§6.4)

Gateway-mediated writes into `data/content/` are a privileged surface, hardened
before use:

- **Path confinement** — the canonicalized destination must be a direct child of
  the canonical content root; absolute paths, `..`, drive/UNC prefixes, and NUL
  are rejected.
- **Symlink rejection** — an existing package directory is canonicalized and a
  real path outside the root is rejected (no symlink-escape).
- **ID/filename allowlisting** — `package_id` is `[a-z0-9._-]`, bounded, no
  separators / leading dot; package files are an allowlisted set
  (`manifest.json`, `entity.json`, `hooks.lua`, `assets.json`, `params/*.json`,
  `shaders/*.wgsl`), and — mirroring the `package_id` rule — no path component
  may start with `.` (so a dotfile cannot satisfy the `*.json` / `*.wgsl` shape
  or collide with the `.staging`/`.trash` work areas).
- **Atomic writes** — temp file + rename.
- **Transactional publish + rollback** — all files are staged in a private
  `.staging` dir and committed by an atomic directory rename (`live → .trash`,
  then `staged → live`), rolled back on failure so a partial publish never
  becomes the live package.
- **Per-package locking** — an **in-process** advisory lock serializes
  publishes/deletes within one gateway. It does **not** serialize across multiple
  gateway instances sharing the disk; a Postgres advisory lock is the future fix
  (DR-0053 follow-up) and is deliberately not built in V1, which runs a single
  gateway.
- **Seed/hot-reload race safety** — the seed walk skips `.staging`/`.trash` and a
  directory without `manifest.json` (the instant during the commit-swap), so it
  only ever observes a complete package, never a partial one, and never
  de-indexes a package that is momentarily absent.
- **Soft delete** — a delete moves the package directory to `.trash` (reversible)
  and de-indexes it. `.trash` is bounded by a retention-window GC
  (`PackageWriter::gc_trash`, default 24h) that runs best-effort on writer
  construction, so reversible deletes stay recoverable for a window without
  growing the trash without bound.
- **Audit logging** — every publish/delete records the actor (admin account or
  agent service token), `package_id`, revision, and content hash.

## 7. Publish failure semantics (§6.5)

1. The atomic disk commit is the **commit point**; once it succeeds the new
   revision is authoritative.
2. The catalog refresh is downstream and retryable. If it fails after a
   successful disk commit, publish returns success-with-pending-index; the next
   boot's seed re-indexes the package. Content is never lost.
3. The cache is never more authoritative than disk; on divergence the cache is
   re-derived from disk.
4. A failed disk commit is a no-op: the previous revision stays live.

## 8. Gateway API

| Method + path | Purpose |
|---|---|
| `POST /admin/dashboard/entity-packages/{package_id}/publish` | Validate fully, write the package to disk (commit point), refresh the catalog. |
| `POST /admin/dashboard/entity-packages/{package_id}/validate` | Dry-run the §4.2 validation without writing. |
| `DELETE /admin/dashboard/entity-packages/{package_id}` | Soft-delete (move to `.trash`) and de-index. |

The `entity-packages` path keeps content-package authoring distinct from the
runtime-entity inspection routes under `/admin/dashboard/entities/`.

All require the authoring control-plane `scripts:write` scope (DR-0049) and
carry the actor through to the audit log.

## 9. Verification

- Per-PR (against the CI Postgres service, no process spawning): a committed
  package and an **API-published** package each survive a simulated catalog wipe
  (seed/publish → clear the index → re-seed → re-indexed and decode-valid).
- §6.4 negative tests: path-escape, symlink-escape, and partial-publish rollback
  (an injected mid-publish failure leaves the live package untouched).
- Publish-time rejections: dangling asset id, hook on an absent/non-exposing
  component, malformed payload, handler missing from `hooks.lua`.
- The full `pg-reset` + reboot durability smoke runs in the nightly suite.
