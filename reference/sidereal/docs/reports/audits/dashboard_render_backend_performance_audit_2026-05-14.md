# Dashboard Render and Backend Performance Audit

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Dashboard Render and Backend Performance Audit.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Status note 2026-05-14: Fresh audit of the current dashboard workspace. Scope was browser rendering, React re-render pressure, polling/fetch behavior, and dashboard-driven backend load. This report is audit-only and does not change runtime behavior. Native impact: none. WASM impact: none for the game client; findings are dashboard/browser tooling only.

## Summary

The dashboard already has several good foundations: major routes are lazy split, the database routes now use route loaders, canvas rendering is mostly request-driven rather than a permanent animation loop, metrics charts lazy-load ECharts, and several hot lists use `useMemo`.

The main performance risks are not isolated micro-optimizations. They are repeated whole-snapshot reads, full-array derivation on every poll, and render loops that route high-frequency work through React state. The highest-priority fixes should reduce the amount of data fetched and diffed before tuning individual components.

## Findings

### 1. Explorer full-snapshot polling is the largest browser and backend risk

Severity: High

Evidence:

- `ExplorerWorkspace` polls every 5 seconds with `setInterval`, regardless of whether the previous request has completed (`dashboard/src/features/explorer/ExplorerWorkspace.tsx:1047`).
- Database mode fetches `/api/graph`, rebuilds `Map`/array state, then fetches the generated component registry (`dashboard/src/features/explorer/ExplorerWorkspace.tsx:636`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx:641`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx:706`).
- Live mode fetches a full BRP snapshot, then `world.list_resources`, then selected resource values every poll (`dashboard/src/features/explorer/ExplorerWorkspace.tsx:727`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx:786`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx:791`).
- The gateway graph endpoint reads the entire graph with unbounded `MATCH (n)` and `MATCH (a)-[r]->(b)` queries (`bins/sidereal-gateway/src/admin_dashboard.rs:1490`, `bins/sidereal-gateway/src/admin_dashboard.rs:1500`, `bins/sidereal-gateway/src/admin_dashboard.rs:1550`).

Impact:

- If graph or BRP calls exceed 5 seconds, requests can overlap. That can stack browser JSON parsing, React state replacement, gateway proxy work, blocking Postgres/AGE tasks, and replication health/BRP pressure.
- Graph growth will scale poorly because every poll serializes all nodes, all edges, and all properties even when the visible map/tree needs only a subset.

Recommendation:

- Replace fixed `setInterval` with a single-flight `setTimeout` scheduled after completion. Add an in-flight guard and abort on tab/source changes and unmount.
- Add freshness metadata (`revision`, `updated_at`, or ETag-style token) so the dashboard can skip state replacement when the snapshot is unchanged.
- Split graph reads into summary/list/detail endpoints. Keep `/api/graph` bounded by entity roots and essential display components; fetch component payloads and relationships on expansion/selection.
- Cache BRP resource listing and registry values per tab until their revision changes. Avoid hydrating registry resources every 5 seconds.
- Add dashboard-facing backend timing metrics for graph query time, graph payload bytes, BRP snapshot bytes, and skipped/unchanged snapshots.

### 2. Explorer render state is rebuilt and recursively rendered as whole trees

Severity: High

Evidence:

