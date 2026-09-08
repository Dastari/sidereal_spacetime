# Lightyear Fork Handoff — Server-Outbound (Send-Path) Link Conditioner

Status: Active
Lifecycle: handoff-open
Category: prompt
Last updated: 2026-06-04
Owners: documentation
Scope: Lightyear Fork Handoff — Server-Outbound (Send-Path) Link Conditioner.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Why this prompt exists

Sidereal's Phase 1.1 work needs to attribute perceived MMO "rubber banding" between
"server tick pressure", "uplink (client → server) loss", and "downlink (server → client)
loss / latency / jitter". The existing Lightyear `RecvLinkConditioner` only conditions
the **receive** side of a `Link`. When wired on the replication-server side
(Sidereal does this in `bins/sidereal-replication/src/replication/lifecycle.rs:420`)
it simulates **uplink** loss only — client input packets land in `Link::recv` and the
conditioner delays/drops them there. There is no symmetric way to simulate
**downlink** behaviour from inside the server: server-outbound traffic is pushed into
`Link::send` and immediately drained by the transport IO layer, with no conditioning hook.

Downlink-bound rubber banding (predicted-entity correction stutter, ghost convergence
gaps, periodic snap-back under loss) is the dominant rubber-banding mode in MMOs and
is exactly what an `outbound` conditioner needs to model. The current workaround
(condition on the client end) is per-client-machine, not server-controlled, and is
not suitable for headless server-side load harnesses or for parallelising
asymmetric direction sweeps.

## 1. What we want

A new, project-agnostic, upstreamable `lightyear_link` capability:

1. A `SendLinkConditioner = LinkConditioner<SendPayload>` symmetric to the existing
   `RecvLinkConditioner = LinkConditioner<RecvPayload>`.
2. A new `LinkSender::conditioner: Option<SendLinkConditioner>` field, paralleling the
   existing `LinkReceiver::conditioner` field.
3. A `Link::send(payload)` path that, when a send conditioner is present, calls
   `condition_packet` (loss / latency / jitter) and then releases packets back to
   the underlying send buffer via a new `apply_send_link_conditioner` system in
   `LinkSendSystems::ApplyConditioner` (a new variant mirroring the receive-side
   `LinkReceiveSystems::ApplyConditioner`).
4. An expanded `LinkConditionerConfig` with three new symmetric fields, defaulted
   to zero so existing callers do not change:
   - `outgoing_latency: Duration`
   - `outgoing_jitter: Duration`
   - `outgoing_loss: f32`
   These should not silently double the existing `incoming_*` fields; keep direction
   strictly separated so an asymmetric (uplink-only or downlink-only) configuration
   is expressible.
5. Public `Link::new_with_conditioners(recv, send)` constructor or builder, plus a
   `Link::with_send_conditioner(...)` setter, so callers can install a send-side
   conditioner without re-creating the link.
6. Keep all current `RecvLinkConditioner` behaviour and public API unchanged. New
   functionality must be additive.

