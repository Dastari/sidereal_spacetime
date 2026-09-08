# Pattern A Fresh-Connection Handoff Design Slice

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Pattern A Fresh-Connection Handoff Design Slice.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-27  
Scope: Phase 7.1 controlled-root handoff closure, replacing single-connection shard re-target with a fresh Lightyear client connection per handoff.

## 1. Client Transport Lifecycle

1. Pattern A sequence: on `ClientShardHandoffMessage`, the client verifies the gateway HMAC route token, records the expected `handoff_sequence`, intentionally closes/despawns the old Lightyear client, opens a fresh `RawClient` against the target shard endpoint, sends handoff authentication, then completes cutover only on matching `ServerHandoffReadyMessage`. Current code verifies the token at `bins/sidereal-client/src/runtime/handoff.rs:248`, mutates `session.replication_transport` at `handoff.rs:275`, queues existing clients for despawn at `handoff.rs:284`, immediately starts a new Lightyear client at `handoff.rs:287`, and waits for `ServerHandoffReadyMessage` at `handoff.rs:311`. The divergence is that this still behaves like same-session re-target because old and new Lightyear state can overlap in one ECS tick and the normal auth sender still uses the full JWT path from `bins/sidereal-client/src/runtime/auth_net.rs:1112`.

## 2. Old Transport Teardown

2. Recommendation: close old transport immediately after token verification and before spawning the new client; this is a user decision point, but it best matches the chosen fresh-connection pattern. Deferred close preserves a brief overlap, but the present failures are all overlap/state-retention shaped: stale auth bindings, stale UDP peer routing, and prediction rollback state. Existing disconnect UX already distinguishes expected cleanup paths from unexpected server disconnects at `bins/sidereal-client/src/runtime/transport.rs:669`, so Pattern A should add a handoff-expected close guard there rather than leave two active `Client` entities.

## 3. Handoff Token Preservation

3. Preserve the gateway-signed HMAC handoff token and use it as the target connection's handoff credential, not just as a client-side route trust check. DR-0040 already records shard-delivered, gateway-signed route tokens as a Phase 7 exception to normal gateway-only route consultation at `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md:91`, and the token claims/signature format is cheap HMAC-SHA256 in `crates/sidereal-core/src/handoff_route_token.rs:31`. Surprise: current `ClientAuthMessage` has only `player_entity_id` and `access_token` fields (`crates/sidereal-net/src/lightyear_protocol/messages.rs:9`), and replication auth decodes JWT at `bins/sidereal-replication/src/replication/auth.rs:470`; Pattern A needs a protocol/auth extension if the token is to actually skip full JWT re-auth.

## 4. Test Scaffold Changes

4. The e2e currently fixes one client local UDP address with `CLIENT_UDP_BIND` in `spawn_headless_client` (`bins/sidereal-replication/tests/transport_lightyear_e2e.rs:257`) and creates `client_a_udp_addr` once at `transport_lightyear_e2e.rs:2656`. Pattern A should use a new local port per connection, preferably by passing `127.0.0.1:0` or by adding a handoff-specific ephemeral-bind mode, because `resolved_local_udp_bind_from_config` honors a fixed configured bind exactly (`bins/sidereal-client/src/runtime/transport.rs:214`). The test should stop expecting one stable source port and instead assert 100 ready acks, one authoritative root, zero input drops, and no rollback panic; final p95 is still read from `handoff_cutover_p95_ms` at `transport_lightyear_e2e.rs:2975`.

## 5. Now-Redundant Defenses

5. Classifications only; do not remove until Pattern A is green. `7b0d1c8` stale-binding timestamp filter is partially redundant because fresh connections reduce stale route selection, but the target ack resolver still benefits from recency checks at `bins/sidereal-replication/src/replication/handoff.rs:1090`. `38380f3` and `d31f21d` remain useful as source cleanup until explicit client disconnect/close reliably arrives; their cleanup path is now at `handoff.rs:834`. `0fb7351` retry notices remain useful for packet loss before the old connection closes (`handoff.rs:819`), `cda855a` becomes mostly redundant once duplicate GUID overlap is eliminated, and `84042e3` remains useful because target auth and `ServerHandoffReadyMessage` can still race (`handoff.rs:1028`).

## 6. Lightyear API Gaps

6. Lightyear supports spawning a new `RawClient` entity with fresh `MessageManager`, `ReplicationReceiver`, and `PredictionManager` (`bins/sidereal-client/src/runtime/transport.rs:349`) and triggering `Connect` (`transport.rs:361`), which is enough for Pattern A in principle. The gap is lifecycle orchestration: Sidereal currently despawns and spawns in the same handoff system, while Lightyear prediction state can still observe old confirmed/predicted entities and assert when rollback tick and confirmed tick diverge (`/root/.cargo/git/checkouts/lightyear-cdfa8a04895fe5e3/0ddfd37/lightyear_prediction/src/rollback.rs:615`). If Sidereal cannot isolate old predicted/confirmed state before the new client is active, a fork-side or integration helper for "fresh session reset" may be needed.

## 7. New Failure Modes

7. Pattern A needs coverage for: target connection fails after old close; handoff token expires before target auth; target rejects token/lease/sequence; `ServerHandoffReadyMessage` never arrives after target auth; client receives a stale ready message for the previous `handoff_sequence`; and old transport sends a late duplicate `ClientShardHandoffMessage`. These map to the existing cutover wait loop at `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2908` and token verifier errors at `bins/sidereal-client/src/runtime/handoff.rs:20`.

## 8. Latency Budget Estimate

8. UDP Pattern A on localhost should be roughly: old close/despawn 0-1 frame, UDP bind/connect/link setup 10-50 ms, HMAC token verify microseconds, auth/control message round trip 10-50 ms, visibility/first replication/ready ack 50-150 ms depending on tick cadence. WebTransport adds certificate/TLS setup and can push this substantially higher than UDP. Compared with the current single-connection sample around 160 ms, correctness may stay in the same order of magnitude or rise; §8 already holds the budget decision until correctness lands (`docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md:410`).

## 9. Implementation Surface Estimate

9. Estimated implementation: 5-7 focused commits. Dominant files: protocol auth shape in `crates/sidereal-net/src/lightyear_protocol/messages.rs:9`, client handoff state/lifecycle in `bins/sidereal-client/src/runtime/handoff.rs:223`, client transport spawn/bind/expected-close handling in `bins/sidereal-client/src/runtime/transport.rs:300`, client auth sender in `bins/sidereal-client/src/runtime/auth_net.rs:1038`, replication auth token acceptance in `bins/sidereal-replication/src/replication/auth.rs:392`, source notice/cleanup in `bins/sidereal-replication/src/replication/handoff.rs:719`, and e2e scaffold/assertions in `bins/sidereal-replication/tests/transport_lightyear_e2e.rs:2592`. The plan ledger should remain untouched until the 100-handoff e2e is green and the user decides the p95 budget outcome.
