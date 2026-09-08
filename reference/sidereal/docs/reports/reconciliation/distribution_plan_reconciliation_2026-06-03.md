# Distribution Plan Post-Phase-8 Reconciliation

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Distribution Plan Post-Phase-8 Reconciliation.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/reports/reconciliation/phase_8_dynamic_load_migration_closure_2026-06-02.md`
- `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md`
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`

## 0. Status Notes

2026-06-03 reconciliation:

1. Phases 0-8 are treated as closed for implementation correctness. Phase 9 remains a post-Phase-8 placeholder for NPC lifecycle implementation.
2. The plan is correctness-validated, not production-capacity-validated. Clean non-saturated tier-100/tier-250/tier-500 baseline evidence is still required before making capacity claims.
3. Current workspace Lightyear pin is `a1eece4c64c30bda3b476b744dc9c2a6af2f8573`, not the older `0192db9c9235f807f170c0f7400dd55099a41447` cited by early Phase 1 notes. The older references are historical.
4. Lossy motion quantization is not implemented. DR-0040 permits it only for the runtime motion-replication payload class after a per-entity `ShardRegion` reference exists on the wire. It remains a bandwidth optimization decision, not an unclosed Phase 8 blocker.
5. Phase 8 closed on structural source retirement and synthetic-load deactivation, not the original strict numeric 25% per-region p95 improvement. Per-region load-shedding SLOs remain future production-threshold work.
6. Split remains deferred to a follow-up DR. Phase 8 landed migrate-only.

## 1. Current Fork State

`Cargo.toml` currently pins:

```toml
lightyear = { git = "https://github.com/Dastari/lightyear", rev = "a1eece4c64c30bda3b476b744dc9c2a6af2f8573", ... }
```

Implications:

- Phase 1.1's `0192db9c...` references are historical evidence for the original delta/keyframe and retained-delta-base carry.
- Phase 7's note that the PR #1476 input-authorization carry was deferred is stale. That fork bump has happened by the current pin.
- The remaining Phase 7 cleanup item is Sidereal-side cleanup of defensive code that only existed for the abandoned single-connection retarget design. It is not a fork-pin blocker.

## 2. Deferred Items That Still Matter

| Item | Current status | Why it matters |
|---|---|---|
| Clean tier-100/tier-250/tier-500 baselines | Not complete | Confirms capacity headroom and validates migration/cadence thresholds on non-saturated hardware. |
| Lossy motion quantization | Not implemented | Potential bandwidth win if lossless delta + cadence control are insufficient. Must preserve DR-0035/DR-0040 f64 authority outside the narrow motion-wire exception. |
| Per-class send-frequency defaults | Wired but default-off | Needs a non-saturated tier-250 capture before enabling `DYNAMIC`/`STATIC` defaults. |
| Split follow-up DR | Not written | Phase 8 intentionally landed migrate-only; non-uniform/split region routing needs a separate design record. |
| Production-hardware baselines | Not started | Local-machine baselines are useful engineering evidence, but instance sizing and production SLOs need representative deployment hardware. |

## 3. Capacity Baseline Plan

The first clean capacity pass should run on a machine that does not saturate CPU at tier-100. The existing handoff is `docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md`; this section summarizes the expected sequence.

### 3.1 Host Requirements

- Build and run against release binaries, not debug.
- CPU: enough headroom for tier-100 with `metrics_host_cpu_global_usage_percent_p95` below the gate target. For tier-250, use at least an 8-core/16 GB machine with little background load; for tier-500, prefer 16 physical cores and 32 GB+ RAM.
- Disk: at least 5 GB free for `data/debug/mmo_synthetic_load/`.
- Database: local Postgres/AGE up and reachable at the configured `DATABASE_URL`.
- Current checkout: record `git rev-parse HEAD` in the summary so future comparisons know exactly what ran.

### 3.2 Run Order

Run tier-100 first as a sanity check. If it does not pass the SLO gate, tier-250/tier-500 are hardware-saturation diagnostics rather than meaningful Sidereal capacity baselines.

```bash
SIDEREAL_MMO_LOAD_CLIENTS=100 \
SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
SIDEREAL_MMO_LOAD_DURATION_S=300 \
SIDEREAL_MMO_LOAD_GATE_MODE=slo \
bash scripts/run_mmo_synthetic_load_tier.sh
```

Then run tier-250:

```bash
SIDEREAL_MMO_LOAD_CLIENTS=250 \
SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
SIDEREAL_MMO_LOAD_DURATION_S=300 \
SIDEREAL_MMO_LOAD_GATE_MODE=slo \
bash scripts/run_mmo_synthetic_load_tier.sh
```

Tier-500 should be captured even if tier-250 fails, but a failing tier remains a real failed finding:

```bash
SIDEREAL_MMO_LOAD_CLIENTS=500 \
SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
SIDEREAL_MMO_LOAD_DURATION_S=300 \
SIDEREAL_MMO_LOAD_GATE_MODE=slo \
bash scripts/run_mmo_synthetic_load_tier.sh
```

The script creates timestamped output under `data/debug/mmo_synthetic_load/<stamp>_movement_only_<tier>c/`. Commit only the gate JSON, gate TXT, and `phase0_headless_summary_*.txt` summaries under `docs/reports/baselines/load_baselines/2026-05-21_phase1/`; leave raw logs in `data/debug/`.

### 3.3 Metrics To Record

For each tier, record:

- `mmo_load_gate_pass`
- `metrics_session_count`
- `metrics_clients_with_recent_activity`
- `metrics_fixed_tick_last_wall_ms_p95`
- `metrics_input_oldest_age_ms_p95`
- `metrics_persistence_pending_latest_age_s_p95`
- `metrics_shard_degraded_p95`
- `metrics_lightyear_replication_sent_payload_bytes_per_client_s`
- `metrics_lightyear_replication_bandwidth_limited_messages_total`
- `metrics_host_cpu_global_usage_percent_p95`

Useful interpretations:

- If tier-100 fails with host CPU near saturation, the hardware is not suitable for capacity baselines.
- If CPU has headroom but `metrics_shard_degraded_p95=1`, capture `shard_degraded_reasons` from `/health/replication` during the run.
- If persistence age exceeds the SLO while CPU has headroom, open a persistence-tier follow-up.
- If bandwidth-limited messages become nonzero, revisit send-frequency defaults and quantization.

## 4. Production Readiness Interpretation

Phase 8 proves the dynamic migration machinery can observe load, plan/dispatch commands, execute handoff, flip the gateway route, retire the source region, and apply admission/cadence fallback. It does not prove the production capacity envelope.

Before using this system for production sizing, capture representative production-hardware baselines separately from the local-machine developer baselines. Production sizing needs instance class, cores per shard, memory budget, network RTT, and workload mix recorded alongside the metrics.
