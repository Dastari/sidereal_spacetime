# Lightyear Upstream Issue Snapshot

Status: Reference
Lifecycle: active-reference
Category: feature
Last updated: 2026-08-31
Owners: feature owners
Scope: Lightyear Upstream Issue Snapshot.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Source: <https://github.com/cBournhonesque/lightyear/issues> and the GitHub API endpoint `https://api.github.com/repos/cBournhonesque/lightyear/issues?state=open&per_page=100&page=1`  
Filter: Open issues only, excluding open pull requests

## 0. Implementation Status

2026-08-31 status note:

1. Refreshed the upstream and fork comparison. Before this review Sidereal was locked to `Dastari/lightyear` `main` at `a608a0995842a01fcbd2b25b39e9b0f2f4e8f136`; upstream `main` was `fe40c5469a767e5a53f237184967d76c96640134` at review time. From their merge base, the fork was 42 commits ahead and upstream was 194 commits ahead. Upstream has released `0.29.0`, while the fork retains the older replication architecture plus Sidereal's Bevy 0.19 migration and custom input, interpolation, delta, and wire-hardening changes. A wholesale merge remains a dedicated migration, not a safe dependency refresh; this review instead pins the focused `#1569` port at `1758f81a9fd52d4d84db84e0485dd64e9e8a0c6f` and includes that dependency change in Sidereal protocol v17.
2. [#1569](https://github.com/cBournhonesque/lightyear/pull/1569) `Propagate server link conditioners to child links` merged upstream on 2026-07-12 and closes [#1081](https://github.com/cBournhonesque/lightyear/issues/1081). Sidereal ported the generic behavior and focused tests onto the older fork architecture as fork commit `1758f81a` on 2026-08-31, then pinned that revision. It supplies server outbound/symmetric conditioner inheritance without overwriting an explicitly configured child-link conditioner.
3. [#1588](https://github.com/cBournhonesque/lightyear/pull/1588) (repair frame-interpolation history after rollback), [#1619](https://github.com/cBournhonesque/lightyear/pull/1619) (persist Avian physics rollback state), and [#1685](https://github.com/cBournhonesque/lightyear/pull/1685) (ack processing and configurable nacks) are relevant to Sidereal's open visual/prediction and delta-recovery symptoms. They are substantial changes against the new upstream architecture, so evaluate or port them only after a current Sidereal reproduction identifies the matching failure. Watch open PR [#1650](https://github.com/cBournhonesque/lightyear/pull/1650) for disconnecting links that stop advancing acknowledgements; do not import an unmerged policy yet.
4. The earlier input conclusions need a status correction, not an architecture reversal. [#1200](https://github.com/cBournhonesque/lightyear/issues/1200) was closed without a reproduced fix, so it provides no basis for restoring the native server-input receiver. [#1283](https://github.com/cBournhonesque/lightyear/issues/1283) was closed after the generic opt-in input-validation seam landed, and the fork carries equivalent validation support, but Sidereal's authenticated player binding and `control_generation` checks still belong in its custom authoritative input lane. [#1450](https://github.com/cBournhonesque/lightyear/issues/1450) was fixed by merged PR [#1451](https://github.com/cBournhonesque/lightyear/pull/1451); the fork already carries equivalent convergence behavior.
5. Fork PR [Dastari/lightyear#2](https://github.com/Dastari/lightyear/pull/2) targeted the stale `sidereal/merge-local-third-party-patches` branch, but both commits were already ancestors of fork `main`. It was closed as integrated housekeeping on 2026-08-31 without merging duplicate code.
6. The full issue tables below remain the 2026-03-08 historical inventory. Use this dated note for current decisions and perform a targeted upstream search for any new symptom. Native/WASM impact: both targets consume the new fork pin and must pass the Sidereal target checks; the generic port itself changes only server-created child-link conditioner setup.

2026-05-30 status note:

1. Re-verified the two upstream blockers that gate `DR-0031` (keeping authoritative server input on Sidereal's `ClientRealtimeInputMessage` lane instead of Lightyear's native server input receiver). Both are still **open** via the GitHub API (`gh api repos/cBournhonesque/lightyear/issues/{1200,1283}`):
   - [#1200](https://github.com/cBournhonesque/lightyear/issues/1200) `Panic: subtract with overflow` — `state: open`, `closed_at: null`.
   - [#1283](https://github.com/cBournhonesque/lightyear/issues/1283) `Input should not be accepted from any client for any entity` — `state: open`, `closed_at: null`.
2. Conclusion: the `DR-0031` decision remains current. Re-enabling Lightyear's native server input would still reintroduce the #1200 panic and still lack the generic target authorization (#1283) that Sidereal needs for session/account binding and `control_generation` checks. No change to the protocol-only native input registration on replication.
3. This re-verification was prompted by `docs/reports/investigations/client_server_physics_desync_investigation_2026-05-30.md` (Finding B), which questioned whether the custom realtime-input lane is still the right call. It is, for the authoritative server lane; the open work is internal to that lane (rollback/tick-alignment), not a switch back to Lightyear native input.
4. Native/WASM impact: documentation only; no code, protocol, or dependency change.

2026-05-23 status note:

1. Sidereal now pins `Dastari/lightyear` branch `sidereal/merge-local-third-party-patches` at commit `019048ca638cd3c2727054d6f3342a34f460753e`.
2. This carries the 2026-05-21 lossless motion delta/keyframe work from `0192db9c9235f807f170c0f7400dd55099a41447` plus the 2026-05-23 monotonic delta-ack bookkeeping fix in `lightyear_replication::send::sender` and the related retention-accounting tests in the fork.
3. Sidereal validation after the bump: the targeted single-client e2e guard reports `connect_burst_warns=0 steady_state_warns=0`, and the one-client load-wrapper smoke reports zero fallback warnings. A ten-client load-wrapper smoke still reports `3012` `Delta base from tick` fallback warnings during the multi-client connect/fanout burst, so the fork fix is incomplete for Sidereal's load path. Follow-up prompt: `docs/prompts/handoffs/open/lightyear_delta_base_multi_client_connect_burst_handoff_2026-05-23.md`.
4. Native impact: replication delta sender bookkeeping improves the direct out-of-order ack path, but multi-client fanout still needs a fork-side follow-up. WASM impact: shared Lightyear dependency revision changed; WASM compile validation remains required because the client links the same protocol stack.

2026-05-22 status note (afternoon, post tier-100 uplink-conditioned diagnostic):

1. Confirmed the Sidereal fork at `0192db9c9235f807f170c0f7400dd55099a41447` already carries the four cherry-picks requested for the 2026-05-22 batch (PRs #1471 `d8fb92e1`, #1479 `52b7694f`, #1473 `0c55cc28`, #1474 `923721b0`). They landed during the 2026-05-21 fork update and the Sidereal `Cargo.toml` was repinned to `0192db9c` at the same time, which is one commit past the four (adds the lossless base-value delta fallback). The original 2026-05-22 task brief referenced the pre-bump SHA `3f7c3d2`; the actual current pin is `0192db9c` and no new cherry-pick action was required.
2. PR [#1361](https://github.com/cBournhonesque/lightyear/pull/1361) `Replace replication implementation with replicon` remains explicitly deferred per the 2026-05-21 note and was **not** cherry-picked. Reason restated: it removes files Sidereal patches and is a broad replication rewrite that must not land without a separate phase 1.x audit.
3. PR [#1475](https://github.com/cBournhonesque/lightyear/pull/1475) `Update sync tests after Tick refactor` was again left out of the batch; the validation suites used for the 2026-05-22 captures pass without it. If a future failure points at sync-tick behaviour, re-evaluate.
4. Tier-100 movement-only diagnostic was captured against this fork pin both with the conditioner disabled and with `_LOSS_RATIO=0.05 / _LATENCY_MS=25 / _JITTER_MS=25`. Results are in `docs/reports/baselines/phase1_uplink_conditioned_baseline_2026-05-22.md` and the artifact directories `docs/reports/baselines/load_baselines/2026-05-21_phase1/clean/` and `docs/reports/baselines/load_baselines/2026-05-21_phase1/uplink_lossy/`. The diagnostic is uplink-only by construction; downlink coverage is not yet available and is gated on the symmetric send-path conditioner described in `docs/prompts/handoffs/open/lightyear_link_conditioner_server_outbound_handoff_2026-05-22.md`.
5. Native/WASM impact for this update: no Sidereal source code change. Documentation + reports + diagnostic artifacts only.

2026-05-22 status note:

1. Sidereal now uses Lightyear's existing `RecvLinkConditioner` on replication-server `Link` entities for default-off loss/latency/jitter diagnostics.
2. This partially addresses [#1081](https://github.com/cBournhonesque/lightyear/issues/1081) for Sidereal's immediate headless evidence work, but the upstream API still does not provide a clean server outbound/symmetric conditioner surface. Keep any future outbound/asymmetric conditioner work generic and fork/upstream-shaped.
3. Native/WASM impact: replication-server diagnostics only. No client-side hook was added.

2026-05-21 status note:

1. Sidereal now pins `Dastari/lightyear` commit `0192db9c9235f807f170c0f7400dd55099a41447`.
2. The fork revision includes the earlier Sidereal Phase 1.1 motion replication patch from `3f7c3d20694c6da7a3eeac9d3af4ce680b6341d5`: Avian2D `LinearVelocity` / `AngularVelocity` lossless `Diffable` support, `add_delta_compression_with_keyframe_interval::<Delta>(NonZeroU16)`, forced full-value delta keyframes, and active `ReplicationGroup::send_frequency` timers.
3. The fork also cherry-picks the selected upstream merged PRs requested for Phase 1.1 evidence:
   - [#1471](https://github.com/cBournhonesque/lightyear/pull/1471) `fix(inputs): server pop wipes get_predict fallback (#1402 part 2)`, upstream merge commit `29daa4ab5ef8135672276e967ddfd411149766b0`, fork commit `d8fb92e1`.
   - [#1479](https://github.com/cBournhonesque/lightyear/pull/1479) `fix(sync): raise sync_objective floor to remote + 1 (#1402)`, upstream merge commit `1b43ae8617340cc6cc0ab5977888ec27296b20aa`, fork commit `52b7694f`.
   - [#1473](https://github.com/cBournhonesque/lightyear/pull/1473) `Restrict prepare-input rate`, upstream merge commit `8e1ee1c32d5a9cfbd0fd43379c1215106df262d3`, fork commit `0c55cc28`.
   - [#1474](https://github.com/cBournhonesque/lightyear/pull/1474) `Simplify the check for 'Controlled' in inputs/clients`, upstream merge commit `43edaf63cbac734aa756aead8ec8f715327952a2`, fork commit `923721b0`.
4. [#1475](https://github.com/cBournhonesque/lightyear/pull/1475) `Update sync tests after Tick refactor`, upstream merge commit `e2ebd0f23c68fbaf468d468b87744f5584460f39`, was reviewed for this note but was not cherry-picked because the requested fork payload was limited to #1471/#1479/#1473/#1474 and the selected validation suites pass without it.
5. [#1361](https://github.com/cBournhonesque/lightyear/pull/1361) `Replace replication implementation with replicon`, upstream merge commit `52e56e6175e180042747a026f26910c0c78491ba`, remains explicitly deferred. It is a broad replication rewrite and must not be pulled into the Sidereal fork until Phase 1 diagnostics show a problem that justifies evaluating it. The 2026-05-21 two-headless loss/jitter diagnostic instead exposed a missing retained delta-base path in the current fork, fixed generically in `0192db9c9235f807f170c0f7400dd55099a41447` by falling back to a lossless base-value diff when an acknowledged delta base has aged out.
6. Validation in the Lightyear fork: `cargo fmt --all -- --check`, `git diff --check`, `cargo test -p lightyear_inputs -p lightyear_sync`, `cargo test -p lightyear_tests client_server::delta -- --test-threads=1`, and `cargo test -p lightyear_tests client_server::replication_advanced -- --test-threads=1`. A full `cargo test -p lightyear_replication --lib` run hit an existing intermittent-looking `registry::delta::tests::test_apply_diff` failure; the exact test passed when run alone, so this remains tracked as residual upstream/fork test fragility rather than a blocker for the selected patch.
7. Native impact: input/sync fixes plus replication delta fallback affect native runtime validation paths. WASM impact: shared Lightyear dependency revision changed; WASM compile validation remains required for Sidereal changes that touch shared client/runtime or transport wiring.

2026-05-15 status note:

1. At that point, Sidereal pinned the 2026-05-15 `Dastari/lightyear` fork revision, which built on the 2026-05-12 fork update and added a generic host-server maintenance fix for dedicated-server runtimes. The current pin is documented in the 2026-05-21 note above.
2. The fork change updates `lightyear_replication::host::HostServerPlugin::add_prediction_interpolation_components` to run with a normal `HostClient` query and return early when no host client exists, instead of using a `Single<HostClient>` system parameter that can remain skipped forever on dedicated servers.
3. Reason: long-lived dedicated Sidereal replication servers were emitting Bevy change-detection warnings after the host-server system had not run for `MAX_CHANGE_AGE` ticks. The fix keeps the system's change tick fresh without creating a fake host client or changing host-server behavior when a real host client exists.
4. Validation in the Lightyear fork: `cargo fmt --all -- --check` and `cargo test -p lightyear_replication --lib`.
5. Native impact: dedicated replication server operational hygiene only. WASM impact: none; no client transport, protocol, prediction, interpolation, or browser-specific code changed.

2026-05-05 status note:

1. Sidereal now pins `Dastari/lightyear` branch `sidereal/merge-local-third-party-patches` at commit `cc613cf44d82c1b2b954f7958b25175e2455df2f`, which merges current upstream Lightyear `main` onto Sidereal's fork payload.
2. The Sidereal Cargo graph now resolves active Lightyear crates from that fork revision with `avian2d`/`avian3d` `0.6.1` and Parry `0.26.x`; the stale local Parry `0.25.3` patches have been removed.
3. The Lightyear fork's workspace update includes `bevy_enhanced_input` `0.24.x`, and its launcher example uses `strum` `0.28.x`. Sidereal's currently enabled Lightyear feature set does not select either crate in the active native graph; `strum` `0.26.3` remains selected through `ratatui`.
4. Required follow-up runtime validation remains: input edge transitions, visibility regain/handoff, interpolation under packet gaps, and Avian f64 visual correction. Native impact: dependency/runtime integration must be re-tested with real client/server binaries before treating this as a stability fix. WASM impact: shared dependency wiring changed and the `sidereal-client` WebGPU WASM target must continue compiling; no browser-only transport behavior changed.

2026-05-04 status note:

1. Sidereal merged its local `third_party/lightyear_*` patch set into `Dastari/lightyear` branch `sidereal/merge-local-third-party-patches` at commit `c21af0fe0cf151911a388296798411b29b6f4a06`.
2. The migrated fork payload covers `lightyear_inputs` 512-tick input history, `lightyear_interpolation` confirmed-history convergence under packet gaps, `lightyear_udp` send backpressure queue preservation, `lightyear_inputs_native` exported native state sequence access, and the Avian2D f64 visual-correction fix.
3. Sidereal now pins that fork commit directly from Cargo instead of carrying local `[patch]` overrides. Upstream issue guidance below remains useful for triage, but references to "local patches" before this note are historical unless explicitly restated.

2026-04-24 status note:

1. This document is an upstream triage reference, not an implementation contract.
2. The full open-issue inventory remains the 2026-03-08 snapshot; the 2026-04-23 note below is a targeted PR verification update only.
3. Current Sidereal guidance remains conservative: check this snapshot before assuming an unexplained Lightyear behavior is local-only, and update it when a new upstream search changes the local risk assessment.

2026-04-26 status note:

1. Targeted upstream verification found [#1200](https://github.com/cBournhonesque/lightyear/issues/1200) still open. Sidereal now avoids that native server-input receive path locally by registering only the native input protocol message on replication.
2. New interpolation issue [#1450](https://github.com/cBournhonesque/lightyear/issues/1450) is open: interpolated components can fail to converge when `ConfirmedHistory` collapses to one keyframe.
3. Open PR [#1451](https://github.com/cBournhonesque/lightyear/pull/1451) proposes the current upstream fix shape: retain bracketing history while updates flow, clamp interpolation past the newest sample, and rebase/write the component on idle. Sidereal carried this first as a local `lightyear_interpolation` patch, then migrated it into the Dastari fork on 2026-05-04.

2026-04-27 status note:

1. Targeted upstream search for a `lightyear_inputs` `HISTORY_DEPTH` / input-buffer retention issue did not find a matching open issue.
2. Local diagnosis found upstream 0.26.4 keeps only 20 client input ticks, while Sidereal's native rollback budget is 160 ticks. A rollback deeper than retained input history can replay missing/neutral input and snap predicted entities back to their control-handoff seed.
3. Sidereal's Lightyear fork carries an input-history patch that increases retained client input history to 512 ticks. Treat this as a candidate generic upstream fix, ideally by making input history retention configurable instead of hardcoded.

2026-04-28 status note:

1. Targeted upstream search did not find an exact open issue for Lightyear logging `Trying to do a rollback of -1 ticks`.
2. The closest known upstream problem remains [#1328](https://github.com/cBournhonesque/lightyear/issues/1328), where prediction receives messages from the future. Sidereal's local reproduction is not the same prespawned-entity failure, but it has the same timing shape: confirmed state can arrive ahead of the local prediction timeline.
3. Local mitigation: do not use Lightyear state rollback `Always` as Sidereal's default. Use state rollback `Check`, which skips future confirmed ticks before attempting rollback and still rolls back when a valid-timeline confirmed component mismatch is detected.

Update 2026-04-23: PR [#1421](https://github.com/cBournhonesque/lightyear/pull/1421) was verified as merged into `cBournhonesque:main` via commit [`af25682`](https://github.com/cBournhonesque/lightyear/commit/af25682) on 2026-04-22. The associated GitHub Actions run [`24797547143`](https://github.com/cBournhonesque/lightyear/actions/runs/24797547143) was not clean: `Lint` failed in `Format`, and `Test` failed in `lightyear_tests` with exit code 1. Public unauthenticated metadata did not expose detailed `lightyear_tests` logs. Local reproduction against `af25682` and its parent `eedb9ed` found the visible formatting failure and the targeted `lightyear_interpolation` unit failure were already present before #1421; the new #1421 confirmed-history tests passed locally. This update does not refresh the full open-issue inventory below.

## Purpose

Use this file as the first triage reference when Lightyear behaves in a way that looks unexplained locally.

Working rule:
- Check this file before assuming a Lightyear bug is unique to Sidereal.
- If a Sidereal problem clearly matches an upstream issue, link that upstream issue in the local doc/PR/commit context.
- If a new Lightyear problem is not covered here, search upstream and then update this file with the new issue or with a note that no upstream issue was found as of the search date.

## Snapshot Summary

Open issues in snapshot: 90

Largest labeled buckets:
- `A-Replication`: 17
- `C-Bug`: 14
- `A-Prediction`: 12
- `A-Input`: 11
- `A-Interpolation`: 9
- `C-Performance`: 9
- Unlabeled: 24

High-level read:
- Prediction, interpolation, replication ordering, and input ownership are still active upstream problem areas.
- Host-client mode still has multiple unresolved bugs and should not be treated as a clean proxy for dedicated-server behaviour.
- Transport and netcode edges remain active, especially around disconnect handling, multi-transport setups, and token validation.
- Avian integration still has open hierarchy and collider-sync issues that matter for Sidereal's modular entity model.

## Sidereal Watchlist

These are the upstream issues that currently matter most to Sidereal's architecture and implementation rules.

| Issue | Why it matters to Sidereal | Local guidance |
|---|---|---|
| [#1034](https://github.com/cBournhonesque/lightyear/issues/1034) `Add PredictionSwitching` | This is the upstream version of our predicted-to-interpolated control-swap problem. | Keep treating control transfer as a custom Sidereal responsibility until upstream switching is real and verified. |
| [#1380](https://github.com/cBournhonesque/lightyear/issues/1380) `Required components do not get assigned by interpolation` | Risk for any setup where interpolated entities rely on Bevy/Avian required components. | Do not assume interpolated entities will hydrate required physics state correctly without local validation. |
| [#1287](https://github.com/cBournhonesque/lightyear/issues/1287) `Improve relationship replication` | Parent-child and relationship ordering are core to our hierarchy and mount model. | Keep hierarchy persistence/hydration authoritative on our side; do not trust Lightyear to preserve full relationship semantics yet. |
| [#1195](https://github.com/cBournhonesque/lightyear/issues/1195) `Replicating relationships loses the order of the Relationship Target` | Ordered hardpoints/modules matter to deterministic hydration and gameplay. | Treat relationship order as unstable across replication unless explicitly rebuilt by Sidereal. |
| [#651](https://github.com/cBournhonesque/lightyear/issues/651) `Add option in Visibility to not despawn entities when they stop being visible` | Sidereal wants data-driven visibility and intel memory, not simple despawn/respawn churn. | Keep our own visibility/redaction contract; do not assume upstream can suspend replication without despawn. |
| [#1283](https://github.com/cBournhonesque/lightyear/issues/1283) `Input should not be accepted from any client for any entity` | This directly overlaps our session-bound input routing rule. | Continue binding transport/session identity to authoritative `player_entity_id` and reject mismatched claims server-side. |
| [#692](https://github.com/cBournhonesque/lightyear/issues/692) `Server doesn't check ConnectionToken's server address` | Upstream netcode token validation has a security gap. | Do not rely on Lightyear token checks alone for trust boundaries; keep gateway/auth/session validation explicit. |
| [#1402](https://github.com/cBournhonesque/lightyear/issues/1402) `Default no_input_delay config...` | Default localhost input timing is unreliable even in a simple setup. | Treat localhost and host-mode input results as suspect; validate with explicit latency settings and dedicated-server paths. |
| [#1434](https://github.com/cBournhonesque/lightyear/issues/1434) `Bevy Enhanced Input and host-client does not work` | Fresh upstream report of client input / control regression around missing `Controlled`, reported on `0.26.4` and `main`. | Treat this as adjacent evidence that control/input assignment remains fragile upstream. Not a direct match for Sidereal's dedicated-server rollback/bootstrap repro, but relevant context when evaluating `0.26.4` behavior. |
| [#1200](https://github.com/cBournhonesque/lightyear/issues/1200) `Panic: subtract with overflow` | Matches the replication crash path in `lightyear_inputs::server::receive_input_message`. | Do not install Lightyear's native server input runtime on replication while this remains open. Sidereal keeps protocol compatibility only and routes authoritative input through `ClientRealtimeInputMessage`. |
| [#1450](https://github.com/cBournhonesque/lightyear/issues/1450) `Interpolated component never converges on Confirmed once ConfirmedHistory shrinks to one keyframe` | Directly matches two-client remote motion symptoms where confirmed state can advance but presentation/interpolation freezes behind it. | Keep the Dastari fork interpolation patch from #1451 until upstream lands/releases an equivalent fix and Sidereal's two-client motion diagnostic passes against it. |
| [#1417](https://github.com/cBournhonesque/lightyear/issues/1417) `ServerMultiMessageSender` HostClient receive bug | Host-client message delivery remains inconsistent. | Do not use host-client correctness as a sign that our dedicated transport path is sound, or vice versa. |
| [#1394](https://github.com/cBournhonesque/lightyear/issues/1394) and [#1348](https://github.com/cBournhonesque/lightyear/issues/1348) | Multiple recent host-client input regressions are still open. | Prefer dedicated client/server validation for gameplay input work. |
| [#1235](https://github.com/cBournhonesque/lightyear/issues/1235), [#1251](https://github.com/cBournhonesque/lightyear/issues/1251), [#942](https://github.com/cBournhonesque/lightyear/issues/942), [#888](https://github.com/cBournhonesque/lightyear/issues/888) | Prediction and rollback behaviour still has unresolved correctness and ergonomics gaps. | Keep Sidereal's prediction/reconciliation decisions conservative and test-heavy. |
| [#1328](https://github.com/cBournhonesque/lightyear/issues/1328) and [#957](https://github.com/cBournhonesque/lightyear/issues/957) | Pre-spawn and future-message handling still have known correctness bugs. | Avoid assuming pre-spawn timelines are robust enough for critical gameplay flows without local coverage. |
| [#847](https://github.com/cBournhonesque/lightyear/issues/847), [#1228](https://github.com/cBournhonesque/lightyear/issues/1228), [#967](https://github.com/cBournhonesque/lightyear/issues/967), [#963](https://github.com/cBournhonesque/lightyear/issues/963), [#890](https://github.com/cBournhonesque/lightyear/issues/890), [#829](https://github.com/cBournhonesque/lightyear/issues/829) | Interpolation timeline behaviour and event timing are still evolving. | Keep our interpolation adoption incremental and validate event/VFX timing separately from transform smoothing. |
| [#740](https://github.com/cBournhonesque/lightyear/issues/740), [#1332](https://github.com/cBournhonesque/lightyear/issues/1332), [#1045](https://github.com/cBournhonesque/lightyear/issues/1045) | Replication correctness and efficiency tradeoffs remain open. | Be careful with replication mode assumptions and benchmark any bandwidth/perf decisions locally. |
| [#1266](https://github.com/cBournhonesque/lightyear/issues/1266), [#1128](https://github.com/cBournhonesque/lightyear/issues/1128), [#1253](https://github.com/cBournhonesque/lightyear/issues/1253) | Avian integration still has interpolation/collider edge cases. | Keep Avian + hierarchy + child-collider behaviour under explicit Sidereal tests. |
| [#1351](https://github.com/cBournhonesque/lightyear/issues/1351) | Multi-transport server topology is still unsettled upstream. | Treat our WebTransport-first plus native transport split as an integration boundary we own. |
| [#1303](https://github.com/cBournhonesque/lightyear/issues/1303), [#1278](https://github.com/cBournhonesque/lightyear/issues/1278), [#1174](https://github.com/cBournhonesque/lightyear/issues/1174), [#949](https://github.com/cBournhonesque/lightyear/issues/949), [#905](https://github.com/cBournhonesque/lightyear/issues/905) | Transport lifecycle and connection UX still have unresolved edges. | Keep disconnect handling, fallback behaviour, and server startup/shutdown semantics explicit in Sidereal. |
| [#643](https://github.com/cBournhonesque/lightyear/issues/643) and [#1363](https://github.com/cBournhonesque/lightyear/issues/1363) | Compile-time and dependency-health issues affect upgrade cost. | Keep Lightyear upgrade work scoped and verify build/perf impact before committing to new protocol surface area. |

## Related Merged Pull Request

Not part of the issue count above, but directly relevant:

- [#1421](https://github.com/cBournhonesque/lightyear/pull/1421) `interpolation: initialize confirmed history when Interpolated is added`
  - Merged into upstream `main` via commit [`af25682`](https://github.com/cBournhonesque/lightyear/commit/af25682) on 2026-04-22.
  - The merge commit's public Actions run [`24797547143`](https://github.com/cBournhonesque/lightyear/actions/runs/24797547143) showed failures in `Format` and `lightyear_tests`; unauthenticated public metadata did not expose full test logs.
  - Local checks against `af25682` and parent `eedb9ed` indicate the visible failures were pre-existing: `cargo fmt --all -- --check` failed on unrelated `lightyear_avian` / `lightyear_replication` files in both commits, and `cargo test -p lightyear_interpolation --lib` failed in both commits on `plugin::tests::test_interpolation_delay` due to exact float comparison (`0.6000061` vs `0.6`). The new #1421 confirmed-history tests passed locally.
  - This appears to address one specific interpolation-history gap that also shows up in Sidereal's control-transfer analysis.
  - Treat it as landed on upstream `main` with no reproduced evidence that it caused the visible CI failures, but still not as a released dependency until a tagged Lightyear release includes it and Sidereal validates it against the predicted/interpolated handoff flow.

## Related Open Pull Request

- [#1451](https://github.com/cBournhonesque/lightyear/pull/1451) `fix(interpolation): converge on latest confirmed value under packet loss`
  - Open as of 2026-04-26.
  - Proposed behavior is relevant to Sidereal remote motion: keep a bracketing pair in `ConfirmedHistory`, clamp interpolation fraction, and write/rebase the current component on idle convergence.
  - Sidereal's pinned Dastari fork includes this behavior as of `c21af0fe0cf151911a388296798411b29b6f4a06`; the older Cargo `[patch."https://github.com/Dastari/lightyear"]` override has been removed.

## Full Inventory

### Prediction / Interpolation

| Issue | Labels | Title |
|---|---|---|
| [#1328](https://github.com/cBournhonesque/lightyear/issues/1328) | C-Bug, A-Prediction | Applying messages from the future causes prespawned entity match errors |
| [#1251](https://github.com/cBournhonesque/lightyear/issues/1251) | A-Prediction | Prediction issues |
| [#1244](https://github.com/cBournhonesque/lightyear/issues/1244) | A-Prediction, A-Replication, A-Interpolation | Add replicate_if_predicted/interpolated |
| [#1235](https://github.com/cBournhonesque/lightyear/issues/1235) | A-Prediction | Rollbacking to a tick earlier than the previous rollback causes issues |
| [#1232](https://github.com/cBournhonesque/lightyear/issues/1232) | A-Prediction, A-Replication, C-Performance | Relax prediction assumptions |
| [#1228](https://github.com/cBournhonesque/lightyear/issues/1228) | A-Interpolation | Spawn Interpolated entity only when the interpolation timeline reaches the spawn tick |
| [#1097](https://github.com/cBournhonesque/lightyear/issues/1097) | A-Prediction, A-Input | Add unit test for remote input behaviour in lockstep mode |
| [#1074](https://github.com/cBournhonesque/lightyear/issues/1074) | A-Prediction | Fix some prediction inefficiencies |
| [#1044](https://github.com/cBournhonesque/lightyear/issues/1044) | A-Prediction | Predicted DefaultFilter during rollbacks |
| [#1034](https://github.com/cBournhonesque/lightyear/issues/1034) | A-Prediction, A-Interpolation | Add PredictionSwitching |
| [#967](https://github.com/cBournhonesque/lightyear/issues/967) | A-Interpolation | Provide an interpolation buffer to apply events/components at the interpolation_tick |
| [#963](https://github.com/cBournhonesque/lightyear/issues/963) | A-Replication, A-Interpolation | Provide a way to send messages/component for a given Timeline? |
| [#957](https://github.com/cBournhonesque/lightyear/issues/957) | C-Bug, A-Prediction, A-Replication | The Confirmed.tick can be incorrect when spawning PreSpawned entities |
| [#890](https://github.com/cBournhonesque/lightyear/issues/890) | A-Interpolation | Improve interpolation default config |
| [#888](https://github.com/cBournhonesque/lightyear/issues/888) | A-Prediction | Improve prediction |
| [#886](https://github.com/cBournhonesque/lightyear/issues/886) | A-Prediction, A-Interpolation, C-Example | Add Extrapolation + an entity with replicated vehicles |
| [#847](https://github.com/cBournhonesque/lightyear/issues/847) | A-Interpolation | Enable sending interpolation updates with a history. |
| [#829](https://github.com/cBournhonesque/lightyear/issues/829) | A-Interpolation | Interpolation API is confusing |

### Replication / Visibility / Hierarchy

| Issue | Labels | Title |
|---|---|---|
| [#1332](https://github.com/cBournhonesque/lightyear/issues/1332) | A-Replication, C-Performance | Optimize replication cache efficiency |
| [#1287](https://github.com/cBournhonesque/lightyear/issues/1287) | A-Replication, A-Hierarchy, A-Avian | Improve relationship replication |
| [#1264](https://github.com/cBournhonesque/lightyear/issues/1264) | A-Replication | Improve Lifetime behaviour |
| [#1262](https://github.com/cBournhonesque/lightyear/issues/1262) | A-Replication | Make Replicated a Relationship |
| [#1233](https://github.com/cBournhonesque/lightyear/issues/1233) | A-Input, A-Replication | Add unit test for prespawned input |
| [#1195](https://github.com/cBournhonesque/lightyear/issues/1195) | A-Replication | Replicating relationships loses the order of the Relationship Target |
| [#1178](https://github.com/cBournhonesque/lightyear/issues/1178) | C-Bug, A-Replication | segfault in projectiles demo |
| [#1122](https://github.com/cBournhonesque/lightyear/issues/1122) | A-Replication | Maybe do not include the ReplicationGroup in replication updates |
| [#1045](https://github.com/cBournhonesque/lightyear/issues/1045) | A-Replication | Improve DeltaCompression performance |
| [#996](https://github.com/cBournhonesque/lightyear/issues/996) | A-Replication | Register Res<State<S>> and Res<NextState<S>> for synchronization |
| [#960](https://github.com/cBournhonesque/lightyear/issues/960) | C-Bug, P-Critical, A-Replication | Add unit test for replication bug |
| [#740](https://github.com/cBournhonesque/lightyear/issues/740) | A-Replication | ReplicationMode::SinceLastSend doesn't work in all situations |
| [#651](https://github.com/cBournhonesque/lightyear/issues/651) | A-Visibility | Add option in Visibility to not despawn entities when they stop being visible |
| [#630](https://github.com/cBournhonesque/lightyear/issues/630) | A-Replication | feat: Multiple Protocol Support |

### Input / Sync / Host Mode

| Issue | Labels | Title |
|---|---|---|
| [#1417](https://github.com/cBournhonesque/lightyear/issues/1417) | - | Messages sent via `ServerMultiMessageSender` can't be received in HostClient mode |
| [#1434](https://github.com/cBournhonesque/lightyear/issues/1434) | - | Bevy Enhanced Input and host-client does not work |
| [#1402](https://github.com/cBournhonesque/lightyear/issues/1402) | C-Bug, A-Input, A-Sync | Default `no_input_delay` config doesn't reliably deliver inputs on localhost due to sync error margin tolerance |
| [#1394](https://github.com/cBournhonesque/lightyear/issues/1394) | C-Bug, A-Input, C-Example | Input Broken on host-client Mode examples |
| [#1348](https://github.com/cBournhonesque/lightyear/issues/1348) | C-Bug, C-Example | Projectiles example — Host-client server cannot move; input mapped to PLACEHOLDER entity |
| [#1336](https://github.com/cBournhonesque/lightyear/issues/1336) | A-Input | TickDelta not rounded correctly? |
| [#1283](https://github.com/cBournhonesque/lightyear/issues/1283) | A-Input | Input should not be accepted from any client for any entity |
| [#1280](https://github.com/cBournhonesque/lightyear/issues/1280) | - | Make RawConnection work in HostServer mode |
| [#1238](https://github.com/cBournhonesque/lightyear/issues/1238) | C-Bug, A-Input, C-Example | Remaining issues for release |
| [#1148](https://github.com/cBournhonesque/lightyear/issues/1148) | - | Don't serialize messages from Server to HostClient |
| [#1111](https://github.com/cBournhonesque/lightyear/issues/1111) | A-Input | Extra features for deterministic lockstep |
| [#1086](https://github.com/cBournhonesque/lightyear/issues/1086) | A-Sync | Potential timeline sync issues |
| [#1080](https://github.com/cBournhonesque/lightyear/issues/1080) | A-Input | Support 'global' inputs by attaching InputMarker to the Client entity |
| [#1077](https://github.com/cBournhonesque/lightyear/issues/1077) | C-Bug | HostClient is probably not feasible because frames seem frozen when alt-tabbing? |
| [#1041](https://github.com/cBournhonesque/lightyear/issues/1041) | A-Input, C-Performance | Issues with inputs |
| [#961](https://github.com/cBournhonesque/lightyear/issues/961) | C-Bug, A-Input, C-Example | Avian3d example broken in host-server mode with predict_all = False |
| [#927](https://github.com/cBournhonesque/lightyear/issues/927) | A-Sync | Update sync in PreUpdate |

### Transport / Netcode

| Issue | Labels | Title |
|---|---|---|
| [#1376](https://github.com/cBournhonesque/lightyear/issues/1376) | A-Transport | Disconnect reason should be an enum instead of a String |
| [#1351](https://github.com/cBournhonesque/lightyear/issues/1351) | - | Handle multiple ServerIOs in the same app (Steam + UDP + WebTransport, ecc.) |
| [#1303](https://github.com/cBournhonesque/lightyear/issues/1303) | A-Transport | Unable to access OS assigned port for ServerUdpIo |
| [#1278](https://github.com/cBournhonesque/lightyear/issues/1278) | - | Unable to connect to hostname / domain directly |
| [#1174](https://github.com/cBournhonesque/lightyear/issues/1174) | C-Bug, A-Transport | Unlink doesn't shut down the underlying IO |
| [#1156](https://github.com/cBournhonesque/lightyear/issues/1156) | - | Steam does not work in headless mode |
| [#1088](https://github.com/cBournhonesque/lightyear/issues/1088) | A-Transport | Reset netcode state on Stopped |
| [#1081](https://github.com/cBournhonesque/lightyear/issues/1081) | A-Transport | Make it easier to use a LinkConditioner on the server |
| [#949](https://github.com/cBournhonesque/lightyear/issues/949) | - | Closing tab on webtransport client disconnects but then spams the server logs |
| [#905](https://github.com/cBournhonesque/lightyear/issues/905) | - | Client don't disconnect and spams error when the server stops while using LocalChannel transport |
| [#692](https://github.com/cBournhonesque/lightyear/issues/692) | A-Netcode | Server doesn't check ConnectionToken's server address |

### Avian / Physics

| Issue | Labels | Title |
|---|---|---|
| [#1266](https://github.com/cBournhonesque/lightyear/issues/1266) | A-Avian | Integrate with bevy_transform_interpolation |
| [#1253](https://github.com/cBournhonesque/lightyear/issues/1253) | C-Bug, C-Example, A-Avian | Collision issue with avian |
| [#1128](https://github.com/cBournhonesque/lightyear/issues/1128) | A-Avian | lightyear_avian interferes with child collider sync |

### Performance / Build / Maintenance

| Issue | Labels | Title |
|---|---|---|
| [#1363](https://github.com/cBournhonesque/lightyear/issues/1363) | - | Cargo audit found a few unmaintained dependencies in lightyear |
| [#1342](https://github.com/cBournhonesque/lightyear/issues/1342) | C-Performance | Avoid live memory allocations |
| [#1294](https://github.com/cBournhonesque/lightyear/issues/1294) | C-Performance | Avoid nested hashmaps |
| [#1290](https://github.com/cBournhonesque/lightyear/issues/1290) | C-Performance | Memory Leak? |
| [#1063](https://github.com/cBournhonesque/lightyear/issues/1063) | C-Performance | Check for extra allocations/leaks |
| [#893](https://github.com/cBournhonesque/lightyear/issues/893) | C-Performance | Make NetworkTarget operations cheaper |
| [#763](https://github.com/cBournhonesque/lightyear/issues/763) | - | Limit code-gen if component replication is unidirectional |
| [#643](https://github.com/cBournhonesque/lightyear/issues/643) | C-Performance | `register_component` / `register_resource` calls cause noticeable growth in compile time |

### Docs / Examples / Tooling / Other

| Issue | Labels | Title |
|---|---|---|
| [#1413](https://github.com/cBournhonesque/lightyear/issues/1413) | - | jenkinssoftware.com is down and that broke documentation within lightyear |
| [#1380](https://github.com/cBournhonesque/lightyear/issues/1380) | - | Required components do not get assigned by interpolation. |
| [#1350](https://github.com/cBournhonesque/lightyear/issues/1350) | - | Replicon integration |
| [#1347](https://github.com/cBournhonesque/lightyear/issues/1347) | - | Add visibility unit test |
| [#1301](https://github.com/cBournhonesque/lightyear/issues/1301) | - | Publish `lightyear-test` utilities for external game projects |
| [#1200](https://github.com/cBournhonesque/lightyear/issues/1200) | - | Panic: subtract with overflow |
| [#1185](https://github.com/cBournhonesque/lightyear/issues/1185) | C-Usability | Remove ClientState in favor of a custom QueryData |
| [#1184](https://github.com/cBournhonesque/lightyear/issues/1184) | C-Bug, C-Example | Examples fail under certain feature combinations |
| [#1182](https://github.com/cBournhonesque/lightyear/issues/1182) | - | Issues after 0.21 |
| [#1176](https://github.com/cBournhonesque/lightyear/issues/1176) | - | `LinkState::Linked` Typo |
| [#1132](https://github.com/cBournhonesque/lightyear/issues/1132) | - | Add example for bandwidth test |
| [#1131](https://github.com/cBournhonesque/lightyear/issues/1131) | - | Update avian example to optionally have child colliders |
| [#1123](https://github.com/cBournhonesque/lightyear/issues/1123) | C-Book | Mention PredictionManager in the docs on client prediction |
| [#1108](https://github.com/cBournhonesque/lightyear/issues/1108) | C-Bug | Implement TickCleanUp and TickSync for every component/resource that holds ticks |
| [#1046](https://github.com/cBournhonesque/lightyear/issues/1046) | - | Use crossfig for easier features management |
| [#942](https://github.com/cBournhonesque/lightyear/issues/942) | - | TimeManager + rollback issues |
| [#882](https://github.com/cBournhonesque/lightyear/issues/882) | C-Usability | Use type restrictions in component registry |
| [#836](https://github.com/cBournhonesque/lightyear/issues/836) | - | Add tick-buffered channel? |
| [#834](https://github.com/cBournhonesque/lightyear/issues/834) | - | Horizontally scaling `lightyear` for high-availability |
| [#800](https://github.com/cBournhonesque/lightyear/issues/800) | C-Usability | Flesh out the visualizer |
