# Target Selection System V1 Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-07-05
Owners: client runtime + replication + gameplay
Scope: Server-authoritative target selection, reticle, scanner-tier-gated info panel, and a stubbed scan path for the native client.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- `docs/systems/core_systems_catalog_v1.md`
- `docs/features/active/target_intel_and_scanner_disclosure_contract.md`
- `docs/features/active/visibility_replication_contract.md`
- `docs/features/proposed/tactical_sensor_ring_design_proposal.md`
- `docs/plans/superseded/scan_intel_minimap_spatial_plan_2026-03-05.md`

## 1. Context

The native client had only keyboard input and no way to select, inspect, or act on a specific
entity. This system adds the first non-keyboard input: clicking any in-game entity (ship, planet,
asteroid, …) selects it as a target, drawing a square reticle and a bottom-right info frame that
persists last-known stats after the target leaves sensor range, plus a right-click context menu with
a (stubbed) Scan action. It obeys the client-authority rules: a client may only select a target that
is in sensor range at selection time, or that it owns. What the panel discloses is gated by the
observer's scanner tier vs. the target's counter-measures (`system.target_selection.v1`).

## 2. Implemented behavior

- **Server-authoritative selection**: client sends `ClientSelectTargetRequestMessage` over the
  reliable `ControlChannel`; the server validates identity (binding/spoof), rejects ghost targets,
  and authorizes the target as owned (`OwnerId`) or currently visible to the client
  (`VisibilityMembershipCache`). On success it writes `SelectedEntityGuid` on the player entity,
  which replicates back owner-only as the authoritative confirmation and persists. Rejections return
  `ServerSelectTargetRejectMessage`.
- **Optimistic client UX**: the reticle/panel appear immediately on click and reconcile against the
  replicated `SelectedEntityGuid`; a rejection reverts the optimistic selection with a non-blocking
  notice.
- **Persisted selection** (`SelectedEntityGuid` is `persist=true`): re-validation on change clears
  only malformed or ghost targets, never a valid target that has not streamed in yet.
- **Scan**: `ClientScanRequestMessage` → `ServerScanResultMessage { status: "not_implemented" }`.
  Wire + validation exist; resolution deferred (see the disclosure contract).
- **Scanner-tier gated panel**: rows are disclosed per the observer's `ScannerContactDetailTier`
  (`Basic → Iff → Classified → Telemetry`); owned targets bypass gating. Undisclosed rows render as
  locked.

## 3. Key files

- Protocol: `crates/sidereal-net/src/lightyear_protocol/messages.rs`, `…/registration.rs`
  (protocol version 16; 4 new messages on `ControlChannel`).
- Server: `bins/sidereal-replication/src/replication/target_selection.rs`
  (`receive_select_target_requests`, `receive_scan_requests`,
  `revalidate_selected_target_on_change`); registered in `bins/sidereal-replication/src/main.rs`.
- Client: `bins/sidereal-client/src/runtime/target_selection.rs` (state, picking, send, reconcile,
  reticle, panel, context menu); registered in `…/plugins/ui_plugins/in_world.rs` (Update) and
  `…/plugins/ui_plugins/post_update.rs` (reticle projection).
- Authoritative store: `crates/sidereal-game/src/components/selected_entity_guid.rs` (reused).

## 4. Distribution (DR-0040)

`SelectedEntityGuid` is owned by the player entity's shard; the player anchor does not cross
`ShardRegion`, so handoff is unaffected. If a target hands off, the stored GUID re-validates and
clears on ghost detection. The state is owner-only and never cross-shard visible.

## 5. Verification

- Unit/integration tests: `crates/sidereal-net/tests/lightyear_protocol.rs`
  (`target_selection_messages_roundtrip_through_bincode`), server re-validation tests and client
  disclosure/humanize tests in the respective `target_selection.rs` modules.
- Quality gates: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D
  warnings`, `cargo check --workspace`, client `wasm32-unknown-unknown --features bevy/webgpu` and
  `x86_64-pc-windows-gnu` checks.
- Manual/native: select an in-range ship (reticle + panel), fly out of range (last-known persists),
  select an owned out-of-range ship from the fleet panel, right-click → Scan → "not yet implemented"
  toast, click empty space to clear.

## 6. Out of scope (future)

Active scan resolution + field-scope grant evaluator + `ScanResistance` counter-measures; multi-
target; hover/soft-focus via `FocusedEntityGuid`; ring-marker target handoff; the
owned-fleet-panel target-select action (selection still works for in-range/owned via direct click;
the dedicated fleet "target" button is deferred).

## Closure Note (2026-07-05)

Implemented (server-validated selection + replication, optimistic client reconcile, persisted `SelectedEntityGuid`, scan protocol stub). Active-scan resolution and the field-scope disclosure evaluator remain deferred follow-ups, listed in the deferred register of `docs/plans/active/gap_closure_and_finalization_plan_2026-07-05.md`.
