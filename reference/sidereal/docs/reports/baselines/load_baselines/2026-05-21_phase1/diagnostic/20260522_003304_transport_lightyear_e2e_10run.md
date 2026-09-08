# Phase 1.3 Transport E2E Flake Audit - 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.3 Transport E2E Flake Audit - 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/reports/baselines/phase1_3_chaos_baseline_2026-05-22.md`

## 0. Status Notes

2026-05-22 status note:

1. Ran 10 consecutive serial executions of `transport_lightyear_e2e`.
2. Result: 10/10 passed, 0 flakes.
3. This is headless-only evidence. It does not cover GPU/native perceptual validation, WASM client smoke, or server-outbound/downlink conditioning.

## 1. Command

```bash
cargo test -p sidereal-replication --test transport_lightyear_e2e -- --test-threads=1 --nocapture
```

The command was run in a shell loop for 10 consecutive iterations.

## 2. Environment

- Commit: `2c71348fae101eed775a7ae675b663f1256c810b`
- Worktree dirty: yes
- Raw log: `data/debug/phase1_chaos_flake_audit/20260522_003304_transport_lightyear_e2e_10run.log`
- Test DB: available; tests did not skip
- Link-conditioner coverage: server receive-path / uplink only

## 3. Results

| Run | Result | Test Time |
|---:|---|---:|
| 1 | pass | 87.36 s |
| 2 | pass | 22.65 s |
| 3 | pass | 21.28 s |
| 4 | pass | 21.83 s |
| 5 | pass | 22.20 s |
| 6 | pass | 21.93 s |
| 7 | pass | 22.24 s |
| 8 | pass | 21.71 s |
| 9 | pass | 22.16 s |
| 10 | pass | 21.54 s |

## 4. Notes

- Run 1 includes cold internal runtime-binary build cost from the e2e helper.
- Warm test time settled around 21-23 s for the full 6-test file.
- No packet-loss/jitter flake was observed across the 10-run serial audit.
