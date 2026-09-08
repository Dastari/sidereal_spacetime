# Client Telemetry & Metrics Pipeline — Implementation Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-07-05
Owners: client runtime + gateway + observability + dashboard
Scope: Pipe native/WASM client runtime telemetry into the existing observability metrics store and dashboard so agents can query client behavior instead of relying on screenshots/log paste.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/server_observability_metrics_contract.md
- docs/decisions/dr-0042_client_versioning_and_native_distribution.md
- docs/decisions/dr-0031_lightyear_native_input_runtime_split_followup.md

## 0. Problem & goal

Client-side runtime behavior (prediction/rollback, frame pacing, input lane, interpolation,
flight feel) is currently a diagnostic blind spot: it lives in the F3 overlay on the player's
machine and reaches agents only as screenshots or pasted logs — lossy, slow, and impossible to
query or compare across builds. Every netcode debugging loop in this codebase has paid that tax.

**Goal:** the client emits structured telemetry that lands in the **existing** observability metrics
store, queryable through the **existing** gateway metrics API and dashboard metrics page, tagged so
that:
- multiple concurrent clients are disambiguated (per account / session / instance);
- data is correlatable to a **client build version** (enables objective cross-build A/B — e.g. "did
  the post-release snap rate drop from 0.2.1 → 0.2.2?", the validation we currently cannot run);
- it covers every area we have been debugging (see §4).

**Non-goals:** replacing the F3 overlay (it stays as the live local view); a new bespoke telemetry
store; per-frame raw firehose; storing telemetry in authoritative gameplay tables.

## 1. Core architectural decision

**Client telemetry is a new _source_ into the existing `engine-observability` pipeline, not a new
system.** Do not invent a parallel store, schema, API, or dashboard.

What already exists and is reused verbatim (verified 2026-06-04):
- **Model** (`crates/engine-observability/src/model.rs`): `MetricSample { recorded_at_unix_ms,
  service, instance_id, run_id, domain, metric_key, kind, unit, profile, value, count, sum, min,
  max, labels: Value(JSON), payload: Value(JSON) }`, `DiagnosticEvent`, `MetricBatch { samples,
  events }`, `MetricEmitter` (counter/gauge/histogram builders). `MetricKind` =
  Counter|Gauge|Histogram|Event. `MetricUnit` = Count|Bytes|Seconds|Milliseconds|Percent|Entities|
  Packets|Ticks. `DiagnosticsDomain` already includes `Prediction`, `Interpolation`, `Visibility`,
  `Assets`, `Host`, `Tactical`, `Persistence`, `Lua`, `Db`, `OwnerManifest`.
- **Store** (`engine-observability` Postgres): tables `observability_metric_catalog`
  (metric_key PK, domain, `labels_schema_json` JSONB), `observability_metric_samples`
  (service, instance_id, run_id, domain, metric_key, kind, unit, value/count/sum/min/max,
  `labels_json` JSONB, `payload_json` JSONB; indexed by time, key+time, domain+time), and
  `observability_events`. `MetricsWriterHandle` + `start_postgres_metrics_writer` are the write side;
  `MetricsStore` + `MetricsQuery`/`MetricsPruneRequest` are the read side.
- **Gateway read API** (`bins/sidereal-gateway/src/metrics_api.rs`): `/admin/metrics/v1/{catalog,
  samples,events,summary,dashboard,export,prune,reset-series}`, scopes `metrics:read`/`metrics:export`
  /`metrics:prune`.
- **Dashboard** (`dashboard/src/features/metrics/*`, `dashboard/src/server/metrics-proxy.ts`,
  `dashboard/src/routes/api.metrics.*.tsx`): catalog/series/samples/events/overview UI that renders
  arbitrary domains/keys/labels.

The only genuinely new surface is **how client samples get _in_**: the client cannot (and must not)
write Postgres directly — it is untrusted, remote, and runs on WASM. So the client **POSTs
`MetricBatch`es to a new session-authenticated gateway ingest endpoint**, which validates, stamps
trusted identity labels, and writes them into the same store via `MetricsWriterHandle`.

```
client (native/WASM)
  └─ MetricEmitter (reuse engine-observability model)  ── batches 1 Hz + events
        └─ POST /client/telemetry/v1/ingest  (session-auth, rate-limited, bounded)
              └─ gateway: validate + stamp account/session/build labels
                    └─ MetricsWriterHandle ──► observability_metric_samples / _events (PG)
                          └─ /admin/metrics/v1/* ──► dashboard metrics page (filter source=client)
```

Result: client metrics share the model, store, catalog, query API, and dashboard with server
metrics — "aligned with how server metrics work" by construction.

## 2. Trust, identity & multi-client model

The client is untrusted (cf. the authenticated input lane, DR-0031). The ingest endpoint inherits the
same posture as `replication/input.rs`:

- **Session-authenticated, NOT admin.** Auth via the player's gateway access token (the same bearer
  the client already holds), validated like `client_release_manifest` in
  `bins/sidereal-gateway/src/api.rs` (`extract_bearer_token` → `service.me`). `metrics:*` admin
  scopes are for the read/prune side only; ingest needs a player session, never an admin role.
