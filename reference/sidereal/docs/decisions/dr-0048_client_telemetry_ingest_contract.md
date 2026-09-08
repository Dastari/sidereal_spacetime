# DR-0048: Client Telemetry Ingest Contract

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-04
Owners: client runtime + gateway + observability + dashboard
Scope: DR-0048: Client Telemetry Ingest Contract.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/server_observability_metrics_contract.md
- docs/plans/completed/client_telemetry_metrics_pipeline_plan_2026-06-04.md
- docs/decisions/dr-0042_client_versioning_and_native_distribution.md
- docs/decisions/dr-0031_lightyear_native_input_runtime_split_followup.md

Date: 2026-06-04
Owners: client runtime + gateway + observability + dashboard

## Context

Client-side runtime behavior (prediction/rollback, frame pacing, input lane,
interpolation, focus, asset churn) was a diagnostic blind spot: it lived in the
F3 overlay on the player's machine and reached agents only as screenshots or
pasted logs — lossy, slow, and impossible to query or compare across builds.

The fix is to pipe client telemetry into the **existing** `engine-observability`
metrics store, queryable through the existing gateway metrics API and dashboard,
rather than building a parallel store. The only genuinely new surface is **how an
untrusted, remote, possibly-WASM client gets samples in**: it cannot write
Postgres directly, so it POSTs `MetricBatch`es to a gateway ingest endpoint. That
new HTTP boundary crosses the client→server trust boundary and is accepted +
persisted, so it warrants a decision record.

## Decision

1. **Client telemetry is a new source into the existing pipeline, not a new
   system.** Client samples reuse the `engine-observability` `MetricSample`/
   `MetricBatch` model, the `observability_metric_samples`/`_events` tables, the
   `/admin/metrics/v1/*` read API, and the dashboard metrics page. They are
   distinguished only by labels: `service="sidereal-client"`, per-process
   `instance_id`, and `labels.{account_id,session_id,build_version,...}`.

2. **WASM-safe model split.** `engine-observability` gates its Postgres
   writer/store and `sysinfo` host metrics behind a default-on `postgres-backend`
   feature. The pure-serde `model`/`config` compile for
   `wasm32-unknown-unknown`; the client depends on the crate with
   `default-features = false` and links only the model.

3. **Ingest route and auth.** The gateway exposes
   `POST /client/telemetry/v1/ingest` (under `/client/...`, like the DR-0042
   download routes). It is **session-authenticated** with the player's gateway
   access token, validated exactly like `client_release_manifest`
   (`extract_bearer_token` → `service.me`). It is NOT an admin route; the
   `metrics:*` scopes remain for the read/prune side only.

4. **Trusted vs. asserted labels.** The gateway derives identity from the
   validated token and stamps trusted labels — `source="client"`,
   `account_id` (token `sub`), `session_id` (token `jti`) — over every row,
   overwriting anything the client supplied. The client may assert only
   self-descriptive labels: `build_version`, `platform`, `os`, `gpu`, and a
   client-generated `instance_id`.

5. **Rate limits and bounds** (mirroring `replication/input.rs`): ≤ 2 batches/s
   per account (one-second windows), ≤ 256 samples and ≤ 64 events per batch,
   metric/event-key length ≤ 96 chars, and label values ≤ 128 chars. Over-limit
   or invalid input is dropped and counted, never a 5xx.

6. **Metric-key allowlist.** The shared `client_metric_catalog()` in
   `engine-observability::model` is the single source of truth for the client
   metric set AND the ingest allowlist. The gateway rejects any sample whose
   `metric_key` is not in the catalog (and any event key outside
   `CLIENT_TELEMETRY_EVENT_KEYS`), so an untrusted client cannot bloat the
   catalog with arbitrary cardinality.

7. **Dedicated writer.** Client telemetry is written through a dedicated
   `MetricsWriterHandle` with its own bounded queue, separate from the gateway's
   own-metrics writer, so client volume cannot starve server-metric writes.

8. **Telemetry never writes gameplay tables.** It lands only in
   `observability_*`. It carries account/session ids and system info, so it is
   treated as operational diagnostics: a GIN index on `labels_json` keeps
   identity/build queries fast, and a per-`service` retention lane prunes
   `service="sidereal-client"` rows on a shorter TTL than server rows.

9. **No realtime-protocol version bump.** Ingest is authenticated HTTP, not the
   Lightyear realtime lane, so no `LIGHTYEAR_PROTOCOL_VERSION` change.

## Alternatives Considered

1. A bespoke client telemetry store/schema/API/dashboard: rejected — duplicates
   the existing observability pipeline and splits the query surface.
2. Admin-scoped ingest: rejected — clients are untrusted players and must never
   hold an admin scope; identity must be server-derived, not client-claimed.
3. Trusting client-supplied `account_id`/`session_id` labels: rejected — a client
   could impersonate another account; the gateway stamps identity from the token.
4. An open/unbounded ingest body: rejected — unbounded cardinality and volume
   would let one client degrade the shared store; hence the allowlist + bounds.
5. A new `source` column now: deferred — `labels.source="client"` + the GIN index
   covers the query needs; revisit only if a query-plan check demands a column.

## Consequences

- Positive: client behavior is queryable and comparable across builds through the
  same tools as server metrics; two clients on one account and two builds on one
  chart are distinguishable with zero schema change.
- Positive: the trust boundary is explicit and bounded; telemetry cannot write
  gameplay tables or claim another account.
- Negative: the client adds a wasm-safe dependency on `engine-observability`'s
  model and a bounded HTTP flush path; the gateway carries a new authenticated
  route and per-account rate-limit state.

## Open Follow-Ups

- Wire remaining §4 metrics (interpolation buffer, layer recompute, controlled
  heading/position error, hard-resync events) as their client sources stabilize.
- Decide a final client retention target (24–72 h) and whether build comparison
  needs a longer-lived rollup than raw samples.
- Revisit anonymization (raw `account_id` vs. a per-account telemetry pseudonym)
  if telemetry is ever exposed beyond admin-only viewing.
