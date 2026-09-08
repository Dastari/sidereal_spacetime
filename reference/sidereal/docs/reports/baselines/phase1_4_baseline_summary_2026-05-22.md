# Phase 1.4 Baseline Summary - 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.4 Baseline Summary - 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md`
- `docs/reports/baselines/phase1_uplink_conditioned_baseline_2026-05-22.md`
- `docs/reports/baselines/phase1_3_chaos_baseline_2026-05-22.md`

## 0. Status Notes

2026-05-22 status note:

1. The headless DR-0040 development host captured a tier-100 post-Phase-1 movement-only run, but it failed the SLO gate with host CPU pinned at `100%`.
2. The tier-100 result is retained as a CPU-ceiling finding, not a passed Phase 1.4 baseline.
3. Tier-250 and tier-500 are deferred to the user's local machine per `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md`.
4. Native/WASM impact: reporting only. No runtime behavior changes are made by this summary.

2026-06-03 reconciliation note:

1. Phase 8 is closed for migration correctness, but Phase 1.4 remains only partially complete for capacity evidence.
2. The current Lightyear fork pin is `a1eece4c64c30bda3b476b744dc9c2a6af2f8573`; older `0192db9c...` references in the Phase 1 docs are historical.
3. The first required local-machine step is now a clean tier-100 sanity run on non-saturated hardware. If tier-100 cannot pass the SLO gate there, tier-250/tier-500 captures should be treated as hardware diagnostics rather than Sidereal scaling evidence.
4. The broader reconciliation is recorded in `docs/reports/reconciliation/distribution_plan_reconciliation_2026-06-03.md`.

## 1. Current Baseline State

| Tier | Status | Artifact |
|---|---|---|
| 100 | Captured on headless host; failed SLO gate | `docs/reports/baselines/load_baselines/2026-05-21_phase1/clean/20260522_075724_movement_only_100c/` |
| 250 | Pending local-machine capture | `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_250_movement_only/` |
| 500 | Pending local-machine capture | `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_500_movement_only/` |

## 2. Tier-100 Headless Result

| Field | Value |
|---|---:|
| Git HEAD at capture | `2c71348` |
| Worktree dirty during capture | `true` |
| Host | no-GPU headless host, 8 cores / 32 GB RAM |
| Workload | `movement_only` |
| Target clients | `100` |
| Gate mode | `slo` |
| `mmo_load_gate_pass` | `false` |
| `metrics_session_count` | `83` |
| `metrics_fixed_tick_last_wall_ms_p95` | `31.239532349999987` |
| `metrics_input_oldest_age_ms_p95` | `236631.76053899998` |
| `metrics_persistence_pending_latest_age_s_p95` | `0` |
| `metrics_shard_degraded_p95` | `1` |
| `metrics_lightyear_replication_sent_payload_bytes_per_client_s` | `2313.8715` |
| `metrics_lightyear_replication_bandwidth_limited_messages_total` | `0` |
| `metrics_host_cpu_global_usage_percent_p95` | `100` |

Interpretation:

1. This host is CPU-bound at tier-100, so tier-250 and tier-500 would measure host saturation rather than Sidereal scaling.
2. Persistence backlog was not the limiting factor: `metrics_persistence_pending_latest_age_s_p95=0`.
3. Lightyear bandwidth limiting did not engage: `metrics_lightyear_replication_bandwidth_limited_messages_total=0`.
4. The available committed pre-evidence comparison is `2425.3961` bytes/client/s in `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_movement_only_pre_evidence.md`. The post-Phase-1 headless value here is `2313.8715` bytes/client/s, which is not a 2x reduction. Because both captures are from the same dirty SHA and the pre-evidence file is not a clean pre-delta baseline, the Phase 1.1 2x wire-shape acceptance check remains unresolved until the correct pre-Phase-1.1 baseline is identified or recaptured.

## 3. Local-Machine Captures Pending

Run the commands in `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md` from the local machine:

1. Tier-100 sanity check. If it fails, do not treat tier-250 or tier-500 as meaningful scaling baselines.
2. Tier-250 movement-only SLO capture.
3. Tier-500 movement-only SLO capture.

For each tier, copy only the gate JSON, gate TXT, and `phase0_headless_summary_*.txt` into the committed baseline directory. Raw logs remain under `data/debug/`.

When local tier-250/tier-500 sections are added, keep this caveat with those sections:

> **Captured on local hardware, not on the headless DR-0040 development host.** The headless host saturates CPU at the tier-100 workload; tier-250 and tier-500 there would measure host capacity, not Sidereal scaling. These baselines are valid for the local machine specs recorded above. Comparable production-hardware baselines remain a separate, future deliverable.

## 4. Open Phase 1.4 Items

1. Capture and commit the local-machine tier-250 and tier-500 summaries.
2. Re-evaluate `metrics_lightyear_replication_sent_payload_bytes_per_client_s` against a valid pre-Phase-1.1 baseline.
3. Check tier-500 `metrics_visibility_apply_worklist_over_budget_entities` and observer-candidate soft overrun metrics. If overrun is nonzero, add the follow-up file requested by the local-machine handoff.
4. Check tier-500 `metrics_persistence_pending_latest_age_s_p95` against the 5 second SLO. If violated with CPU headroom, file the persistence-tier follow-up.

## 5. Production-Hardware Caveat

The high-tier baselines are not complete yet. Once the local-machine captures are added, close the report with the production-hardware caveat required by the handoff prompt.