- **Server stamps identity; client cannot claim it.** The gateway derives `account_id` and
  `session_id` (and any player entity id) from the validated token and writes them as **trusted
  labels**, overwriting anything the client put there. The client supplies only *self-descriptive*
  labels it is allowed to assert: `build_version`, `platform` (native/wasm), `gpu`, `os`,
  `session_uptime_s`, and a client-generated `instance_id` (random per process, for disambiguating
  two windows on one account).
- **Rate-limited + bounded**, mirroring `MAX_MESSAGES_PER_SECOND`/`MAX_ACTIONS_PER_PACKET`/window
  logic in `replication/input.rs`: per-account ingest rate cap (e.g. ≤ 2 batches/s), max batch byte
  size, max samples/events per batch, max metric_key length, and an allowlist of metric_key prefixes
  (reject unknown keys so a client cannot bloat the catalog with arbitrary cardinality). Over-limit →
  drop + a gateway counter (`client_telemetry_ingest_rate_limited_total`), never a 5xx storm.
- **Multi-client is just labels.** Because every `MetricSample` already carries `service`,
  `instance_id`, `run_id`, and JSON `labels`, N concurrent clients are distinguished with zero schema
  change: `service="sidereal-client"`, `instance_id=<per-process>`, `labels.account_id`,
  `labels.session_id`, `labels.build_version`. Dashboard queries filter/group on these.
- **PII / separation.** Telemetry rows live in the same `observability_*` tables (not gameplay
  tables) but carry account/session ids + system info (OS/CPU/GPU). Treat as operational diagnostics:
  apply a **shorter retention** for `service="sidereal-client"` rows than server rows, and document
  the retention in the metrics contract. Do not join telemetry to gameplay/auth records in the
  dashboard beyond account id.

## 3. Surfaces to change (four areas)

### 3a. Client (`bins/sidereal-client`)
- **WASM-safe model reuse.** Confirm `engine-observability`'s `model` module builds for
  `wasm32-unknown-unknown` (it is pure serde/`Value`); feature-gate the Postgres `writer`/`host`
  behind a `native`/`postgres` feature so the client depends only on the model. (Add the feature in
  `crates/engine-observability/Cargo.toml`; the client must keep WASM + Windows cross-checks green.)
- **`ClientTelemetry` resource + `MetricEmitter`** (`service="sidereal-client"`, `run_id` = session
  id, `instance_id` = per-process random). A bounded ring buffer of pending samples/events.
