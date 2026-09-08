# Phase 1.4 High-Tier (tier-250 / tier-500) Load Baselines — Local Machine Handoff

Status: Active
Lifecycle: handoff-open
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Phase 1.4 High-Tier (tier-250 / tier-500) Load Baselines — Local Machine Handoff.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Why this runs locally, not on the headless host

The headless DR-0040 development host already failed the tier-100 SLO gate with the host CPU pinned at 100% during the 2026-05-22 clean baseline:

- `metrics_input_oldest_age_ms_p95 = 236631 ms` (SLO 50 ms; missed by ~4700x)
- `metrics_fixed_tick_last_wall_ms_p95 = 31.24 ms` (SLO 8 ms; missed by ~4x)
- `metrics_host_cpu_global_usage_percent_p95 = 100%`
- `metrics_shard_degraded_p95 = 1` (sustained degraded)

Source: `docs/reports/baselines/load_baselines/2026-05-21_phase1/clean/20260522_075724_movement_only_100c/phase0_headless_summary_20260521_215951.txt`.

Running tier-250 or tier-500 on this host would measure the host's CPU ceiling, not Sidereal's scaling behaviour at those tiers. The captures would be noise-dominated, the SLO gate would fail for hardware reasons, and the resulting numbers would be useless for the Phase 1.4 acceptance criteria. The plan §2.4 acceptance criterion #2 ("All three baselines pass current SIDEREAL_MMO_LOAD_*_SLO gates") cannot even be evaluated under those conditions.

This handoff exists so the user's local machine — which has the CPU headroom to actually exercise the simulation under tier-250 / tier-500 load — can complete the missing portion of the §2.4 baseline set without the headless agent fabricating numbers.

## 1. Prerequisites on the local machine

