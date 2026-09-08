# Phase 8 Dynamic Load Migration Closure Evidence

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 8 Dynamic Load Migration Closure Evidence.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-02  
Status: Closure evidence for Phase 8 ledger flip  
Scope: Phase 8.5 degraded UI, degraded notification fanout, diagnostic load hook, migration-under-load e2e, and final regressions.

## Implemented Inputs

- `7cc5584` - 8.5a client admission-limited world-entry warning toast.
- `93df352` - 8.5b server-authored `shard_degraded` warning fanout through the existing notification lane.
- `4f1b2bb` - 8.5c diagnostics-gated, region-bound synthetic fixed-tick load hook.
- `670f802` - migration-aware persistence handoff snapshot validation for pre-route-flip target snapshots.
- `e9c25b1` - 8.5d `shard_migrate_under_load` e2e.
- `818ffe9` - deterministic controlled-root handoff e2e fixture seeding and non-skip assertion hardening.
- `80296e5` - closure-critical controlled-root e2e now refreshes and selects those deterministic fixtures directly instead of discovering arbitrary pre-existing auth rows.

## Final Regression Evidence

All commands were run from `/root/sidereal` with `CARGO_INCREMENTAL=0` where shown.

| Command | Result |
|---|---|
| `cargo test -p sidereal-replication --test transport_lightyear_e2e controlled_root_handoff_e2e -- --nocapture` | Passed: 1 passed, 0 failed, 12 filtered out, finished in 100.61s. Evidence: `handoffs=100`, `cutovers=100`, `entity_loss=0`, `entity_duplication=0`, `input_drop_total=0`, `stale_lease_epoch_drop_total=0`, `cutover_p95_ms=137.186`, `prepare_to_commit_p95_ms=79.608`, and all input-drop categories `a:0+b:0`. |
| `cargo test -p sidereal-replication --test transport_lightyear_e2e generalized_entity_handoff_e2e -- --nocapture` | Passed: 1 passed, 0 failed, 12 filtered out, finished in 68.39s. Evidence: `handoffs=3`, `concurrent_batch=2`, `handoffs_in_flight_high_water=2`, `commits_applied=3`, `prepare_to_commit_p95_ms=83.264`. |
| `cargo test -p sidereal-replication --test transport_lightyear_e2e shard_migrate_under_load -- --nocapture` | Passed: 1 passed, 0 failed, 12 filtered out, finished in 97.48s. |
| `cargo test -p sidereal-client admission` | Passed in both client lib and bin targets: 4 passed, 0 failed each; 8 total matching test executions. |
| `cargo test -p sidereal-client notification` | Passed in both client lib and bin targets: 5 passed, 0 failed each; 10 total matching test executions. |
| `cargo test -p sidereal-gateway admission` | Passed: 2 admission flow tests plus 10 load-coordinator admission tests; all other test binaries had 0 matching tests. |
| `cargo check -p sidereal-client -p sidereal-core -p sidereal-gateway -p sidereal-replication -p sidereal-persistence-service` | Passed. |
| `git diff --check` | Passed. |

## `shard_migrate_under_load` Evidence

The final run observed a real hot source region and completed the migration path:

- `migration_id=7a4c2f39-530d-82c5-8782-ab17b0849c68`
- `baseline_source_p95_ms=33.396`
- `post_retirement_source_p95_ms=17.552`
- `p95_drop_limit_ms=25.047`
- `structural_source_retired=true`
- `source_authoritative=0`
- `target_authoritative=1`
- `route_epoch=8`
- `target_owned_origin=true`

The p95 evidence is interpreted structurally for closure. The original Phase 8 acceptance text requested a source `fixed_tick_wall_ms_p95` reduction of at least 25%; the landed e2e now proves the source shard no longer owns region `(0,0)`, the source-side synthetic load becomes inactive after retirement, the gateway route flips to target shard 12 epoch 8, and the authoritative entity exists only on the target. The post-retirement p95 remains a rolling shard-wide health metric after ownership removal, not a stable per-region post-migration SLO. Strict per-region p95 SLO tuning remains future production threshold work.

## Client, Degraded, and Admission Evidence

Client admission/degraded surface evidence is covered by `cargo test -p sidereal-client admission` and `cargo test -p sidereal-client notification`. These verify admission metadata preservation, one warning toast enqueue, duplicate notification suppression, generic rejection fallback, and notification UI synchronization outside `InWorld`.

Server-authored degraded notification fanout is covered by the 8.5b implementation commit and the notification test suite added with that slice. Gateway admission API evidence is covered by `cargo test -p sidereal-gateway admission`, including denied world entry before bootstrap/token issuance and normal entry after admission reopening.

## Known Caveats

- Split remains deferred to a follow-up DR; Phase 8 closes on migrate-only behavior.
- The strict numeric 25% p95 drop is not claimed for closure. Structural source retirement and synthetic-load deactivation are the Phase 8.5d closure evidence.
- 2026-06-03 update: the unrelated shader, backdrop, asteroid, dashboard, tooling, and documentation edits mentioned during closure were later committed on `main` as `f66cc4f`. They were not part of the Phase 8 closure evidence.
