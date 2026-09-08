# Visibility Opt-In Interest Management Plan

Status: Superseded
Lifecycle: superseded
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Visibility Opt-In Interest Management Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-03-05 (refreshed)

Primary source-of-truth docs:
- `docs/features/active/visibility_replication_contract.md`
- `docs/decisions/dr-0017_dual_lane_replication_and_owner_asset_manifest.md`
- `docs/plans/superseded/scan_intel_minimap_spatial_plan_2026-03-05.md`

## 1. Purpose

This file now serves as rollout history + remaining work tracker.

Do not treat this as canonical contract wording.  
Canonical policy is in `visibility_replication_contract.md`.

## 2. Completed / Landed

1. Server-authoritative per-client visibility pipeline in fixed tick.
2. Spatial candidate preselection (`spatial_grid`) with fail-closed policy checks.
3. Player observer-anchor semantics (`camera <- player <- controlled(optional)`).
4. Dynamic client delivery-range signaling and server-side delivery narrowing.
5. Player-facing visibility debug components (`VisibilitySpatialGrid`, `VisibilityDisclosure`).

## 3. Active Remaining Work

1. Faction visibility scope completion and tests.
2. Component/field-level visibility/redaction enforcement using component metadata.
3. Scan-intel snapshot vs stream grant runtime enforcement.
4. Tactical lane + owner-manifest lane protocol/runtime completion.
5. Fog-of-war explored-cells + stale-intel product delivery hardening.

## 4. Explicit Non-Goals for This Plan File

1. Defining new canonical security semantics.
2. Replacing visibility contract docs.
3. Introducing architecture references that conflict with replication-first runtime.

## 5. Notes

If a behavior in this file conflicts with:

1. `visibility_replication_contract.md`, or
2. accepted/active DR docs,

then this file is considered outdated and must be updated or removed.