- Recent clone of Sidereal at HEAD of `main`. Verify with `git rev-parse HEAD` and record the value in `docs/reports/baselines/phase1_4_baseline_summary_2026-05-22.md` when adding the local-machine sections.
- Current Lightyear fork pin at `a1eece4c64c30bda3b476b744dc9c2a6af2f8573` (already pinned in `Cargo.toml`). Older `0192db9c...` references in Phase 1 evidence are historical.
- Local Postgres 15+ reachable at `DATABASE_URL` (or the script's default `postgres://sidereal:sidereal@127.0.0.1:5432/sidereal`).
- Free disk space ≥ 5 GB for `data/debug/mmo_synthetic_load/`. Per-tier raw artifact directories grow with `metrics_host_cpu_global_usage_percent` correlated logs.
- `CARGO_INCREMENTAL=0 cargo check -p sidereal-replication -p sidereal-client -p sidereal-gateway` succeeds before any capture begins. The load wrapper itself defaults to release binaries through `SIDEREAL_MMO_LOAD_CARGO_PROFILE=release`; do not override it to debug for capacity evidence.
- The local machine should have ≥ 16 physical cores and ≥ 32 GB RAM for tier-500 to be meaningful. tier-250 can be exercised on 8+ cores with 16+ GB if the host is not running other heavy processes.

## 2. Commands to run

Run all three captures from the repo root. Each captures into a separate timestamped `data/debug/mmo_synthetic_load/${STAMP}_movement_only_${TIER}c/` directory; the gate JSON summary becomes the committed artefact.

### 2.1 tier-100 (sanity check — must pass SLO gate)

```bash
SIDEREAL_MMO_LOAD_CLIENTS=100 \
SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
SIDEREAL_MMO_LOAD_DURATION_S=300 \
SIDEREAL_MMO_LOAD_GATE_MODE=slo \
bash scripts/run_mmo_synthetic_load_tier.sh
```

Purpose: confirm the local machine actually meets the tier-100 SLO before assuming tier-250 / tier-500 results are meaningful. The headless tier-100 baseline in `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_post_phase1/` is the documented comparison; the local tier-100 should be within run-to-run noise of it but must additionally pass `mmo_load_gate_pass=true`. If this fails on the local machine, do NOT proceed to tier-250 / tier-500: there is a local-host capacity problem, and that needs to be addressed (or the host swapped) before higher tiers are meaningful.

### 2.2 tier-250

```bash
SIDEREAL_MMO_LOAD_CLIENTS=250 \
SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
SIDEREAL_MMO_LOAD_DURATION_S=300 \
SIDEREAL_MMO_LOAD_GATE_MODE=slo \
bash scripts/run_mmo_synthetic_load_tier.sh
```

### 2.3 tier-500

```bash
SIDEREAL_MMO_LOAD_CLIENTS=500 \
SIDEREAL_MMO_LOAD_WORKLOAD=movement_only \
SIDEREAL_MMO_LOAD_DURATION_S=300 \
SIDEREAL_MMO_LOAD_GATE_MODE=slo \
bash scripts/run_mmo_synthetic_load_tier.sh
```

The script wraps `scripts/capture_phase0_dense_baseline.sh`, applies the default movement-only input scripts (`forward:<duration>` and `turn_left:<duration>`), uses isolated per-run Postgres clones (`SIDEREAL_PHASE0_ISOLATED_DATABASE=1 _MODE=empty`), and emits a gate JSON + text file alongside the raw `phase0_headless_summary_*.txt`. The link conditioner is intentionally off for these tiers (the conditioner is uplink-only; Phase 1.4 acceptance is about un-conditioned bandwidth/cpu headroom, not chaos coverage).

## 3. Expected artifact paths and commit

After each capture, copy the **summary** files (gate JSON, gate TXT, and `phase0_headless_summary_*.txt`) into the committed paths below. Raw client/replication/gateway/build logs stay under `data/debug/` (gitignored).

Per the plan §2.4 item 2 the **committed summary** for each tier lands at:

- `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_250_movement_only/` — copy from `data/debug/mmo_synthetic_load/<stamp>_movement_only_250c/`:
  - `mmo_load_gate_<stamp>.json`
  - `mmo_load_gate_<stamp>.txt`
  - `phase0_headless_summary_<stamp>.txt`
- `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_500_movement_only/` — copy from `data/debug/mmo_synthetic_load/<stamp>_movement_only_500c/`:
  - same three files

Do NOT commit raw `phase0_headless_replication_*.log` / `phase0_headless_client_*.log` / `phase0_headless_gateway_*.log` / `phase0_headless_build_*.log` files. They are large and reproducible.

Add a one-page markdown summary at `docs/reports/baselines/phase1_4_baseline_summary_2026-05-22.md` (the headless agent already created the tier-100 portion; the local-machine run extends it with the tier-250 / tier-500 sections) including for each tier:

1. Local machine specs (model, physical cores, RAM, OS) so future readers can attribute results to the host.
2. Git HEAD SHA at capture time.
3. `mmo_load_gate_pass` value (must be `true` for the tier to count as a passed baseline).
4. The SLO-critical metrics: `metrics_fixed_tick_last_wall_ms_p95`, `metrics_input_oldest_age_ms_p95`, `metrics_persistence_pending_latest_age_s_p95`, `metrics_shard_degraded_p95`, `metrics_lightyear_replication_sent_payload_bytes_per_client_s`, `metrics_lightyear_replication_bandwidth_limited_messages_total`, `metrics_host_cpu_global_usage_percent_p95`.
5. The Phase 1.1 wire-shape acceptance check: `metrics_lightyear_replication_sent_payload_bytes_per_client_s` at the 100 tier vs the pre-Phase-1.1 baseline (plan §2.1 acceptance #1 requires ≥ 2× drop with delta compression alone; capture the absolute value at all three tiers).
6. The Phase 1.2 acceptance check: `apply_worklist_over_budget_entities` at the 500 tier (plan §2.2 acceptance #2 expects 0 under hard caps). The hard caps are **default-off**; tier-500 here measures the SOFT-budget baseline. If `metrics_visibility_observer_candidate_entities_over_budget_total > 0` at tier-500, file a follow-up at `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_500_movement_only/<observer_candidate_soft_budget_overrun_if_needed>.md` documenting the overrun magnitude.
7. The Phase 1.4 acceptance check: `metrics_persistence_pending_latest_age_s_p95` at all tiers ≤ `SIDEREAL_REPLICATION_PERSISTENCE_PENDING_AGE_SLO_S` (default 5.0). If violated at tier-500, file the persistence-tier follow-up per plan §2.4 acceptance #3.

## 4. CPU-ceiling caveat to preserve in the report

Add this paragraph verbatim near the top of the tier-250 / tier-500 portion of `docs/reports/baselines/phase1_4_baseline_summary_2026-05-22.md`:

> **Captured on local hardware, not on the headless DR-0040 development host.** The headless host saturates CPU at the tier-100 workload; tier-250 and tier-500 there would measure host capacity, not Sidereal scaling. These baselines are valid for the local machine specs recorded above. Comparable production-hardware baselines remain a separate, future deliverable.

## 5. What to do if a tier fails the SLO gate

For each tier where `mmo_load_gate_pass=false`:

1. Record the failure reasons literally as printed by the script (these are the `gate_failure` lines in stderr; they also appear in the gate JSON's `mmo_load_*` fields whenever a max is configured).
2. Do **not** retry the same tier with relaxed SLOs to make it pass. Per the AGENTS.md "real evidence only" rule, a failed SLO at a tier is the finding for that tier; document the failure mode.
3. Continue to the next tier — a tier-250 failure does not block tier-500 from being captured (the tier-500 capture remains diagnostic and contributes to plan §2.4 acceptance #2 about hard-cap behaviour even if SLO fails).

## 6. Local-machine vs production-hardware caveat (verbatim)

Add this verbatim as the closing paragraph of `docs/reports/baselines/phase1_4_baseline_summary_2026-05-22.md`:

> These baselines were captured on the user's local development machine. They are NOT production-hardware baselines. Production sizing decisions (instance class, cores per shard, RSS budgets) must be captured separately on representative production hardware before being used to set operational SLOs. The current SLO gates (`SIDEREAL_MMO_LOAD_*_SLO`) were calibrated for the developer-laptop environment and should be re-evaluated against production hardware before capacity claims are made.

## 7. Post-capture validation gates

After committing the three tier summaries on the local machine, run from the repo root:

```bash
cargo fmt --all -- --check
git diff --check
bash -n scripts/capture_phase0_dense_baseline.sh scripts/run_mmo_synthetic_load_tier.sh
CARGO_INCREMENTAL=0 cargo test -p sidereal-replication
CARGO_INCREMENTAL=0 cargo clippy -p sidereal-replication -p sidereal-client --all-targets -- -D warnings
```

If full clippy is blocked by a separately documented pre-existing workspace baseline, record the exact file:line and run the narrowest package-level `--no-deps` clippy that still covers any files edited by the baseline report update. Do not relax the load evidence to make a failing tier pass.

All five must pass before commit. Commit message format (HEREDOC required):

```
docs: phase 1.4 tier-250 / tier-500 local-machine baselines

Captured on local hardware per docs/prompts/handoffs/open/phase1_4_high_tier_baselines_local_machine_handoff_2026-05-22.md
because the headless DR-0040 dev host CPU-saturates at tier-100. Gate-pass status, SLO metrics,
and host context recorded inline. Production-hardware baselines remain a separate Phase 5+ deliverable.
```

Replace the message body with the actual gate-pass status per tier.

## 8. Open questions / DR-0040 ambiguities to flag if encountered

- If tier-500 `metrics_persistence_pending_latest_age_s_p95` exceeds the SLO **and** the host has clear CPU headroom (`metrics_host_cpu_global_usage_percent_p95 < 80`), this is the first concrete evidence supporting plan §2.4's "filed persistence-tier follow-up; the Phase 3 service promotion may already address this". Record the observation in `docs/reports/baselines/phase1_4_baseline_summary_2026-05-22.md` and add a note to `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md` §2.4 acceptance-criterion #3 referencing the gate JSON path.
- If the tier-500 `metrics_lightyear_replication_bandwidth_limited_messages_total > 0`, this contradicts plan §2.4 acceptance #3 and indicates Lightyear's send budgeting is engaging under un-conditioned load — record the absolute value and the per-client byte rate alongside it.
- If `metrics_shard_degraded_p95 = 1` at any tier where `metrics_host_cpu_global_usage_percent_p95 < 80`, the degraded reasons (`shard_degraded_reasons`) need to be captured from the replication `/health/replication` endpoint mid-run. The capture script does NOT currently poll that endpoint; document this as a coverage gap rather than fabricating reasons.