- Every successful live poll replaces `graphNodes`, `graphEdges`, and `entities` with new containers (`dashboard/src/features/explorer/ExplorerWorkspace.tsx:753`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx:762`, `dashboard/src/features/explorer/ExplorerWorkspace.tsx:785`).
- `GridCanvas` rebuilds a map of render nodes from all entities and expanded nodes, then scans visible edges when expanded (`dashboard/src/components/grid/GridCanvas.tsx:226`, `dashboard/src/components/grid/GridCanvas.tsx:287`).
- `EntityTree` groups, sorts, and recursively renders the full open tree (`dashboard/src/components/sidebar/EntityTree.tsx:131`, `dashboard/src/components/sidebar/EntityTree.tsx:188`, `dashboard/src/components/sidebar/EntityTree.tsx:507`, `dashboard/src/components/sidebar/EntityTree.tsx:666`).
- `DetailPanel` derives selected entity components by scanning all graph edges (`dashboard/src/components/sidebar/DetailPanel.tsx:936`).

Impact:

- Even if only one entity changed, most explorer props get new identities and cause the map, tree, and detail panel to recompute.
- The tree has no virtualization/windowing. Large hydrated worlds or expanded hierarchies will produce avoidable DOM work.

Recommendation:

- Normalize explorer snapshots into stable indexes: `entitiesById`, `childrenByParent`, `componentsByEntity`, `edgesByEndpoint`, and `resourcesByTypePath`.
- Apply structural sharing on refresh so unchanged entities/resources preserve object identity.
- Virtualize the entity tree and large resource lists. Keep recursive rendering only for small expanded subtrees, or flatten visible rows first.
- Move selected-detail component derivation to a prebuilt `componentsByEntity` index instead of scanning `graphEdges` on each selected render.

### 3. Metrics refresh fans out into many requests and repeats heavy client derivations

Severity: High

Evidence:

- Default metrics filters include 8 domains (`dashboard/src/features/metrics/schemas.ts:3`).
- A refresh requests catalog, summary, samples per domain, and events per domain (`dashboard/src/features/metrics/api.ts:84`, `dashboard/src/features/metrics/api.ts:106`, `dashboard/src/features/metrics/api.ts:139`). With default domains this is 18 browser-to-dashboard requests every refresh.
- The route loader loads the initial payload, then `MetricsPage` immediately refreshes again from an effect (`dashboard/src/routes/_dashboard.metrics.tsx:14`, `dashboard/src/features/metrics/MetricsPage.tsx:125`).
- Auto-refresh defaults to 5 seconds and refreshes the full payload (`dashboard/src/features/metrics/api.ts:39`, `dashboard/src/features/metrics/MetricsPage.tsx:158`).
- Multiple components normalize, filter, sort, and scan the same sample arrays independently (`dashboard/src/features/metrics/MetricsOverview.tsx:19`, `dashboard/src/features/metrics/MetricsGridCnPanels.tsx:59`, `dashboard/src/features/metrics/MetricChartPanel.tsx:427`, `dashboard/src/features/metrics/metrics-utils.ts:176`, `dashboard/src/features/metrics/metrics-utils.ts:344`).

Impact:

- The metrics page can double-load on first view and then keep issuing a high request count at 5-second cadence.
- Browser work grows with the full selected sample set, not only with visible charts or selected metric keys.
- The gateway and metrics store receive many small parallel queries that could be one bounded dashboard query.

Recommendation:

- Add a single dashboard metrics aggregate endpoint that accepts the dashboard filter and returns catalog revision, summary, sampled chart series, latest overview values, and recent events in one response.
- Do not refresh catalog on every interval unless its revision changed.
- Avoid the immediate client refresh when loader data is fresh.
- Normalize samples once per refresh, build indexes by metric key/domain/service, and pass derived subsets to child panels.
- Precompute default panel series in one pass instead of calling `samplesForPanel` for each panel during render.
- Consider adaptive refresh: slow down when the tab is idle, when data is unchanged, or when the previous refresh exceeded a budget.

### 4. Shader preview animation routes per-frame work through React and WebGPU allocations

Severity: High for `/shader-workshop`

Evidence:

- Animated uniforms update React state every animation frame (`dashboard/src/features/shaders/ShaderWorkshopPage.tsx:657`, `dashboard/src/features/shaders/ShaderWorkshopPage.tsx:675`).
- Uniform state changes trigger `renderPreviewShader`, diagnostics state updates, perf state updates, and status changes (`dashboard/src/features/shaders/ShaderWorkshopPage.tsx:604`, `dashboard/src/features/shaders/ShaderWorkshopPage.tsx:618`, `dashboard/src/features/shaders/ShaderWorkshopPage.tsx:626`, `dashboard/src/features/shaders/ShaderWorkshopPage.tsx:632`).
- The renderer caches pipelines, which is good, but still creates uniform buffers, samplers, bind groups, and sometimes textures for each render pass (`dashboard/src/lib/shader-preview.ts:655`, `dashboard/src/lib/shader-preview.ts:825`, `dashboard/src/lib/shader-preview.ts:830`, `dashboard/src/lib/shader-preview.ts:857`, `dashboard/src/lib/shader-preview.ts:872`).
- Each preview render awaits `queue.onSubmittedWorkDone()` (`dashboard/src/lib/shader-preview.ts:896`).

Impact:

- A preview animation can force React to re-render side panels and controls at frame rate while also allocating WebGPU resources each frame.
- Awaiting submitted work makes the preview path easier to measure but can serialize CPU/GPU pacing in a way that hurts interactivity.

Recommendation:

- Keep animated uniform values in refs or a small preview engine object, not route-level React state.
- Let React state represent committed control values and preview status, while the preview loop writes GPU buffers directly.
- Reuse per-binding uniform buffers and bind groups where layout is stable; update buffer contents with `queue.writeBuffer`.
- Avoid awaiting `onSubmittedWorkDone()` on every animation frame. Sample frame timing periodically or only after explicit validate/apply.
- Pause or drop preview frame rate when the preview is offscreen, the route is hidden, or diagnostics/side panels are being interacted with.

### 5. Audio waveform playback redraws the full waveform on every playhead frame

Severity: Medium-high for `/sound-studio`

Evidence:

- While audio is playing, a `requestAnimationFrame` loop updates `currentTime` through React state (`dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:521`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:530`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:535`).
- `currentTime` changes trigger `drawWaveform` (`dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:668`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:688`).
- `drawWaveform` resizes the canvas, reads computed styles, and scans audio samples per pixel each time (`dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:61`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:68`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:79`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:107`).
- Audio fetches the full asset, clones the `ArrayBuffer`, then decodes it in a new `AudioContext` (`dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:584`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:601`, `dashboard/src/components/audio-studio/AudioWaveformPlayer.tsx:605`).

