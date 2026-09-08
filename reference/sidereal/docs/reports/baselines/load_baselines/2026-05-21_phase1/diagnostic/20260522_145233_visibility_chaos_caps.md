# Phase 1.3 Visibility Chaos Hard-Cap Capture - 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.3 Visibility Chaos Hard-Cap Capture - 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Status Notes

2026-05-22 status note:

1. The previously empty `chaos_caps_off/` and `chaos_caps_on/` evidence directories now have committed summary artifacts.
2. The first caps-off attempt failed before measurement because the phase0 auto-seed helper did not pass `ASSET_ROOT` into `seed_phase0_character` while using an isolated temp scripts root. `scripts/capture_phase0_dense_baseline.sh` now passes `ASSET_ROOT="$REPLICATION_ASSET_ROOT"` for auto-seed.
3. Both completed captures used tier-100 `visibility_churn`, 5% receive-path packet loss, 50 ms jitter, and smoke gating. Both produced observability samples and hard-cap metrics, but both reported `baseline_complete=false` because legacy log-line assertions were not present under this noisy headless run.
4. The host was CPU saturated (`mmo_load_host_cpu_global_usage_percent_p95=100`) and unrelated cargo work was observed during the caps-off run. Treat these captures as cap-accounting evidence only, not SLO or throughput acceptance.

## 1. Artifact Paths

| Pass | Artifacts |
|---|---|
| Caps off | `docs/reports/baselines/load_baselines/2026-05-21_phase1/chaos_caps_off/20260522_145233_visibility_churn_100c/` |
| Caps on | `docs/reports/baselines/load_baselines/2026-05-21_phase1/chaos_caps_on/20260522_150134_visibility_churn_100c/` |

Committed artifacts are the MMO gate `.txt`/`.json` files and the Phase 0 summary `.txt` files. Per-client, seed, build, replication, and gateway raw logs were intentionally pruned to match the existing concise-baseline convention.

## 2. Run Shape

Shared settings:

- `SIDEREAL_MMO_LOAD_CLIENTS=100`
- `SIDEREAL_MMO_LOAD_WORKLOAD=visibility_churn`
- `SIDEREAL_MMO_LOAD_DURATION_S=60`
- `SIDEREAL_MMO_LOAD_GATE_MODE=smoke`
- `SIDEREAL_MMO_LOAD_EXTRA_CLIENT_DISABLE_INPUT=0`
- `SIDEREAL_PHASE0_AUTO_SEED_CHARACTER=1`
- `SIDEREAL_PHASE0_AUTO_SEED_EXTRA_CHARACTERS=1`
- `SIDEREAL_PHASE0_WORLD_SCENARIO=multi_sector_far_fields`
- `SIDEREAL_PHASE0_ASTEROID_FIELD_COUNT=150`
- `SIDEREAL_VISIBILITY_DELIVERY_RANGE_M=250000`
- `SIDEREAL_REPLICATION_LINK_CONDITIONER_LOSS_RATIO=0.05`
- `SIDEREAL_REPLICATION_LINK_CONDITIONER_LATENCY_MS=0`
- `SIDEREAL_REPLICATION_LINK_CONDITIONER_JITTER_MS=50`
- `SIDEREAL_REPLICATION_LINK_CONDITIONER_DROP_PATTERN=uniform`

Hard-cap deltas:

| Pass | Entity hard budget | Cell hard budget |
|---|---:|---:|
| Caps off | unset / `0` metric | unset / `0` metric |
| Caps on | `25` | `4` |

## 3. Hard-Cap Evidence

| Metric | Caps off | Caps on |
|---|---:|---:|
| `server_auth_bound` | 94 | 80 |
| `observability_samples_total` | 23548 | 30618 |
| `metrics_input_accepted_total` | 57587 | 132633 |
| `metrics_input_drop_total` | 0 | 0 |
| `metrics_visibility_observer_candidate_entity_hard_budget` | 0 | 25 |
| `metrics_visibility_observer_candidate_cell_hard_budget` | 0 | 4 |
| `metrics_visibility_observer_candidate_entity_hard_cap_clients` | 0 | 80 |
| `metrics_visibility_observer_candidate_cell_hard_cap_clients` | 0 | 80 |
| `metrics_visibility_observer_candidate_entities_hard_capped_total` | 0 | 103850 |
| `metrics_visibility_observer_candidate_cells_hard_capped_total` | 0 | 21101 |
| `metrics_visibility_observer_candidate_entities_max` | 1402 | 25 |
| `metrics_visibility_observer_candidate_cells_max` | 2601 | 4 |
| `metrics_visibility_cell_dirty_worklist_dirty_cells_max` | 2702 | 13 |
| `metrics_visibility_cell_dirty_worklist_dirty_entities_max` | 1402 | 1401 |
| `metrics_lightyear_replication_sent_payload_bytes_total` | 84770814 | 9601906 |
| `metrics_lightyear_replication_actions_queue_depth_max` | 1842 | 27 |
| `metrics_lightyear_replication_updates_queue_depth_max` | 276 | 15 |

Interpretation:

- The hard-cap drop/accounting path is exercised under load. With budgets `25` entities and `4` cells, every authenticated client in the caps-on run hit both caps, and capped totals advanced.
- The cap clamps the post-cap maxima exactly to the configured budgets (`25` entities, `4` cells), while the caps-off run reached `1402` entities and `2601` cells.
- The payload and queue-depth reductions are useful directional evidence, but they are not an acceptance metric here because active authenticated clients differed and the host was CPU saturated.
- The `visibility_observer_candidate_*_last` log-scraped summary fields are `n/a` in both runs because the textual visibility summary lines were not emitted. The observability metric fields above are present and are the evidence source for this report.

## 4. Remaining Gaps

1. These captures close the specific empty-directory evidence gap for observer-candidate hard-cap accounting.
2. They do not validate tier-100 SLO performance, tier-250/tier-500 performance, or downlink/server-outbound conditioning.
3. Rearm-rate validation remains ambiguous unless rerun under a controlled same-conditions before/after workload. Current rolling-join numbers should stay documented as churn evidence, not proof of an 80% runtime reduction.
