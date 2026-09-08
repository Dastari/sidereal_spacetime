# Lightyear Component Replication Byte Metrics Handoff - 2026-05-08

Status: Active
Lifecycle: handoff-open
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Lightyear Component Replication Byte Metrics Handoff - 2026-05-08.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## Goal

Add generic server-side observability hooks to Lightyear that let downstream applications measure component replication payload pressure before changing replication cadence or priority policy.

## Required Behavior

1. Expose per-server-frame replication send metrics without application/game-specific concepts.
2. Report at least:
   - bytes queued/sent by replication group or channel where Lightyear already has that classification,
   - message/component count by group/channel,
   - queue depth or backpressure/drop state for outbound replication send queues.
3. Keep the API optional and low-overhead when no observer is installed.
4. Do not add Sidereal-specific component names, visibility policy, or gameplay classes to Lightyear.
5. Preserve existing Lightyear public behavior and protocol compatibility unless a protocol change is explicitly justified and tested.

## Suggested Shape

- Add a small metrics sink/observer trait in the replication/server send path.
- Emit compact numeric counters after serialization/framing has produced byte counts.
- Include integration tests that verify counters increase for replicated component payloads and stay disabled/no-op when no sink is configured.

## Sidereal Validation Context

Sidereal already records estimated payload bytes for Sidereal-authored server messages in replication health:

- `outbound_control_*`
- `outbound_combat_event_*`
- `outbound_tactical_snapshot_*`
- `outbound_tactical_delta_*`
- `outbound_owner_manifest_*`
- `outbound_asset_notice_*`
- `outbound_notification_*`

The missing data is Lightyear-owned entity/component replication bytes and queue pressure, especially for motion correction, remote dynamic motion, and rare-update gameplay component classes. After the fork patch lands, Sidereal should bridge the generic Lightyear counters into `sidereal-observability` and use them in Phase 0/MMO load summaries before lowering remote motion cadence.
