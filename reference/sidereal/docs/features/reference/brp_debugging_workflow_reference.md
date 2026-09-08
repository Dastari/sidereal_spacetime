# BRP Debugging Workflow

Status: Reference
Lifecycle: active-reference
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: BRP Debugging Workflow.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-05-06 status note:

1. The replication health/diagnostics HTTP server now exposes a loopback-only `/spatial-partition` snapshot for aggregated visibility spatial partition geometry and sector lifecycle diagnostics.
2. The gateway proxies this through `/admin/dashboard/replication/spatial-partition` with the existing `dashboard:brp:proxy` scope, and the dashboard server exposes `/api/replication/spatial-partition` for `/game-world`.
3. `/game-world` can render the snapshot as an optional spatial zones overlay. The payload is aggregate-only and does not include Bevy entity IDs, entity membership lists, or component payloads.

2026-04-24 status note:

1. Implemented: BRP inspection endpoints are used by the dashboard/game-world tooling and local `curl`/`jq` workflow for targeted runtime inspection.
2. Implemented: project rules require BRP endpoints to stay loopback-only until real authenticated HTTP gating exists.
3. Open work: broader dashboard BRP workflows should continue to prefer filtered requests and route-owned state rather than full unbounded snapshot dumps.

Update note (2026-03-09):
- This documents the current Sidereal BRP snapshot workflow used for Lightyear prediction, replication, and handover debugging.
- Prefer filtered `curl` + `jq` queries over full snapshot dumps. The payloads are large enough that unfiltered dumps slow investigation and hide the signal.

## Purpose

Use BRP snapshots to answer concrete runtime questions with minimal payload:

1. Did the server assign the expected replication mode to a controlled target?
2. Did the owning client actually receive a `Predicted` clone?
3. Did observers receive `Interpolated` or only `Replicated`/confirmed entities?
4. Is a control target being incorrectly driven by an interpolated fallback?

BRP is an inspection aid only. It does not replace the authoritative server/client logs added around control handover and prediction adoption.

## Default Ports

- Replication server BRP: `15713`
- Client 1 BRP: `15714`
- Client 2 BRP: `15715`
- Replication health diagnostics: `15716`

The dashboard proxy endpoint is:

```text
http://localhost:3000/api/brp?snapshot=1&port={port}
```

The dashboard spatial partition proxy endpoint is:

```text
http://localhost:3000/api/replication/spatial-partition?port=15716
```

## Snapshot Baseline

Save a snapshot locally before filtering:

```bash
curl -s 'http://localhost:3000/api/brp?snapshot=1&port=15713' > /tmp/brp_15713.json
curl -s 'http://localhost:3000/api/brp?snapshot=1&port=15714' > /tmp/brp_15714.json
curl -s 'http://localhost:3000/api/brp?snapshot=1&port=15715' > /tmp/brp_15715.json
```

Get a quick size check:

```bash
jq '{nodes:(.nodes|length), edges:(.edges|length)}' /tmp/brp_15714.json
```

## Spatial Partition Overlay Workflow

Use the spatial partition snapshot when the question is about live server occupancy, sector lifecycle state, or whether cells/sectors/regions align with visible map entities. Use BRP snapshots when the question is about specific ECS components or Lightyear runtime roles.

Direct local loopback check:

```bash
curl -s 'http://127.0.0.1:15716/spatial-partition' \
  | jq '{generated_at_unix_ms, cells:(.cells|length), sectors:(.sectors|length), regions:(.regions|length), summary}'
```

Dashboard proxy check after logging in with `dashboard:brp:proxy`:

```bash
curl -s 'http://localhost:3000/api/replication/spatial-partition?port=15716' \
  | jq '{source, target, healthUrl, cells:(.snapshot.cells|length), sectors:(.snapshot.sectors|length), regions:(.snapshot.regions|length)}'
```

In `/game-world`, select live server mode and enable `Spatial zones`. Regions, sectors, cells, and labels can be toggled independently. The overlay is read-only diagnostics and must not be used as evidence that authorization, delivery, or payload redaction changed.