Impact:

- Playback work scales with waveform width and audio length at frame rate. Zoomed or long assets can burn main-thread time even though only the playhead moved.
- Large audio previews double memory briefly through `bytes` plus `previewBytes`.

Recommendation:

- Precompute waveform peaks by channel and zoom bucket once per asset/zoom. Draw static waveform to an offscreen canvas or cached bitmap.
- Draw markers/playhead on a separate overlay canvas so playback only clears and redraws a thin overlay.
- Keep high-frequency playhead state in a ref and throttle React state to a visible rate, for example 10-15 Hz.
- Avoid cloning the full `ArrayBuffer` where possible. If `<audio>` playback and decode both need bytes, document the memory tradeoff and cap preview size.

### 6. Shared `DataTable` does full client work before pagination, and some callers filter twice

Severity: Medium

Evidence:

- `DataTable` filters every row, sorts every filtered row, and only then slices the current page (`dashboard/src/components/ui/data-table.tsx:198`, `dashboard/src/components/ui/data-table.tsx:218`, `dashboard/src/components/ui/data-table.tsx:271`).
- Account records are pre-filtered in `AccountsPanel`, then passed to `DataTable` with the same toolbar query and `getSearchText`, causing another filter pass (`dashboard/src/features/database/AccountsPanel.tsx:185`, `dashboard/src/features/database/AccountsPanel.tsx:492`, `dashboard/src/features/database/AccountsPanel.tsx:500`).
- Table records do the same pre-filter plus `DataTable` query filtering (`dashboard/src/features/database/TablesPanel.tsx:37`, `dashboard/src/features/database/TablesPanel.tsx:160`, `dashboard/src/features/database/TablesPanel.tsx:170`).
- Gateway database admin payloads are whole-payload reads for accounts, table metadata, script documents, and graph display names (`bins/sidereal-gateway/src/admin_dashboard.rs:306`, `bins/sidereal-gateway/src/admin_dashboard.rs:320`, `bins/sidereal-gateway/src/admin_dashboard.rs:337`, `bins/sidereal-gateway/src/admin_dashboard.rs:338`).

