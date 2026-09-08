# Dashboard Render and Backend Performance Optimization Plan

Status: Implemented
Lifecycle: completed
Category: plan
Last updated: 2026-06-04
Owners: implementation owners
Scope: Dashboard Render and Backend Performance Optimization Plan.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Status Notes

2026-05-14:

- Implemented dashboard graph freshness metadata through a gateway graph summary endpoint and dashboard proxy mode.
- Implemented a metrics dashboard aggregate endpoint and migrated the metrics page loader/refresh path to one browser request per refresh.
- Added virtualized rendering support for the Explorer entity tree and large non-paginated data tables.
- Reduced repeated detail-panel graph edge scans with component edge indexing.
- Moved shader preview animation uniform updates out of route-level React state and reused preview sampler/texture resources.
- Reduced audio waveform playback redraw work by drawing static waveform data separately from DOM marker/playhead overlays and throttling React playhead updates.
- Added large-document idle highlighting for the Prism/use-editable code editor.
- Throttled split-panel drag commits to animation-frame cadence.

## 1. Backend API Changes

- `GET /admin/dashboard/graph/summary` returns `graph`, `revision`, `generatedAtUnixMs`, `nodeCount`, and `edgeCount`.
- Dashboard `/api/graph?mode=summary` proxies the graph summary endpoint while preserving the existing `/api/graph` full payload route.
- `GET /admin/metrics/v1/dashboard` returns catalog, summary, bounded samples, bounded events, generation time, and the accepted query window.
- Dashboard `/api/metrics/dashboard` proxies the aggregate metrics endpoint with the existing gateway session guard.

## 2. Frontend Changes

- Explorer database polling now performs a summary freshness check and skips full graph reloads when the graph revision is unchanged.
- Explorer refreshes are single-flight; overlapping interval/manual refreshes are coalesced into one follow-up refresh.
- Explorer tree rows are flattened and virtualized with `@tanstack/react-virtual`.
- `DataTable` can virtualize large non-paginated row sets and account/table panels no longer pre-filter rows before passing the same query to the table.
- Metrics initial data is no longer immediately duplicate-fetched after the route loader resolves.
- Shader preview RAF animation updates uniform refs and renders directly instead of calling `setUniformValues` every frame.
- Audio playback avoids full waveform redraws for playhead movement.
- Code editor highlighting runs after render and idles for large documents.
- Resizable panel drag callbacks are animation-frame throttled and committed once more on drag end.

## 3. Validation Targets

- Dashboard tests and lint should cover route/proxy schemas, metrics aggregate loading, Explorer refresh behavior, table filtering, and editor large-document fallback.
- Rust gateway checks should cover new graph summary and metrics dashboard endpoint compilation and authorization behavior.
- Manual profiling should verify request counts and React commit frequency on Explorer, Metrics, Shader Workshop, Sound Studio, and database table views.
