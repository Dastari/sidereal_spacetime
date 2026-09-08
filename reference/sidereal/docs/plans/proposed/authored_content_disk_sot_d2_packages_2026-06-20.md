# D2 — Retire the God-Files: Registries as Per-Entity Packages

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-20
Owners: content authoring + gateway + replication runtime + engine architecture
Scope: Phase D2 of the authored-content disk-SoT workstream — convert dashboard-authored registries (ships, ship-modules, planets, assets) into per-entity disk packages on the entity-package model, retire the `*_registry.lua` god-files, and split the asset registry's machine-data from its hand-authored shader Lua.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/proposed/authored_content_disk_sot_registries_2026-06-19.md
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md

This is Phase D2 of [Authored Content → Disk-as-Source-of-Truth](authored_content_disk_sot_registries_2026-06-19.md). D1 (disk-authoritative script catalog) has shipped; durability is solved. D2 is the structural follow-up: retire the hand-edited god-files by making every dashboard-authored registry a set of per-entity disk **packages**, mirroring the existing entity-package model.

## Context from recon (what's already true)

The runtime does NOT read disk on the hot path: replication polls the Postgres `script_catalog_*` cache every 1 s and builds typed Bevy resources (`ShipRegistry`, `ShipModuleRegistry`, `PlanetRegistry`, `ScriptAssetRegistry`). For ships/modules/planets it parses a thin `*/registry.lua` index, then resolves each `script = "<path>.lua"` per-entity file from the in-memory catalog map. Assets are a single inline document.

Per-registry reality:
- **ships / ship_modules / planets** — already thin index + per-entity `return {…}` `.lua` files, with full round-trip codecs (`validate_and_render_*` ↔ `decode_*`) and split `/index`+`/definition` dashboard endpoints. The decoded-registry envelope (`AuthoringRegistryEnvelope` = index `entries` + per-id `definitions`) already models the package shape.
- **assets** — the real god-file: `data/scripts/assets/registry.lua`, 3234 lines. Lines **1–1119** are hand-authored shader-schema Lua (uniform schemas, `apply_field_descriptions` load-time mutation, `bind_shader_uniform_schema`/`pick_*`/preview-constructor helpers, two pre-composed schema locals). The `AssetRegistry.assets` array (lines 1120–3233) holds **21 pure-data entries** (image/svg/audio) + **11 shader entries** that call those helpers inline. Decode + single-entry text-splice only; **no whole-file encoder**.
- **audio / asteroids / bundles / world / ai / accounts** — out of scope (audio has a full whole-file codec already; asteroids has no authoring surface; the rest are engine wiring or imperative scripts, not data registries).

## Decision

**Packages are the only on-disk representation of authored registry content; the `.lua` data registries retire.** Per-entity/per-asset JSON packages under `data/content/` become the authored source of truth (entity-package machinery: `PackageWriter` + `FileShape` + a derived index table re-seeded from disk on boot). The runtime builds its typed registry resources from the package-derived cache instead of parsing `*_registry.lua`.

Rejected alternative: keep generating `.lua` registries from packages and leaving the runtime untouched. That keeps the god-files (relabeled "generated"), commits generated artifacts, and invites source/generated drift. It is lower runtime risk but does not actually *retire* anything — contrary to the chosen "full restructure."

Why the runtime retarget is acceptable risk: the affected code is the **1 s catalog-poll resource build**, not the per-tick prediction / replication-delivery path. The typed registry resources are well-defined and tested; cross-registry validation (`validate_ship_definition`, `validate_blueprint`) is preserved verbatim. It is sequenced LAST, with every prior slice leaving the system green on the existing `.lua` path.

### The asset split (the hard case)

`assets/registry.lua` splits into three:
1. **Per-asset data packages** — the 21 image/svg/audio entries, each a package (`manifest.json` + `asset.json`). Fully round-trippable; dashboard asset-creation writes one of these (retiring the fragile `"assets = {"` text-splice).
2. **A hand-authored shader module** — lines 1–1119 + the 11 shader entries, moved verbatim into a real Lua module under `data/scripts/shaders/` (genuine code: schemas, helpers, `editor_schema`, presets). Never machine-rendered. Edited by hand on disk; durable via D1.
3. **Composition** — the gateway's asset-registry decode (`load_asset_registry_from_source` → `ScriptAssetRegistry`) and the client bootstrap-manifest build (`build_runtime_asset_catalog_from_registry_source`) are retargeted to aggregate the data packages + the shader module into the same `ScriptAssetRegistry` / `AssetBootstrapManifestResponse` they produce today. **Client wire DTOs do not change.**

