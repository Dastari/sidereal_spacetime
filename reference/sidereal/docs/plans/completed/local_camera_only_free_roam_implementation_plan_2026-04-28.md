# Local Camera-Only Free-Roam Implementation Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Local Camera-Only Free-Roam Implementation Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Implementation Status

2026-04-28 status note:

1. Free-roam is now a client-local camera mode instead of a server-controlled player-anchor entity.
2. The Owned Fleet `FREE ROAM` action no longer sends `ClientControlRequestMessage`; it detaches the local camera and requests a neutral input flush for the currently controlled gameplay entity.
3. Player anchors are no longer valid predicted control targets and no longer receive client `ControlledEntity`, `InputMarker<PlayerInput>`, `ActionState<PlayerInput>`, or `SimulationMotionWriter` authority for space free-roam.
4. The replication server rejects player-anchor control requests and keeps `PlayerControlledEntityMap` scoped to gameplay controllables.
5. Tactical/minimap data remains sourced from the controlled gameplay entity. Player entities remain available to owner/debug/entity-tree views but must not render as tactical self markers.

2026-04-28 update:

1. Local free-roam camera movement accepts both arrow keys and WASD.
2. Owned Fleet button styling is refreshed for all buttons after a selection change so `FREE ROAM` and a ship cannot remain visually selected together until hover.
3. Fullscreen starfield/background drift uses local camera delta while free-roam is detached, preserving the old visual feedback without making the camera a replicated entity.
4. Native impact: detached camera movement now drives the backdrop while gameplay input remains neutral. WASM impact: shared client runtime behavior only; no browser-only branch was introduced.

2026-04-28 update:

1. Replication bootstrap no longer derives an active control target from the latest owned entity when persisted player state has no `ControlledEntityGuid`.
2. If the persisted target is missing, not owned, or absent from the hydrated world, `PlayerControlledEntityMap` is cleared for that player and session-ready reports no controlled gameplay entity.
3. Session-ready logs a control-binding mismatch if the persisted player component and runtime control map disagree.
4. Native impact: a player with no controlled entity can still use camera-only free-roam locally, but server visibility remains anchored to the currently valid gameplay target when one exists. WASM impact: shared replication-server behavior only.

## 1. Target Contract

Free-roam is represented only by client-local camera state. It must not be represented by:

1. `ControlledEntityGuid == player_entity_id`,
2. `PlayerControlledEntityMap[player] = player_entity`,
3. `PredictionTarget` on `PlayerTag`,
4. client `ControlledEntity` on the player anchor,
5. `SimulationMotionWriter` on the player anchor,
6. realtime input targeting the player anchor.

The active server control lease remains on the current gameplay entity while the camera is detached. The client sends neutral intent for that gameplay target and does not use camera position to widen visibility.

## 2. Native And WASM Impact

Native impact:

1. Free-roam no longer depends on Lightyear predicted player-anchor spawning or reconciliation.
2. Entering free-roam should stop controlled ship input without causing a control handoff, prediction generation change, or server input route churn.
3. Unlimited local camera pan may show empty space outside the current server-authorized delivery bubble; this is expected because visibility remains anchored to the controlled gameplay entity.

WASM impact:

1. Behavior is shared client/runtime and protocol-adjacent logic; no browser-only branch was introduced.
2. The same WASM build must compile because the client transport and runtime systems share these control/input paths.

## 3. Follow-Up Checks

1. Verify with two native clients that player entities do not appear as tactical/minimap self markers.
2. Verify repeated `ship -> local free-roam -> ship` loops do not increment stale-generation or wrong-target input drop counters after settling.
3. Consider renaming `detached_free_camera` to a typed local camera mode enum after the runtime stabilizes.