- **Collection systems** (Bevy): one ~1 Hz rollup system that reads the same sources the F3 overlay
  already computes (it is the inventory of "what to collect" — see `runtime/debug_overlay/*` and the
  `ClientPhase0Diagnostics`/`PredictionCorrectionTuning`/`NativePredictionRecoveryState` resources),
  plus event emitters at notable edges (hard resync, focus stall/recover, rollback-depth spike,
  control handoff, asset reload). Gate all collection behind a runtime toggle + `SIDEREAL_DIAGNOSTICS`
  parity so it is off by default and cheap when off.
- **Flush system**: drains the ring buffer into a `MetricBatch`, serializes (serde_json), and POSTs to
  the ingest endpoint using the **existing client HTTP path** (native reqwest / WASM fetch — the same
  mechanism as `runtime/startup_assets.rs` / `auth_net.rs` manifest fetch). Flush cadence ~1–5 s or on
  event burst; coalesce; never block the frame (use the existing async task pattern). On failure,
  bounded retry then drop (telemetry must never degrade gameplay).
- **Labels** the client attaches: `build_version` (the baked workspace version, DR-0042),
  `platform`, `gpu`, `os`, `cpu`, `focused`. Identity labels are left for the gateway to stamp.

### 3b. Gateway (`bins/sidereal-gateway`)
- **New route** `POST /client/telemetry/v1/ingest` (note: under `/client/...` like the DR-0042
  download routes, session-auth — *not* under `/admin/metrics/v1/...`, which stays admin/read).
- Handler: validate bearer → `service.me`; enforce rate-limit + size/cardinality bounds; **stamp
  trusted labels** (`account_id`, `session_id`, server `received_at_unix_ms`) over the batch; reject
  metric keys outside the client allowlist; write via `MetricsWriterHandle` (same handle the gateway
  already holds for the read store, or a dedicated client-ingest writer).
- **Catalog registration**: register the client metric catalog entries (key/domain/kind/unit/labels
  schema) so `/admin/metrics/v1/catalog` advertises them, exactly as server metrics are cataloged.
- Add ingest health counters to the gateway health/metrics: `client_telemetry_ingest_batches_total`,
  `client_telemetry_ingest_samples_total`, `client_telemetry_ingest_rejected_total`,
  `client_telemetry_ingest_rate_limited_total`, `client_telemetry_ingest_bytes_total`.

### 3c. Database / store (`crates/engine-observability`)
- **No new core schema** — client samples use `observability_metric_samples`/`_events` as-is
  (service/labels/domain already carry everything). 
- **Add**: (1) a GIN index on `labels_json` (filter/group by `account_id`/`session_id`/`build_version`
  is the core query); (2) a retention/prune lane for `service="sidereal-client"` (extend
  `MetricsPruneRequest`/the prune job with a per-service TTL, shorter than server rows); (3) optionally
  a generated `source` column or a documented `labels.source` convention if querying by source proves
  hot. Prefer labels + index over new columns unless profiling demands it.
- Keep all DDL in the existing `engine-observability` Postgres migration/bootstrap path (there is no
  `migrations/*.sql` dir; schema is created in `postgres_store.rs` `CREATE TABLE IF NOT EXISTS`).

### 3d. Dashboard (`dashboard/`)
- The existing metrics page already renders arbitrary domains/keys/labels, so most of this is
  filtering + curation, not new infrastructure. Load `sidereal-frontend` rules when implementing
  (semantic tokens, Zod on all query params, route-boundary + bundle-splitting).
- Add a **source/service filter** (`sidereal-client` vs shard services) to `MetricFilters.tsx` and the
  metrics query schemas; add label filters for `account_id`/`session_id`/`build_version`.
- Add a **Client panel/tab** in `MetricsPage.tsx` (or a sibling route) with curated series for the §4
  metric set, reusing `MetricChartPanel`/`MetricSeriesTable`/`MetricEventsPanel`.
- Add a **build-comparison view**: group a chosen series (e.g. `prediction_rollbacks_per_s`) by the
  `build_version` label so two client builds can be overlaid. This is the dashboard expression of the
  cross-build A/B and should be treated as a first-class deliverable, not a nice-to-have.