Impact:

- Pagination reduces DOM rows but not filter/sort cost.
- As database/admin records grow, both browser work and gateway SQL work will scale with total records instead of the visible page.

Recommendation:

- Make filtering/sorting single-owner: either caller prefilters and hides the table toolbar query, or `DataTable` owns filtering.
- Add server-backed pagination/search for accounts, script documents, and large table metadata surfaces.
- Add virtualization mode to `DataTable` for client-owned lists that must stay fully local.
- Memoize caller-provided columns where missing, especially when `columns` are rebuilt each render.

### 7. Whole-document code highlighting runs synchronously on every edit

Severity: Medium

Evidence:

- `CodeEditor` tokenizes the complete source with Prism during render (`dashboard/src/components/code-editor/CodeEditor.tsx:64`, `dashboard/src/components/code-editor/CodeEditor.tsx:138`).
- It also recomputes line count with `value.split('\n')` on each render (`dashboard/src/components/code-editor/CodeEditor.tsx:84`).
- Shader and script editors route every edit through this shared editor (`dashboard/src/components/shader-workbench/ShaderCodeEditor.tsx:120`, `dashboard/src/features/script-editor/ScriptCodeEditor.tsx:92`).

Impact:

- Large WGSL or Lua files can make typing latency depend on full-file tokenization and React node creation.

Recommendation:

- Debounce syntax highlighting separately from raw text entry, or move highlighting into a worker.
- Virtualize rendered lines for large files.
- Consider using a proven editor surface for large code files, or add a plain-text fallback above a size threshold.

### 8. Split-panel dragging can rerender heavy editor/preview surfaces on every mousemove

Severity: Medium

Evidence:

- `HorizontalSplitPanels` calls `onLeftWidthChange` on every `mousemove` (`dashboard/src/components/layout/ResizablePanels.tsx:71`, `dashboard/src/components/layout/ResizablePanels.tsx:76`, `dashboard/src/components/layout/ResizablePanels.tsx:84`).
- The persisted width setter writes React state and `sessionStorage` immediately (`dashboard/src/hooks/use-session-storage-number.ts:25`).
- Shader, Genesis, and Shipyard routes pass the session-storage setter directly into split panels (`dashboard/src/features/shaders/ShaderWorkshopPage.tsx:1041`, `dashboard/src/features/genesis/GenesisPage.tsx:649`, `dashboard/src/features/shipyard/ShipyardPage.tsx:380`).

Impact:

- Dragging a splitter can rerender code editors, WebGPU previews, catalog panels, and form editors at mousemove frequency.
- Session storage writes during drag are unnecessary; only the final committed size needs persistence.

Recommendation:

- Track live drag width in a ref/CSS variable or local transient state throttled by `requestAnimationFrame`.
- Call the persisted `onLeftWidthChange` only on pointer up.
- Use pointer events and `setPointerCapture` for fewer document-level listeners and cleaner cancellation.

## Suggested Priority Order

1. Make explorer polling single-flight and add backend freshness/revision metadata.
2. Add a dashboard metrics aggregate endpoint and remove the initial double-fetch.
3. Normalize explorer state with structural sharing and add tree/table virtualization.
4. Move shader/audio animation loops off route-level React state and cache GPU/audio drawing resources.
5. Add dashboard performance guardrails: payload byte metrics, request count metrics, React profiler traces for explorer/metrics, and a repeatable bundle report.

## Measurement Gaps

- There is no tracked dashboard bundle/report command. Existing `dist/client` artifacts show the ECharts chunk is large but lazy-loaded; a repeatable bundle budget would keep this visible.
- There are no route-level browser performance tests for explorer polling, metrics refresh, shader preview animation, or audio playback.
- Gateway dashboard endpoints lack explicit payload-size/timing counters, making it hard to distinguish browser rendering cost from backend query pressure during profiling.