## Useful Filters

Count predicted/interpolated/replicated markers on a client:

```bash
jq '[.nodes[] | objects | select(.properties.typePath? == "lightyear_core::prediction::Predicted")] | length' /tmp/brp_15714.json
jq '[.nodes[] | objects | select(.properties.typePath? == "lightyear_core::interpolation::Interpolated")] | length' /tmp/brp_15714.json
jq '[.nodes[] | objects | select(.properties.typePath? == "lightyear_replication::components::Replicated")] | length' /tmp/brp_15714.json
```

Find the Bevy entity ID for a known gameplay GUID:

```bash
GUID='57c26097-85ab-44ea-a189-ea2ab06052d7'
jq --arg guid "$GUID" -r '
  .nodes[]
  | objects
  | select(.properties.typePath? == "sidereal_game::components::entity_guid::EntityGuid")
  | select(.properties.value == $guid)
  | .id
  | split("::")[0]
' /tmp/brp_15714.json
```

Inspect all component type paths for one entity after you have its Bevy entity ID:

```bash
ENTITY_ID='12884901576'
jq --arg entity_id "$ENTITY_ID" -r '
  .edges[]
  | objects
  | select(.from == $entity_id and .label == "HAS_COMPONENT")
  | .to
' /tmp/brp_15714.json | sort
```

Inspect a specific component node value:

```bash
COMPONENT_ID='12884901576::sidereal_game::components::entity_guid::EntityGuid'
jq --arg component_id "$COMPONENT_ID" '
  .nodes[]
  | objects
  | select(.id == $component_id)
' /tmp/brp_15714.json
```

List server-side replication-control component type paths currently visible in the snapshot:

```bash
jq -r '
  .nodes[]
  | objects
  | .properties.typePath? // empty
' /tmp/brp_15713.json | rg 'ControlledBy|Replicate|Prediction|Interpolation'
```

## Lightyear Handover / Prediction Workflow

When debugging a handover that looks logically correct in logs but still feels jittery:

1. Confirm the server handover request/ack logs.
2. Query the owning client snapshot and count `Predicted`, `Interpolated`, and `Replicated`.
3. Find the gameplay GUID for the intended control target.
4. Resolve the client-side Bevy entity or entities for that GUID.
5. Inspect whether those entities have:
   - `lightyear_core::prediction::Predicted`
   - `lightyear_core::interpolation::Interpolated`
   - `lightyear_replication::components::Replicated`
   - `sidereal_game::components::simulation_motion_writer::SimulationMotionWriter`
6. If the target is `Interpolated` plus `SimulationMotionWriter` and not `Predicted`, the client is in the wrong runtime mode.
7. If the same runtime entity has both `Predicted` and `Interpolated`, treat that as a control-handoff/runtime-sanitization bug. In Sidereal's current Lightyear integration, the owner-controlled entity must resolve to `Predicted` only; former control targets must resolve to `Interpolated` only.

This distinction matters in Sidereal because dynamic control handoff is not a stock Lightyear sample flow:

- the persisted player anchor can legitimately be the controlled entity in free-roam mode
- owned ships must not silently fall back to interpolated local control
- future audits must treat those paths as intentional Sidereal rules, not accidental divergence

## Practical Rules

- Prefer one targeted snapshot per runtime and filter locally.
- Do not paste entire snapshot JSON into docs or logs.
- Always correlate BRP findings with the matching client/server timestamped logs.
- Treat BRP as runtime evidence, not architecture truth. If BRP and logs disagree, inspect the exact schedule stage where the component should have been inserted.

## Current Known Limitation

As of 2026-03-09, some Lightyear replication-target components may be easier to verify from authoritative server logs than from BRP snapshots alone. When that happens:

1. use BRP to prove what the client actually materialized,
2. use the server handover/binding logs to prove what the server attempted to assign,
3. treat the gap between those two as the fault boundary.
