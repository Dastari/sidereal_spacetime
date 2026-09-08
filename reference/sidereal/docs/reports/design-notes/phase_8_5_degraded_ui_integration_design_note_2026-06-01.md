# Phase 8.5 Degraded UI and Migration Integration Design

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Phase 8.5 Degraded UI and Migration Integration Design.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-06-01
Status: implementation design report and slice plan only
Base commit: `47b7de1` (`Add admission reopen policy`)

## 0. Remaining Scope

Phase 8 still needs client-visible degraded feedback and the full migrate-under-load proof. The plan orders fallback as migrate, split deferred, cadence reduce, then admission control (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:418`, `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:421`, `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:422`) and requires `shard_degraded_reasons` to be the canonical client-visible reason plus a non-blocking notification (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:423`). Acceptance still names `shard_migrate_under_load`, documented thresholds, admission API tests, and client UI notification tests (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:426`), with both native and WASM clients surfacing the notification (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:494`).

Current 8.4f state is headless: admission denial returns additive metadata and no client push notification (`docs/features/active/server_observability_metrics_contract.md:11`, `docs/features/active/server_observability_metrics_contract.md:16`). The gateway already returns `accepted=false`, no tokens, shard route data, and `admission` metadata before bootstrap (`bins/sidereal-gateway/src/api.rs:833`; `crates/sidereal-core/src/gateway_dtos.rs:203`). Gateway tests cover queue metadata and no bootstrap (`bins/sidereal-gateway/tests/auth_flow.rs:742`, `bins/sidereal-gateway/tests/auth_flow.rs:756`). The client currently collapses every rejected enter-world response to a generic reason (`bins/sidereal-client/src/runtime/auth_net.rs:397`, `bins/sidereal-client/src/runtime/auth_net.rs:404`) and only writes rejected status text (`bins/sidereal-client/src/runtime/auth_net.rs:801`).

## 1. Focused Slices

**8.5a - client admission/degraded notification handling.** Decode `EnterWorldResponse.admission` in `auth_net.rs`, preserve queue position, retry-after, shard ID, region, and reason in the rejection result, and enqueue a warning toast through existing `NotificationQueue::push_local_notification` (`bins/sidereal-client/src/runtime/notification_ui.rs:73`). Use warning severity, bottom-right placement, and auto-dismiss. Do not use persistent dialogs: client rules reserve dialogs for acknowledgment-required failures (`.claude/skills/sidereal-client-wasm/SKILL.md:61`; `docs/guides/ui_design_guide.md:30`; `docs/guides/ui_design_guide.md:508`). Test rejected admission metadata produces one warning toast and a useful status string. Keep logic shared for native/WASM; no protocol bump.

**8.5b - server-authored degraded notification.** The existing notification lane can carry this without a Lightyear protocol change: `NotificationChannel` exists (`crates/sidereal-net/src/lightyear_protocol/channels.rs:17`), `NotificationPayload::Generic` already carries JSON (`crates/sidereal-net/src/lightyear_protocol/messages.rs:300`), lifecycle installs `MessageSender<ServerNotificationMessage>` (`bins/sidereal-replication/src/replication/lifecycle.rs:474`), delivery targets bound players (`bins/sidereal-replication/src/replication/notifications.rs:220`), and client receive code dedupes IDs (`bins/sidereal-client/src/runtime/notification_ui.rs:123`). Safest implementation is a per-player, per-shard, per-reason/policy-epoch dedupe/rate limit so `cadence_reduced` does not spam (`docs/features/active/server_observability_metrics_contract.md:35`, `docs/features/active/server_observability_metrics_contract.md:41`). If this fanout is larger than one slice, defer it and close 8.5 on 8.5a plus health-contract evidence.

**8.5c - diagnostic synthetic region load hook.** Add only a diagnostics-controlled, region-bound fixed-tick burn using `SIDEREAL_DIAGNOSTICS`, not link-conditioner or production chaos flags. Observability rules require backend diagnostics through `sidereal-observability` and `SIDEREAL_DIAGNOSTICS` (`.claude/skills/sidereal-observability-net/SKILL.md:24`; `docs/features/active/server_observability_metrics_contract.md:386`, `docs/features/active/server_observability_metrics_contract.md:399`). The hook must bind work to entities in a configured `ShardRegion`, so migrating that region moves the burn and can reduce source `fixed_tick_wall_ms_p95`.

**8.5d - `shard_migrate_under_load` e2e.** Base it on `transport_lightyear_e2e.rs`: it already starts persistence, two shards, gateway, ghost peers, health, and BRP (`bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2501`, `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2531`, `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2620`, `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:3432`). Reuse BRP count/position checks from generalized handoff (`bins/sidereal-replication/tests/transport_lightyear_e2e.rs:3110`) and route/ownership checks from the Phase 8 scaffold (`docs/reports/design-notes/phase_8_dynamic_migration_design_note_2026-05-28.md:64`). Assert gateway route flip, source retirement, target ownership, no duplicate authoritative GUIDs, and source p95 post-migration <= 75% baseline. If host saturation prevents that, the test is diagnostic-only and cannot close Phase 8; acceptable evidence is route/ownership success plus captured baseline/post p95 numbers, with the ledger left open.

**8.5e - final closure.** Only after `controlled_root_handoff_e2e`, `generalized_entity_handoff_e2e`, `shard_migrate_under_load`, and the client notification test are green, add the Phase 8 closure row to the current progress ledger (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:25`). Do this as the final commit.

## 2. STOP Rules

Fired: no. The proposed path adds no TiDi, fixed-tick slowdown, route redirects, gateway-proxied realtime transport, production chaos/link-conditioner branch, f32/stringified world-coordinate payload, or native/WASM shared-runtime split.