- The proxy layer (`metrics-proxy.ts`) already gates read with `metrics:read`; client telemetry is
  read through the *same* admin metrics endpoints, so no new dashboard auth surface — ingest is the
  client's concern, viewing stays admin.

## 4. Metric set (covers every area we have debugged)

Format rules (align with `server_observability_metrics_contract.md`): `metric_key` is lowercase
snake_case, grouped by `DiagnosticsDomain`, with explicit `MetricKind`/`MetricUnit`. Gauges carry the
instantaneous value; rates are pre-divided per second; latencies use Milliseconds; distributions use
Histogram (count/sum/min/max). Every sample carries the identity + `build_version` labels from §2.

| Domain | metric_key | kind | unit | why (issue area) |
|---|---|---|---|---|
| host | `client_fps` | gauge | count | frame starvation (15 FPS root of rollback storm) |
| host | `client_frame_time_ms` | gauge/histogram | milliseconds | frame pacing |
| host | `client_update_ms` | gauge/histogram | milliseconds | the 59 ms CPU-in-Update bottleneck |
| host | `client_fixed_steps_per_frame` | gauge | count | catch-up bursts (multi-step updates) |
| host | `client_stall_gap_ms` | gauge/histogram | milliseconds | 195 ms stalls / tick debt |
| host | `client_window_focused` | gauge | count | focus-stall recovery loop |
| prediction | `prediction_rollbacks_per_s` | gauge | count | rollback storm (overlay error >10/s) |
| prediction | `prediction_rollback_depth` | histogram | ticks | re-sim depth |
| prediction | `prediction_tick_gap` | gauge | ticks | predicted-vs-confirmed gap (Ctrl TickGap) |
| prediction | `prediction_input_history_carry_forward_total` | counter | count | the carry-forward fix firing (vs exact hit / true miss) |
| prediction | `prediction_input_history_miss_total` | counter | count | replay gaps (un-recorded ticks) |
| prediction | `prediction_hard_resync_total` | counter | count | seed/hard-resync events |
| prediction | `prediction_focus_recovery_total` | counter | count | focus stall → recover |
| prediction | `prediction_controlled_heading_error_rad` | gauge | count | the turn-then-release heading snap |
| prediction | `prediction_controlled_position_error_m` | gauge | count | predicted vs confirmed drift |
| input | `input_send_age_ms` | gauge | milliseconds | input lane latency (pairs with server `shard_input_oldest_age_ms`) |
| input | `input_messages_sent_per_s` | gauge | count | send cadence / heartbeat |
| interpolation | `interpolation_delay_ms` | gauge | milliseconds | remote-ghost interpolation buffer |
| interpolation | `interpolation_buffer_snapshots` | gauge | count | under/overflow → remote stutter |
| assets | `client_layer_recompute_per_s` | gauge | count | per-frame layer/asset waste (Update cost) |
| assets | `client_asset_rebuilds_total` | counter | count | asset churn |
| host (event) | `client_runtime_event` | event | — | hard resync, focus stall, handoff, snap-detected, control change |

Notes:
- Use `payload` JSON on events to carry structured context (e.g. snap magnitude, generation, tick).
- Add `prediction_*` keys to the `prediction` domain so they sit beside any future server-side
  prediction metrics; reuse `host` for frame/FPS; reuse `interpolation`/`assets`/`input` for the rest.
- Keep cardinality bounded: identity labels only; do NOT label by entity id or per-tick values.

## 5. Phasing (ship value early, gate the heavy parts)

- **Phase 0 — interim structured client log (small, immediate).** Emit the §4 metric set as
  structured `tracing` fields at ~1 Hz from the client (the Phase 0 diagnostics already do this with
  `phase0_rollback*`). Removes the lossy-screenshot problem now: the user shares one greppable log
  instead of images. Also validates the metric set before any wire work. No gateway/db/dashboard
  change.
