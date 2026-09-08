# Target Intel and Scanner Disclosure Contract

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-06-16
Owners: gameplay + replication + client runtime
Scope: How target-panel intel is disclosed and gated by scanner tier and target counter-measures.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- `docs/features/proposed/tactical_sensor_ring_design_proposal.md`
- `docs/plans/superseded/scan_intel_minimap_spatial_plan_2026-03-05.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/plans/completed/target_selection_system_v1_plan_2026-06-11.md`

## 0. Implementation Status

2026-06-16: Active scan implemented (server-authoritative grant evaluator,
`bins/sidereal-replication/src/replication/target_selection.rs`). On an authorized scan the server
resolves the observer scanner tier (§2 ladder) into eligible field-scopes, subtracts the target's
`ScanResistance` counter-measures (pierced when observer tier ≥ `min_tier_to_pierce`), bypasses
gating for owned targets, issues `ScanIntelGrants` (snapshot, ~30s TTL; server-only, not persisted),
and returns `status = "ok"` with `disclosed_field_scopes` plus a typed owner-only
`ScanDisclosurePayload` (physical / combat / cargo summary / cargo manifest / systems). Unauthorized
scopes are never serialized. Separately, distant `TacticalContact`s are now scanner-tier redacted
server-side via a centralized helper (relationship < IFF; true kind/icon < Classified;
velocity/heading < Telemetry). The client surfaces a scanned summary on the target panel. Deferred
(Phase C): continuous stream grants and relation-derived tactical classification.

2026-06-11: Passive tier-gated disclosure is implemented in the target info panel
(`bins/sidereal-client/src/runtime/target_selection.rs`).

## 1. Principle

A target panel never invents intel from raw private ECS data. It shows only what the observer's
scanner is authorized to disclose. Disclosure has two layers:

1. **Passive disclosure** — what the controlled entity's scanner tier reveals just by having the
   target in sensor/visibility range (no active action).
2. **Active scan** — an explicit action that requests elevated field-scope grants beyond the passive
   tier, bounded by scanner capability and denied by target counter-measures.

Owned targets bypass all gating (full detail, consistent with the owner asset manifest).

## 2. Observer capability ladder

`ScannerComponent.detail_tier ∈ { Basic, Iff, Classified, Telemetry }`, resolved from the controlled
entity's best scanner profile (root or mounted module). `level: u8` is a finer gate used by active
scan. The client reads the resolved profile from `ActiveScannerProfileCache`; the server resolves the
same source set in `bins/sidereal-replication/src/replication/tactical.rs`.

## 3. Passive disclosure → target-panel rows

| Tier | Panel rows disclosed (cumulative) |
| --- | --- |
| Basic | Identity: name, type/hull span, distance/bearing |
| Iff | + Relationship / faction marker |
| Classified | + Hull / health status |
| Telemetry | + Velocity / heading |

Notes:

1. This is the **clicked-target panel** mapping. It is intentionally less strict than the distant
   tactical-contact matrix in the sensor-ring proposal §7 (a clicked target is already in view, so
   basic identity is disclosed). Distant tactical blips remain governed by the sensor-ring matrix.
2. Undisclosed rows render as locked (e.g. `— scan required`), never blank-guessed or inferred.
3. For non-owned in-bubble entities, the client may read Public components it already received
   (name, faction, size, position) but must still gate **display** by tier; relationship/telemetry
   are not shown below their tier even when the data is locally present.

## 4. Disclosure source per regime

- **Owned target** — full detail, gating bypassed.
- **In local-bubble (replicated, not owned)** — identity from Public components; relationship/
  telemetry gated by tier.
- **Tactical-only (out of delivery range, scanner/signal detected)** — from the scanner-tier-redacted
  `TacticalContact`.
- **No contact** — last-known cached snapshot with a stale indicator.

## 5. Active scan + counter-measures (deferred)

Scan elevates disclosure by issuing a server-side scan-intel grant `(observer, target, field_scope,
expiry)` (scan-intel plan §2) for field-scopes
`physical_public | combat_profile | cargo_summary | cargo_manifest | systems_detail`. Caps:

1. Scanner `detail_tier`/`level` bounds which field-scopes a scan can unlock.
2. **Target counter-measures** can deny a field-scope regardless of scanner tier — e.g. "reinforced
   shielded cargo holds" deny `cargo_summary`/`cargo_manifest`. Model as a future target-side
   component `ScanResistance { denied_field_scopes, min_tier_to_pierce }`.
3. Unauthorized field-scopes are never serialized.

Implemented 2026-06-16: the grant evaluator (scan-intel plan §6) and `ScanResistance` ship as
snapshot grants (`ScanIntelGrants`, server-only, ~30s TTL). The scanner-tier→field-scope ladder is
`physical_public` (Basic) → `+combat_profile` (IFF) → `+cargo_summary`,`+systems_detail`
(Classified) → `+cargo_manifest` (Telemetry); tunable. Continuous **stream** grants remain deferred
(Phase C).

## 6. Security invariants

1. Selection and scan authorization are server-owned and bound to authenticated session identity;
   spoofed `player_entity_id` is rejected.
2. Selection requires the target be owned or currently visible to the client; the client cannot widen
   this.
3. `SelectedEntityGuid` and scan results are `OwnerOnly` — never in tactical/faction/ghost lanes.
