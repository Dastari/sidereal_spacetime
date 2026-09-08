# DR-0039: Server Observability Metrics

Status: Active
Lifecycle: source-of-truth
Category: decision
Last updated: 2026-06-04
Owners: architecture
Scope: DR-0039: Server Observability Metrics.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Date: 2026-05-05  
Owners: backend + replication + gateway + dashboard diagnostics

## Context

Sidereal has accumulated many environment-variable-driven debug log paths while investigating multiplayer instability, prediction corrections, rubber-banding, interpolation gaps, visibility churn, and server performance. Those logs are difficult for humans and agents to search, are too noisy for default server output, and do not provide a queryable history for graphing.

The replication server already computes a rich in-memory health/TUI snapshot. Gateway already has scoped admin authentication. The missing piece is a shared persistence and access layer for structured metrics.

## Decision

Adopt `sidereal-observability` as the shared backend diagnostics layer.

Decisions:
1. Persist operational metrics and diagnostic events to PostgreSQL relational tables.
2. Keep console/file logs low-noise by default.
3. Replace ad hoc diagnostic env vars with `SIDEREAL_DIAGNOSTICS`.
4. Let replication export the current health/TUI snapshot as structured metrics.
5. Let gateway expose metrics through MFA-protected admin endpoints with route-specific scopes.
6. Require future backend diagnostics to use the shared observability API rather than adding one-off env toggles or console summary logs.

## Alternatives Considered

External Prometheus/OpenTelemetry first:
- Rejected for the first implementation because the immediate need is a repo-local, gateway-secured diagnostic history that agents and dashboard tools can query without extra infrastructure.

Continue log-file diagnostics:
- Rejected because log files do not provide reliable graphing, filtering, retention, or agent-readable query surfaces.

Graph persistence:
- Rejected because operational metrics are time-series/relational data, not authoritative gameplay state.

## Consequences

Positive:
- Networking/performance investigations get structured samples and events.
- Agents can query gateway endpoints instead of scanning log files.
- Default logs stay readable.
- New diagnostic producers get a shared API and schema.

Negative:
- PostgreSQL storage growth must be managed with retention and rollups.
- High-cardinality labels need discipline.
- The first implementation adds relational tables that may later need declarative partitioning.

## Follow-Up

1. Add dashboard graph UI.
2. Add client diagnostic upload for prediction/interpolation/network aggregates.
3. Add rollup and retention workers.
4. Expand targeted metrics around Lightyear transport and client handoff once exposed cleanly.

## References

- `docs/features/active/server_observability_metrics_contract.md`
- `crates/sidereal-observability/`
- `bins/sidereal-replication/src/replication/observability.rs`
- `bins/sidereal-gateway/src/metrics_api.rs`