- **Phase 1 — model WASM-safety + client emitter + ingest endpoint.** Feature-gate
  `engine-observability` for WASM; build the client emitter/ring/flush; add the session-auth,
  rate-limited gateway ingest route writing via `MetricsWriterHandle`; register the client catalog.
  Gate behind a runtime toggle, default off.
- **Phase 2 — dashboard client view + build comparison.** Source/label filters, the client panel, and
  the `build_version` grouping view.
- **Phase 3 — retention/prune + hardening.** Per-service TTL prune for client rows, GIN label index,
  load-test ingest under multiple clients, finalize bounds.

Each phase is independently shippable; Phase 0 alone materially helps the current debugging.

## 6. Decisions, contract & governance

- **New wire contract crosses the client→server trust boundary** (a client-authored payload accepted
  by the gateway and persisted). This warrants a **Decision Record** — allocate the next free
  `DR-00xx` (check `docs/decision_register.md` for the next id; do not reuse one) covering: the ingest
  route + auth model, trusted-vs-asserted labels, rate/size/cardinality bounds, retention, and the
  metric_key allowlist. Bump no Lightyear/protocol version (this is HTTP, not the realtime lane).
- **Document new metric keys** in `docs/features/active/server_observability_metrics_contract.md` with
  a dated slice entry and the standard "Native/WASM impact" footer (this slice *does* add client
  behavior + a gateway route — state it explicitly).
- **Quality gates** (per touched crate): `siderealctl fmt|clippy|check|test`; client changes must keep
  `wasm32-unknown-unknown` (`bevy/webgpu`) and `x86_64-pc-windows-gnu` cross-checks green; dashboard
  changes run the frontend lint/build + bundle-split checks; `siderealctl docs-check` after doc edits.
- **Observability rules**: collection must route through `engine-observability` + `SIDEREAL_DIAGNOSTICS`
  gating — no new ad-hoc client debug env vars or spammy console logs (cf. `sidereal-observability-net`).

## 7. Open questions for the implementing agent

1. Ingest writer ownership: reuse the gateway's existing `MetricsWriterHandle`, or a dedicated
   client-ingest writer with its own batching/backpressure? (Prefer a dedicated handle so client
   volume cannot starve server-metric writes.)
2. Sampling cadence vs. cost on a 15-FPS client: 1 Hz rollup is cheap, but confirm the collection
   systems add < ~0.5 ms/frame when enabled, and stay fully skippable when disabled.
3. Retention target for client rows (24–72 h?) and whether build-comparison needs a longer-lived
   rollup table than raw samples.
4. Whether to add a minimal `source` generated column now vs. rely on `labels.source` + GIN index
   (decide from a query-plan check once data exists).
5. Anonymization: store raw `account_id`, or a per-account telemetry pseudonym? (Default: account id,
   admin-only viewing, short retention — revisit if telemetry is ever exposed more broadly.)

## 8. Definition of done

- A running client (native and WASM) with telemetry enabled produces rows in
  `observability_metric_samples` with `service="sidereal-client"` and correct identity/`build_version`
  labels, visible through `/admin/metrics/v1/samples` and the dashboard client panel.
- Two clients on one account are distinguishable; two builds are comparable on one chart.
- Ingest is session-authenticated, rate-limited, size/cardinality-bounded, and cannot write gameplay
  tables or claim another account's identity.
- The §4 set covers prediction/rollback, FPS/frame/Update cost, input lane, interpolation, focus,
  flight, and asset churn — i.e. an agent can answer "did the snap rate drop in build N" from a query.
- Gates green; DR recorded; metrics contract updated; `docs-check` clean.

## Closure Note (2026-07-05)

Implemented (DR-0048). Client collection lives in `bins/sidereal-client/src/runtime/telemetry.rs` (~1 Hz rollup, bounded ring buffer, disabled by default); the gateway serves the session-authenticated `POST /client/telemetry/v1/ingest` with per-account rate limiting and a dedicated postgres metrics writer (`bins/sidereal-gateway/src/metrics_api.rs`).
