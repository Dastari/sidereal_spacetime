# Authored Content → Disk-as-Source-of-Truth: Registries & Scripts

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-19
Owners: content authoring + gateway + replication runtime + engine architecture
Scope: Make dashboard-authored registries and scripts disk source-of-truth (D1 disk-authoritative script catalog; D2 retire the god-files) so they survive `pg-reset`.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/proposed/content_authoring_composition_plan_2026-06-17.md
- docs/plans/proposed/authored_content_disk_sot_d2_packages_2026-06-20.md

## Problem
Dashboard-authored registries and scripts — assets, ships, ship-modules, planets, audio, asteroids, bundles, and world/AI scripts — persist **only** in the Postgres `script_catalog_*` tables. Disk (`data/scripts/`) is a *first-boot seed* that **freezes** the moment anything is published from the dashboard (`should_persist_disk_catalog` returns false once any catalog document's origin ≠ `"disk"`). There is **no write-back to disk**. So `siderealctl pg-reset` (the routine dev DB wipe: `docker compose down -v`) **destroys all dashboard-authored registry/script content**. Only entity packages (`data/content/entities/`) are disk-SoT and survive wipes.

This violates DR-0053's principle (authored content is disk-SoT; the DB is a derived cache) — which DR-0053 **explicitly deferred** for the registries (its open follow-up L68: migrate ships/planets/assets/audio onto the disk-package model, or keep them on the seed/catalog path). Composition-plan WS4 sketches the same direction ("retire the god-files"). This design resolves it.

## Principle (DR-0053, extended to the script catalog)
All dashboard-authored content is disk source-of-truth; the DB is a derived cache rebuilt from disk on boot; the disk commit is the commit point. Entity packages already prove this (`PackageWriter` + `content_package_index` derived cache + boot re-seed + a wipe-survival test). Extend the model to the script catalog.

## Current model (recon)
| Authored type | Persists where | Survives `pg-reset`? |
|---|---|---|
| Entity packages | disk `data/content/entities/` + `content_package_index` (derived) | **YES** |
| Assets / ships / modules / planets / audio / asteroids / bundles / world+AI scripts | DB `script_catalog_*` (disk = frozen first-boot seed) | **NO** |

Script catalog: one `.lua` document per file under `data/scripts/`; draft→publish→versions in Postgres; `SCRIPT_CATALOG_CACHE`; disk-seed only on first boot, frozen after the first dashboard publish. Runtime (replication, gateway) loads from the catalog (DB- or disk-owned); the client consumes JSON manifests from the gateway. Only `pg-reset` clears the catalog — runtime/world resets don't.

Per-registry data-vs-Lua and migration difficulty:
- **Ships / ship-modules / planets — EASY.** Thin index + per-entity literal-table definition files; ~100% machine-data; clean round-trip codecs already exist (WS1 `decode_definition_table` ↔ `validate_and_render_*_definition`).
- **Audio — EASY.** Single pure-data document; full bidirectional codec (`load_audio_registry_from_source` ↔ `json_to_lua_return_source` on the whole file).
- **Assets — HARD.** ~⅓ flat data + ~⅔ hand-authored shader-schema Lua (uniform schemas, helper functions, `editor_preview`/`bind_shader_uniform_schema` composition), deeply interleaved with the `assets` array. Decode-only into `ScriptAssetRegistry`; **no full encoder** (dashboard writes a single new image entry via text-splice, never re-rendering). Must be **split**: machine-data asset entries are disk-SoT-able; the hand-authored shader Lua must stay hand-authored.

## Design

### Phase D1 — disk-authoritative script catalog (the durability fix)
1. **Publish writes to disk (the commit point).** On publish, render the document and write it **atomically + path-confined** to its `data/scripts/...` file, reusing the existing per-registry encoders (WS1 `validate_and_render_*` for ships/modules/planets/audio; the single-entry splice for asset image entries) + `PackageWriter`-style write safety. Disk becomes SoT.
2. **DB catalog becomes a derived cache.** Re-seed `script_catalog_*` from disk on every boot (mirror `seed_content_packages_from_disk` → `content_package_index`). **Remove the freeze-after-publish logic** (`should_persist_disk_catalog`): disk always wins; drafts stay ephemeral in SQL (unpublished WIP).
3. **Runtime loads the disk-derived catalog** — the existing catalog-load contract (replication polling; cross-registry validation where ships need modules+assets) is preserved; everything is now disk-derived and fresh.
4. **One-time cutover migration:** BEFORE switching to disk-authoritative, **export the current DB-published catalog to disk** (the user's existing dashboard edits — e.g. the `cargo` asset, any registry edits) so nothing is lost when boot re-seed begins reading disk.

Result: every dashboard registry/script edit lands on disk and survives `pg-reset`, reusing all existing codecs + runtime loading. Minimal disruption; keeps the `.lua` format.

Assets within D1: dashboard writes (new image assets) splice into the **disk** file atomically + the catalog is disk-derived → image-asset durability via the existing splice. The hand-authored shader uniform-schemas stay hand-edited Lua on disk (they are not dashboard-authored data) — no change needed.

### Phase D2 — retire the god-files (optional, composition WS4)
The deeper structural play: registries become **generated indexes aggregated from per-entity disk packages** — asset entries / ship / planet / module defs become individual disk packages (like entity packages); `*_registry.lua` become derived/generated; the asset registry's machine-data fully separated from the shader-schema Lua. More consistent with entity packages and retires the hand-edited god-files, but a much larger restructure (new disk format + runtime-loading changes + the asset split). **Not required for durability — D1 achieves that.** Sequenced as a deliberate follow-up.

## Key decisions
1. **How far:** D1 only (disk-authoritative catalog — durability, reuses everything, keeps `.lua`) vs D1 + D2 (also retire the god-files / full content-package restructure). Recommendation: D1 first; D2 as a deliberate follow-up once D1 ships durability.
2. **Format:** keep the `.lua` write-back (reuse codecs, minimal disruption) vs migrate registry data to JSON packages (consistency, bigger). Recommendation: keep `.lua` for D1.
3. **Freeze removal:** confirm making disk always-authoritative for the catalog (no "DB wins after first publish") is acceptable for the runtime (replication catalog polling, hot-reload).
4. **Cutover migration:** the one-time export of current DB-published content to disk, run before disk-authoritative takes effect.

## Phased plan (D1)
- **D1a** — one-time DB→disk export: migrate current dashboard-published catalog documents to their disk files.
- **D1b** — publish writes to disk (atomic, confined; reuse encoders + asset splice): the commit point moves to disk.
- **D1c** — DB catalog becomes a derived cache (boot re-seed from disk; remove the freeze; drafts ephemeral) + a wipe-survival test (mirror `content_package_seed_wipe`).
- **D1d** — verify runtime (replication/gateway/client) loads from the disk-derived catalog; prove a dashboard-created sprite survives `pg-reset`.

## Risks / guardrails
- Atomic, path-confined disk writes (`PackageWriter` safety; symlink rejection, temp+fsync+rename).
- The cutover migration MUST run before disk-authoritative (else the first boot re-seeds from disk and loses DB-only edits).
- Preserve the runtime catalog-load contract + cross-registry validation (ships need modules+assets).
- Assets: preserve the hand-authored shader Lua (splice, never re-render).
- No dashboard Lua parsing; the gateway owns all Lua generation (WS1).