The contract should be project-agnostic: no Sidereal-specific tags, no game-domain
references, and no policy logic (e.g., "only enable on debug builds"). Treat this as
a generic Lightyear-fork PR that could be offered upstream against issue
[#1081](https://github.com/cBournhonesque/lightyear/issues/1081).

## 2. Where Sidereal currently wires the receive-path version

Reference these files when validating the symmetric API works the way Sidereal needs:

- `bins/sidereal-replication/src/replication/lifecycle.rs:15` —
  `use lightyear::prelude::{... LinkConditionerConfig, ... RecvLinkConditioner};`
- `bins/sidereal-replication/src/replication/lifecycle.rs:30-34` — env var keys
  (`SIDEREAL_REPLICATION_LINK_CONDITIONER_LOSS_RATIO`, `_LATENCY_MS`, `_JITTER_MS`,
  `_DROP_PATTERN`).
- `bins/sidereal-replication/src/replication/lifecycle.rs:115-225` —
  `LinkConditionerDropPattern`, `LinkConditionerDiagnosticConfig`, and
  `lightyear_config()` that returns `LinkConditionerConfig`.
- `bins/sidereal-replication/src/replication/lifecycle.rs:420-430` — the actual
  wiring point where Sidereal installs `link.recv.conditioner = Some(RecvLinkConditioner::new(config))`
  on every freshly-linked server-side client `Link` entity.
- `bins/sidereal-replication/src/replication/health.rs:809-1183` — the conditioner
  state surfaced in the `/health/replication` JSON, including direction
  (`server_inbound_only`) and transports coverage.

After the fork lands a send-path API, Sidereal will extend its env vars with
matching outbound fields (`_OUTBOUND_LOSS_RATIO`, `_OUTBOUND_LATENCY_MS`,
`_OUTBOUND_JITTER_MS`) and report `link_conditioner_direction` as one of
`server_inbound_only`, `server_outbound_only`, `server_symmetric`, or `off`.
Symmetric defaults must remain off so production is unaffected.

## 3. Acceptance and validation

In the Lightyear fork:

1. `cargo fmt --all -- --check` and `git diff --check` clean.
2. `cargo check --workspace` and `cargo clippy --workspace --all-targets -- -D warnings`
   on the fork.
3. New parallel tests in `lightyear_tests` that mirror the existing receive-path
   tests but install the conditioner on `Link::send.conditioner`:
   - Mirror `lightyear_tests/src/client_server/input/native.rs:179` and
     `lightyear_tests/src/client_server/input/native.rs:337` with a
     `SendLinkConditioner` installed on the server-side `Link` for an outbound
     loss/latency/jitter case.
   - Mirror `lightyear_tests/src/client_server/input/bei.rs:481` and
     `lightyear_tests/src/client_server/delta.rs:237` symmetrically.
   - Mirror `lightyear_tests/src/client_server/prediction/prespawn.rs:335` with the
     conditioner on the **outbound** server `Link` instead of inbound client `Link`.
4. A new direct unit test in `lightyear_link/src/conditioner.rs` that exercises the
   send-path conditioner with deterministic `Instant` and an injected RNG seed for
   `outgoing_loss` reproducibility (extract the existing `rng` dependency into a
   `Conditioner::condition_with_rng` helper rather than re-rolling each call).

In Sidereal (post-fork-bump):

1. `cargo test -p sidereal-replication` keeps passing.
2. `bins/sidereal-replication/src/replication/lifecycle.rs` extends
   `LinkConditionerDiagnosticConfig` with `outbound_loss`, `outbound_latency`,
   `outbound_jitter` and installs `link.send.conditioner` when configured. No
   default changes; production runs are not affected.
3. `bins/sidereal-replication/src/replication/health.rs` reports the inbound /
   outbound directions independently and updates the `link_conditioner_direction`
   field to one of the four documented states. Update the snapshot test cases that
   currently assert `server_inbound_only`.
4. `scripts/capture_phase0_dense_baseline.sh` and
   `scripts/run_mmo_synthetic_load_tier.sh` add gate fields for outbound
   conditioner state in the gate JSON (parallel to current inbound fields), so
   downlink-conditioned captures can be distinguished in reports.
5. `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md` updated with the dated
   status note recording the new fork SHA, the upstream issue reference, and the
   acceptance test results.

## 4. Notes on upstream shape

The current upstream `LinkConditionerConfig` field naming uses `incoming_` for the
receive side. Symmetric `outgoing_` naming is the obvious mirror. Avoid renaming
existing fields to maintain backwards compatibility with any external callers. If
upstream prefers a struct-of-direction shape (e.g., a `Direction::Inbound` /
`Direction::Outbound` enum), discuss in the PR description; Sidereal does not require
a specific structural shape, only:

- Symmetric, independent direction control.
- Default-off behaviour.
- No global mutable state; conditioner state stays on the `Link` entity.
- Re-uses the existing `ReadyBuffer` time-queue plumbing rather than introducing a
  parallel scheduler.

Do not couple this work to issue [#1361](https://github.com/cBournhonesque/lightyear/pull/1361)
(replicon migration). The replicon migration is explicitly deferred for Sidereal and
must not be a dependency of this send-path conditioner work.

## 5. Out of scope

- Per-connection (per-`ClientOf`) conditioning policy. The expectation is that
  installing a conditioner on a server-side `Link` entity already gives per-client
  granularity because each `ClientOf` is its own link entity.
- Per-channel conditioning (e.g., "drop unreliable but not reliable"). Conditioning
  happens at the `Link`/payload level; channel semantics are above that layer.
- Conditioner observability metrics in `lightyear_metrics`. Sidereal's
  `health.rs` already surfaces the configured state on the diagnostic JSON; if a
  future Lightyear PR adds in-crate metric counters that is welcome but it is not a
  blocker for the send-path API.
- Browser-only transport conditioning (WebTransport). The IO layer already drains
  `Link::send`, so the conditioner sits above the transport boundary and works for
  UDP, WebTransport, and crossbeam alike with no per-transport changes.

## 6. Handoff prerequisites

Before opening the Lightyear PR:

1. Read this prompt, AGENTS.md §3 (Sidereal-owns-the-fork rule), DR-0040 §2.8
   (client transport semantics), and `docs/features/reference/lightyear_upstream_issue_snapshot_reference.md`
   for the current fork pin and patch list.
2. Confirm the fork is at SHA `0192db9c9235f807f170c0f7400dd55099a41447` or later;
   the four 2026-05-21 cherry-picks (#1471, #1479, #1473, #1474) must already be in
   the branch.
3. Run `cargo test -p lightyear_link` before any change to capture the current
   baseline; the new send-path tests must extend, not replace, that baseline.
