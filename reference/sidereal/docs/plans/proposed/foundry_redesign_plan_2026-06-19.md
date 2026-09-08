# /foundry Layout Redesign + Sprite & Code Authoring Plan

Status: Proposed
Lifecycle: proposed
Category: plan
Last updated: 2026-06-19
Owners: dashboard + content authoring + gateway
Scope: Redesign of the `/foundry` entity-composer layout, plus a new in-foundry pixel sprite editor and tighter hooks authoring.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/plans/proposed/authoring_dashboard_frontend_plan_2026-06-17.md

## Context
Redesign of the `/foundry` entity-composer layout, plus a new in-foundry pixel sprite editor and tighter hooks authoring. Builds on the shipped `/foundry` (F0–F5) and the composer restructure (P1b, merged). Companion to `authoring_dashboard_frontend_plan_2026-06-17.md`.

## Locked decisions
1. **Sprite/asset storage** — disk "asset packages" under `data/content/assets/<asset_id>/` (PNG + manifest), written by the atomic, path-confined `engine-content` `PackageWriter` (DR-0053 disk-as-source-of-truth; content-hashed; survives DB wipes). New `POST /admin/assets/{id}` gateway endpoint. `entity.json` `visual.sprite` references `asset_id`.
2. **Handler injection** — SERVER-SIDE only. The dashboard must never parse Lua (`check-no-dashboard-lua-parsing`). A gateway endpoint inserts the handler stub into `hooks_lua` at the correct place and returns the new text + a cursor line; `422` if the existing Lua is invalid. The dashboard swaps to the Code tab and scrolls to the cursor.
3. **Pixel editor** — use `dotting@2.1.13` (MIT, zero runtime deps, ~27 KB gzipped, fully TypeScript, embeddable controlled React component with no built-in chrome → themed via a shadcn wrapper). Adapters to add: eyedropper (hovered-pixel color), PNG import (decode → `setData`), color round-trip normalization (`#rrggbbaa`). Start Phase 3 with a spike validating `getForegroundCanvas()` export resolution, color fidelity, and the Vite worker build. Fallback if unworkable: `react-konva` (hand-rolled).

## Requested changes (source)
- Left packages panel → compact tree view (like game-world tree), not big panels.
- Add-component dropdown → scrollable / load-more (not 5-then-search).
- Multi-value schema fields (RGB/XYZ/LWH) → inputs aligned horizontally when they fit, stacked when too narrow.
- "New Package" → small icon button right of the "ENTITY PACKAGES" header.
- Remove the right panel; move publish/validate/delete to icon buttons in the composer header.
- Composer header shows the package title (not "Composer"); badges as the subheading.
- Hooks & Events move into the same panel as Components; both collapsible sections.
- Visuals/map-icon/shaders move to the top, with name/tags/labels.
- Selecting a sprite/shader allows uploading a sprite (new API surface).
- The old hooks/right area becomes a large pixel image editor (author sprites; upload/resize images) with a Code-editor tab.
- handler_name inputs get a "new handler" affordance that injects a stub into hooks.lua and jumps to it in the Code editor.

## Scope (grouped)
- **A. Layout refactor** — frontend only.
- **B. Pixel sprite editor + sprite upload** — new backend (asset write) + large frontend.
- **C. Handler authoring** — server-side Lua-edit endpoint + UI flow.

## Phased plan
**Phase 1 — Layout refactor**
- P1b ✅ (merged `fadedc41`): composer restructure — header title/badges/action-icons, Visuals to top, collapsible Components + Hooks-wiring, right Tabs (Code tab + Sprite `TODO(P3)` seam), removed detail/right panels.
- P1a: catalogue → tree view + small icon "New" button.
- P1c: scrollable add-component dropdown; horizontal multi-value (RGB/XYZ/LWH) inputs (prefer a shared schema-form improvement, guarded by inspector tests).

**Phase 2 — Sprite upload**
- P2: gateway `POST /admin/assets/{id}` (PackageWriter, atomic, path-confined) + Visuals picker gains upload.

**Phase 3 — Pixel image editor**
- P3: `dotting`-based sprite editor (spike → full) in the right Sprite tab; import + resize + draw tools (pencil/fill/erase/eyedropper/select) + export PNG → save to asset (reuses P2).

**Phase 4 — Handler authoring**
- P4: server-side handler-insert endpoint + the "new handler" flow (inject → swap to Code tab → scroll to cursor).

## Risks / guardrails
- Do not regress the live inspector (the component schema-form is reused via the existing synthetic-node adapter; leave `components/sidebar/inspector/**` untouched).
- No dashboard Lua parsing — handler injection is server-side; `hooks.lua` stays opaque in the Code editor.
- Sprite writes go through the path-confined `PackageWriter` (symlink rejection, atomic temp+rename).
- `dotting` maintenance staleness (~15 months) — MIT + zero-dep makes it forkable insurance.

## Status
P1b done; P1a in progress.
