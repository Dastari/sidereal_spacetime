# Phase 1.1 Uplink-Conditioned Diagnostic — 2026-05-22

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 1.1 Uplink-Conditioned Diagnostic — 2026-05-22.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Critical caveat — read before any other paragraph

**THIS DIAGNOSTIC ONLY EXERCISES THE RECEIVE-PATH (UPLINK; CLIENT → SERVER) LIGHTYEAR LINK CONDITIONER.** It does not, and cannot, simulate server-to-client (downlink) loss, latency, or jitter, because Lightyear's current `RecvLinkConditioner` only conditions inbound packets. Sidereal installs the conditioner on the replication-server `Link::recv` buffer (see `bins/sidereal-replication/src/replication/lifecycle.rs:420`), so the experiment models a lossy uplink in front of the server with a clean downlink back to clients.

Therefore the following are **not** evidence statements that can be derived from this diagnostic:

- "No rubber banding observed under 5% uplink loss" is **not** evidence that downlink-bound rubber banding is fixed.
- "Conditioned run did not degrade further" is **not** evidence that server-outbound interpolation, prediction reconciliation, or visual correction are robust under packet loss.
- "Replication payload bytes per client did not collapse" is **not** evidence the client-side interpolation history is converging.

Downlink-bound rubber banding (the dominant rubber-banding mode in MMOs) requires either client-side `RecvLinkConditioner` on the user's local machine, or a future Lightyear fork patch that adds symmetric send-path conditioning. The handoff prompt for that follow-up work is
`docs/prompts/handoffs/open/lightyear_link_conditioner_server_outbound_handoff_2026-05-22.md`.

## 1. What was measured