## Target architecture

- **Disk:** `data/content/{ships,ship_modules,planets,assets}/<id>/` packages (JSON), alongside existing `entities/`. `data/scripts/` keeps only real scripts (`world_init`, `ai/*`, `accounts/*`, bundle wiring) + the new hand-authored `shaders/` Lua module. The `*_registry.lua` + per-entity `*.lua` data files are deleted at the end.
- **Write machinery:** new `FileShape` variants (or one parameterized registry-package shape) in `crates/engine-content/src/write.rs` with per-kind allowlists + JSON schemas (`crates/engine-content/src/schema.rs`); reuse staging/atomic-rename/rollback/per-id-lock/symlink-rejection unchanged.
- **Derived cache:** extend the `content_package_index` model with registry kinds (or a sibling table) carrying full package content so a re-seed is self-sufficient; `seed_*_from_disk` on boot, reconcile-to-disk (disk wins), mirroring `seed_content_packages_from_disk`. Survives `pg-reset`.
- **Runtime:** replication's registry loaders (`scripting/asset_registry.rs`, `scripting/catalog.rs`) build `ShipRegistry`/`ShipModuleRegistry`/`PlanetRegistry`/`ScriptAssetRegistry` from the package cache; poll/refresh retargeted to the package cache revision; load ordering preserved (modules+assets before ships). Cross-registry validation unchanged.
- **Dashboard / gateway:** generalize the entity-package read/write/publish handlers to the new kinds; the decoded-registry envelopes are built from packages. No dashboard Lua parsing; the gateway owns all generation.

## Phased plan (green at each step)

- **D2a** — package format + write machinery for registry kinds (engine-content: `FileShape` + JSON schemas + validate + `PackageWriter` support). Additive; no behavior change. Unit tests.
- **D2b** — derived cache + boot re-seed for registry packages (persistence table/kinds + `seed_*_from_disk` + wipe-survival test). Additive.
- **D2c** — one-time migration: export current ships/modules/planets/asset registries (via existing decoders) → per-entity/per-asset packages on disk; extract the asset shader module verbatim. A `siderealctl` ops command, dry-run first (mirrors D1a). Commits the package tree.
- **D2d** — gateway read/write/publish endpoints retargeted to packages (dashboard authoring now writes packages; decoded envelopes built from packages). Runtime still on `.lua` — both representations valid in parallel during cutover.
- **D2e** — runtime registry-load retargeted to the package cache (replication builds resources from packages; cross-registry validation + ordering preserved). The high-risk slice; heavy tests. After this, `.lua` data registries are unused.
- **D2f** — delete the `*_registry.lua` + per-entity `*.lua` data files + the asset god-file; retire `splice_asset_registry_entry` and the `.lua` registry codecs; finalize the asset shader module as the only asset-related Lua. Cleanup + guard against reintroduction.

## Risks / guardrails

- Atomic + path-confined writes only (reuse `PackageWriter`/`FileShape`; symlink reject, temp+fsync+rename, per-id lock).
- Preserve cross-registry validation at BOTH publish and runtime-load (`validate_ship_definition` ship→module/asset; `validate_blueprint` blueprint→asset) and the modules/assets-before-ships load ordering.
- Preserve the client wire contract (bootstrap/startup manifests) — only the gateway-side composition changes.
- The asset shader module moves **verbatim**; never machine-render it; keep the `apply_field_descriptions` load-time composition intact.
- No dashboard Lua parsing; the gateway owns all generation.
- Durability (D1) stays intact: packages are disk-SoT; the cache re-seeds from disk on boot; a wipe-survival test gates D2b.
- Sequence so the system is green on the existing `.lua` path until D2e flips the runtime; D2f only deletes once nothing reads `.lua` data registries.

## Out of scope
audio, asteroids, bundles, `world_init`, ai handlers, account scripts — not dashboard-authored data registries. Authored comments in per-entity files are dropped by `return {…}` re-render (pre-existing); long rationale should live in `docs/`.