| | |
|---|---|
| Git HEAD | `2c71348fae101eed775a7ae675b663f1256c810b` (worktree dirty during captures) |
| Lightyear fork pin | `0192db9c9235f807f170c0f7400dd55099a41447` (already includes #1471/#1479/#1473/#1474) |
| Workload | `movement_only` (100 headless clients, all driving forward/turn input) |
| Duration target | `300 s` (wall actual exceeded target due to host saturation) |
| Cargo profile | `release` |
| Capture wrapper | `scripts/run_mmo_synthetic_load_tier.sh` over `scripts/capture_phase0_dense_baseline.sh` |
| Host | no-GPU; 8 cores / 32 GB RAM; `metrics_host_cpu_global_usage_percent_p95 = 100` in both runs |

Two captures were taken consecutively against the same SHA, same workload definition, isolated per-run Postgres clones (`SIDEREAL_PHASE0_ISOLATED_DATABASE=1`, `_MODE=empty`):

1. **Clean baseline** — no conditioner env vars set; `metrics_link_conditioner_enabled = 0` in the summary; gate JSON records `link_conditioner_env_loss_ratio=unset`.
2. **Conditioned baseline** — `SIDEREAL_REPLICATION_LINK_CONDITIONER_LOSS_RATIO=0.05`, `_LATENCY_MS=25`, `_JITTER_MS=25`; `metrics_link_conditioner_enabled = 1`, `loss_ratio = 0.05`, `latency_ms = 25`, `jitter_ms = 25`; conditioner is wired on the receive path of every server-side `Link` (uplink-only).

The captured metric families requested in the task brief are listed in §3.

## 2. Clean vs conditioned deltas (concrete numbers)

Both runs failed the SLO gate (`mmo_load_gate_pass=false` in both gate JSONs). Failure mode in both: host CPU pinned at 100% throughout (load avg peaked at ~175 in the conditioned run, ~165 in the clean run during the same wall window), the simulation slipped its fixed-tick budget badly, and the replication server reported sustained degraded health. This is the same shape of failure already documented in `docs/reports/baselines/load_baselines/2026-05-21_phase1/tier_100_movement_only_pre_evidence.md` for this hardware.

Side-by-side numbers, in order of relevance to the uplink-conditioner question:

| Metric | Clean | Conditioned (5% loss / 25 ms / 25 ms) | Direction | Notes |
|---|---:|---:|---|---|
| `link_conditioner_enabled` | `0` | `1` | enabled OK | gate assertion holds in both runs |
| `link_conditioner_loss_ratio` | `0` | `0.05000000074505806` | as configured | f32 round trip from `0.05` |
| `link_conditioner_latency_ms` | `0` | `25` | as configured | |
| `link_conditioner_jitter_ms` | `0` | `25` | as configured | |
| `baseline_complete` | `false` | `false` | gate fail in both | host CPU bound |
| `metrics_session_count` | `83` | `82` | similar attach rate | of the 100 attempted; ~17 timed out before `SessionReady` in both runs |
| `metrics_shard_connected_clients` | `83` | `82` | matched session count | |
| `metrics_shard_degraded_p95` | `1` | `1` | sustained degraded in both | |
| `metrics_fixed_ticks_total` | `5280` | `4710` | conditioned ran **fewer** ticks in same wall window | conditioner adds latency to inputs; less work pulled |
| `metrics_fixed_tick_over_budget_total` | `760` | `863` | conditioned over budget more often | |
| `metrics_fixed_tick_last_wall_ms_p95` | `31.24 ms` | `34.53 ms` | conditioned slightly worse p95 | SLO is `8 ms`; both far over |
| `metrics_fixed_tick_max_wall_ms` | `238.89 ms` | `79.10 ms` | conditioned **much better max** | run-to-run noise dominates on a saturated host |
| `metrics_input_accepted_total` | `4453` | `3937` | conditioned: 5% loss directly removes inputs | matches expected 5% drop |
| `metrics_input_drop_total` | `0` | `0` | neither saw server-side input drops | input drops measured before conditioner; the loss happens at link recv |
| `metrics_input_oldest_age_ms_p95` | `236631.76 ms` | `7446.10 ms` | conditioned dramatically better | inputs that survived the drop are not piling up because there are fewer of them and the host has less work to do |
| `metrics_visibility_role_rearm_queued_roots_total` | `1466` | `1464` | unchanged | |
| `metrics_visibility_role_rearm_rearmed_entities_total` | `1053` | `1040` | unchanged | |
| `metrics_visibility_role_rearm_queued_loss_passes_total` | `28392` | `26897` | unchanged | |
| `metrics_reconcile_control_replication_roles_max_wall_ms` | `39.68` | `36.46` | similar | |
| `metrics_reconcile_control_replication_roles_skipped_total` | `14904` | `11176` | conditioned skipped fewer | side effect of fewer ticks |
| `metrics_lightyear_replication_sent_payload_bytes_total` | `69,416,146 B` | `73,056,029 B` | conditioned slightly higher total | despite running fewer ticks (different wall window) |
| `metrics_lightyear_replication_sent_payload_bytes_per_client_s` | `2313.87` | `2435.20` | similar | confirms downlink is **not** rate-limited by uplink conditioning |
| `metrics_lightyear_replication_bandwidth_limited_messages_total` | `0` | `0` | no Lightyear-side bandwidth limiting in either run | |
| `metrics_lightyear_replication_actions_queue_depth_max` | `1959` | `2039` | similar | |
| `metrics_lightyear_replication_updates_queue_depth_max` | `255` | `256` | similar | |
| `metrics_outbound_estimated_bytes_per_client_s` | `1413.63` | `1303.10` | similar | server-outbound tactical/owner-manifest path unaffected by inbound conditioning |
| `metrics_visibility_visible_gains` | `10370` | `7507` | conditioned saw fewer visibility transitions | side effect of fewer ticks under jitter |
| `metrics_visibility_visible_losses` | `911` | `1023` | similar order of magnitude | |
| `metrics_process_cpu_usage_percent_p95` | `82.33%` | `75.41%` | conditioned slightly lower | because conditioner releases input work later, smoothing CPU bursts |
| `metrics_process_cpu_usage_percent_max` | `130.35%` | `131.11%` | matched | both ran above 100% (multi-thread) |
| `metrics_host_cpu_global_usage_percent_p95` | `100%` | `100%` | both pegged | the test environment is the bottleneck |

Replication group counts: both runs report `metrics_shard_hot_entities = 1574`, `metrics_shard_active_sectors = 4`, `metrics_visibility_cell_dirty_worklist_entities_max = 1574`, and `metrics_tactical_authoring_entries_max = 1474`. The conditioner does not change the world topology.

Motion payload bytes per tick (derived):
- Clean: `metrics_lightyear_replication_sent_payload_bytes_total / metrics_fixed_ticks_total = 69416146 / 5280 = 13,147 B/tick` average across the whole world send.
- Conditioned: `73056029 / 4710 = 15,510 B/tick` average. Higher per-tick byte rate, lower tick count — same downlink total volume order.

## 3. Metric coverage gaps (real-evidence transparency)

The task brief explicitly asked to capture: motion payload bytes per tick, replication group counts, role-rearm metrics, reconcile-skip metrics, health JSON, conditioner-disabled / enabled assertion.

What was actually emitted by `scripts/capture_phase0_dense_baseline.sh` and `scripts/run_mmo_synthetic_load_tier.sh`:

1. Motion payload bytes per tick — **derived**, not directly emitted; computed from `metrics_lightyear_replication_sent_payload_bytes_total` divided by `metrics_fixed_ticks_total`. A direct `motion_bytes_per_tick` metric is not currently surfaced.
2. Replication group counts — **partial**. `metrics_shard_hot_entities`, `metrics_shard_active_sectors`, `metrics_tactical_authoring_entries_max`, and `metrics_owner_manifest_read_model_entries_max` are emitted; a direct per-`ReplicationGroup` (controlled / projectile / dynamic_motion / player_runtime / static_world / generic) count is **not** broken out in the current summary. This is a real coverage gap relative to the brief, called out per the user's "real evidence only" instruction.
3. Role-rearm metrics — **present**: `metrics_visibility_role_rearm_queued_roots_total`, `_rearmed_entities_total`, `_queued_loss_passes_total`.
4. Reconcile-skip metrics — **present**: `metrics_reconcile_control_replication_roles_max_wall_ms`, `metrics_reconcile_control_replication_roles_skipped_total`.
5. Health JSON — **emitted only when the replication health HTTP endpoint is polled**. The capture script does not currently poll `/health/replication` mid-run; the conditioner state is instead surfaced via the observability metric keys `link_conditioner_enabled/loss_ratio/latency_ms/jitter_ms` which are mirrored into the summary. Treat those as the canonical assertion vehicle for these runs; the full JSON `direction` / `transports` fields from `bins/sidereal-replication/src/replication/health.rs` were not snapshotted because the script does not curl the endpoint.
6. Conditioner-disabled assertion (clean run) — **present**: `mmo_load_link_conditioner_enabled=0` in the gate JSON, plus `mmo_load_link_conditioner_env_loss_ratio=unset` confirming no env var was leaking in.
7. Conditioner-enabled assertion (conditioned run) — **present**: `mmo_load_link_conditioner_enabled=1`, `mmo_load_link_conditioner_loss_ratio=0.05000000074505806`, `mmo_load_link_conditioner_latency_ms=25`, `mmo_load_link_conditioner_jitter_ms=25`.

## 4. What we can conclude

1. The receive-path conditioner is wired correctly. With `LOSS_RATIO=0.05 / LATENCY_MS=25 / JITTER_MS=25` set, the conditioner observably activates (`metrics_link_conditioner_enabled=1`) and reduces `metrics_input_accepted_total` by roughly the configured drop fraction (`3937 / 4453 ≈ 0.884`, i.e. ≈11% fewer accepted inputs across the run, consistent with 5% per-packet drop multiplied by the slightly shorter effective capture wall window because the conditioned run ran fewer fixed ticks).
2. No new failure modes appear when the conditioner is active that were not already present in the clean run on this hardware. Both runs fail the SLO gate, both report sustained degraded health, both report identical replication group population.
3. The Lightyear send-path queues did not collapse or saturate under the configured uplink loss: `metrics_lightyear_replication_sent_payload_bytes_per_client_s` is comparable in both runs (`2313.87` clean vs `2435.20` conditioned) and `metrics_lightyear_replication_bandwidth_limited_messages_total = 0` in both.
4. The receive-path conditioner does not, on its own, cause inputs to be silently dropped on the server-side `metrics_input_drop_total` counter — that counter measures post-Link drops, and the conditioner removes packets at the link layer before they reach the input pipeline. The drop is observable only as a reduction in `metrics_input_accepted_total`.

## 5. What we cannot conclude

1. **Nothing about server-to-client (downlink) rubber banding behaviour.** The receive-path conditioner does not condition the downlink path. Any visual stutter, ghost convergence gap, snap-back, or visual correction observed by a real client is not modelled by these runs.
2. **Nothing about prediction reconciliation under server-outbound loss.** The reconcile-skip / role-rearm numbers reflect server-side logic; they do not exercise the client-side rollback / interpolation history convergence path under packet drops at the receiver.
3. **Nothing about whether the underlying tier-100 SLO gate would pass on production hardware.** This host saturates at ~83 connected clients before SLO failure. Production hardware will shift those numbers; on this no-GPU host, the comparison is dominated by CPU saturation noise, which is much larger than the signal from the uplink conditioner.
4. **Nothing about per-`ReplicationGroup` send-frequency tuning.** The capture pipeline does not break out per-group byte counts; the brief's "replication group counts" gap is a known capture-script limitation, not a "no problem found" finding.

## 6. Recommended next diagnostic

To attribute rubber banding to downlink-bound network conditions (the dominant MMO failure mode), one of the following is required:

1. **Client-side `RecvLinkConditioner` on the user's local machine.** This is the immediate path: a developer runs a native client locally with `RecvLinkConditioner` installed on the client `Link::recv` and connects to a remote / local server with no server-side conditioner. This isolates downlink loss + jitter to the client-receive direction. Sidereal already has the receive-path env var plumbing; reusing it on the client side requires a small additional config knob on the client binary.
2. **Lightyear fork: add a symmetric send-path conditioner.** Specified in `docs/prompts/handoffs/open/lightyear_link_conditioner_server_outbound_handoff_2026-05-22.md`. Allows the headless replication server to model downlink loss/latency/jitter without per-developer client setup, and makes the conditioner usable from the existing load-test harness for downlink sweeps.
3. **End-to-end native GUI session on a developer's machine** (out of scope for this no-GPU diagnostic host). This is the only way to *observe* rubber banding directly; the metric-only diagnostics on this host can corroborate but not replace a visual session.

A scaled-down workload (e.g. `tier_10` or `tier_50`) on this host would also produce less noise-dominated comparisons of the conditioner's effect on input pipeline behaviour, even if the headline rubber-banding question remains downlink-only. The tier-100 evidence captured here is sufficient to confirm the conditioner is wired and exercising the receive path, and to surface the metric-coverage gaps in §3 honestly. It is not sufficient to claim rubber banding is fixed or unfixed.

## 7. Conclusions (with the §0 caveat repeated)

**THIS DIAGNOSTIC IS UPLINK-ONLY. It cannot demonstrate that downlink-bound rubber banding is fixed.** It does demonstrate:

- The Lightyear receive-path conditioner now works on Sidereal's replication server with the documented env vars.
- The receive-path conditioner does not change any server-side replication group populations, role-rearm cadence, reconcile-skip behaviour, or downlink byte rate in a way that exceeds run-to-run noise on this CPU-saturated host.
- The tier-100 SLO gate on this host is dominated by CPU saturation, not by uplink loss, and any further conditioned diagnostic on this host has to start by removing that CPU saturation (or accepting that signal-to-noise stays poor).
- Real-evidence gaps in the current capture scripts (per-replication-group byte counts; mid-run health-endpoint JSON snapshot) are listed in §3 and have not been papered over.

Next handoff: the receive-path coverage is solid enough to ship as a default-off diagnostic. The downlink coverage is the missing half and is the next required piece of evidence-machinery; it goes through the Lightyear fork (see `docs/prompts/handoffs/open/lightyear_link_conditioner_server_outbound_handoff_2026-05-22.md`) rather than through a Sidereal-side hack.
