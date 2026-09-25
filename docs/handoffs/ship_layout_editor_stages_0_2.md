# Ship layout editor Stages 0–2

Status: local Stages 0–2 foundation implemented and browser-reviewed; overall repository gate has concurrent legacy asset failures. No authoring/gameplay milestone or final art approval claimed.

## Audit and ownership

Read the active pivot, complete editor design/handoff and authority, construction,
authentication, lifecycle, operations and asset contracts. Visually reviewed all
four original editor-mockup PNGs. Existing assembly-v1 contains stable visual part
placements, voxel damage proposals and up to 40 history states, but no recoverable
functional floor or room topology. Its storage key is `sidereal.assembly.draft.v1`.
The current catalog includes native Blender equipment and an interim native hull;
these are not an approved generic polygon wall/floor adapter kit.

The new planner is local design only. No world reducer, grant, live fitting,
resource, authentication or generated transport contract is added. Save, export,
publish, refit and capture stay distinct. Production authoring requires Stage 3.
Existing assembly editor and all saved bytes remain available. Unknown documents
must enter export/recovery instead of being overwritten by the sample.

Implementation lives in new content/sim/render/UI/layout modules listed in the
active ownership ledger. Only narrow dashboard composition changes are planned.
No asset authoring, canonical export or asset publication is part of this slice.

## Reference translation

Navy #071923 workspace, #102B39 panels, #2B5265 dividers, #E3F3FA text,
#45D8F5 selection and #F4B95F diagnostics; existing Barlow/Barlow Condensed.
Central plan, quiet compact tools, searchable shape palette, deck list and
contextual inspector. Four modes share the same document and camera. Top/side/
front and 3D are views. Actual topology previews are labeled draft proxies until
compatible approved Blender construction modules exist. No invented telemetry.

## Fixture support matrix

| Input | Treatment |
| --- | --- |
| assembly-v1 document/history | Explicit migration retaining original source bytes, history and placement IDs as unresolved visual references; no inferred functional floor |
| Unknown schema/catalog/compiler | Preserved recovery/export; no automatic replacement |
| Polygon ship / station module | Same bounded local schema/compiler; one connected floor per nonempty deck |
| Native hull/equipment | Existing catalog/reference assets retained; no remodeled or republished source |
| Multi-deck design | Up to eight authored decks; one designated playable plane, no traversal |
| Live/published entities | Provenance fields only; publish/refit/capture unavailable until authority stages |

Implementation results, measured gates and screenshot evidence follow below.

## Delivered implementation

The local Stages 0–2 foundation is implemented at `/shipyard` in the independent
dashboard. This is not completion of M2/M3, final art approval, or a live authoring
service. The existing assembly editor remains at `/shipyard?assembly=legacy`.

- `packages/content/src/ship-layout.ts`: versioned document, integer 1/32 m shape
  definitions, ship/station fixtures, stable design identities and explicit
  assembly migration. Source bytes, unknown placements, damage previews and old
  history are retained. A migration starts with no inferred functional tiles.
- `packages/sim/src/layout-{validation,geometry,compiler}.ts`: admission limits,
  exact convex polygon predicates, indexed collinear subdivision, overlap
  rejection, shared-edge cancellation/provenance, manifold loops, declared holes,
  connected-component checks, ephemeral enclosing wall spans and roof faces.
  Deterministic room regions/portals, opening approach/sweep reservations and
  typed route connectivity are design validators, not resource simulation.
- `apps/dashboard/src/shipyard/layout/`: worker validation; deck navigation;
  rectangle/triangle/trapezoid stamps and area/line fill; tile selection, box/
  Shift selection, drag, Ctrl-drag copies, rotation/reflection, symmetry, numeric
  transforms, identity-preserving replacement and local command undo/redo;
  partitions, room seeds/names/types/themes, openings and explicit void seeds;
  typed route drawing and explicit endpoint reuse; native/legacy object-reference
  palette; physical container footprint versus separate empty contents grid;
  layer controls, panels, orthographic views, 3D preview and resizable layout.
- `useLayout.ts` / `state.ts`: local-profile/document/live-reference recovery,
  original expected revision, bounded past/future history, local save/export/
  import, saved-draft reopening, conflict detection and proposal forks. Unknown
  imports have preserved quarantine bytes and a resume path. Missing catalog
  revisions are read-only. Local profile identity is **not authentication**;
  this storage is disposable authoring recovery, never canonical world state.
- `packages/render/src/layout-preview.ts`: separate batched floor/enclosure/roof
  proxies, render-origin subtraction and disposable orthographic Babylon scene.
  Approved matching equipment GLBs are instanced through the existing native
  loader without changing source materials or meshes. Unknown, legacy and
  unapproved reflected visuals remain labeled proxies. No voxel remeshing.
- `packages/ui/src/editor-controls.tsx`: reusable mode tabs, sections, unit fields
  and actionable diagnostics. Dashboard composition changes are narrow and retain
  the independently owned planet studio and legacy assembly editor.
- `scripts/prepare_app.py`: excludes reference art/images from incidental app
  copies and removes only the previous generated `public/reference/art` copy.
  Original sources and canonical runtime asset exports are unchanged.

No changes were made to world reducers/tables, account authentication, generated
protocol contracts by hand, gameplay state, native equipment/hull sources,
canonical exports, or the old `/root/sidereal` stack. The mandatory full build
regenerates bindings from the current shared world source but does not publish it.

## Supported boundaries and remaining work

| Feature | Actual status |
| --- | --- |
| Floor topology | Validated convex axis-aligned rectangles, right triangles and trapezoids on the bounded lattice; connected floor per nonempty deck; holes need explicit seeds |
| Partition / door authoring | Partitions follow complete shared tile-edge chains; axis-aligned interior opening spans are cut from the preview and reserve approach/sweep clearance |
| Arbitrary partition cuts / exterior doors | Not supported in this slice; diagnostic or missing adapter, not inferred geometry |
| Rooms | Semantic seeds resolve connected regions and portals; labels never imply pressure, occupancy or permission |
| Fittings | Local reference footprints and basic support/overlap checks; approved mounts, thrust/weapon clearances and service-port catalogs remain later work |
| Hull appearance | Editable draft colors and top/side/front/3D enclosure preview; faction skins/armor/hardpoints remain unassigned |
| Visual enclosure | Explicit proxy, not replacement Blender art. Generic compatible floor/wall/corner/door/roof adapters need the art owners and exact revision approval |
| Systems | Typed explicit endpoint graph; line crossings do not join. Support/direction/medium and penetration diagnostics; capacities are declared values, not computed supply |
| Cargo | Physical container reference and separately labeled proposed empty internal grid; no live contents, fluid amounts, cargo-grid ratings or mass solver |
| Multi-deck | Up to eight authored decks, one designated playable plane; no vertical traversal or cross-deck systems solver |
| Authoritative workflows | Publish, live refit and capture remain separate disabled actions. Stage 3 OIDC/private draft service and Stage 4 atomic refit/UUID reconciliation are not implemented |

The shell does not provide a detached floating palette or arbitrary freeform room
boundary clipping. Palette/inspector resize and collapse in place; tablets use
one drawer and narrow screens support canvas inspection/light editing. Three-D
is a preview; editing gestures operate on the top plan. No accepted/rejected live
refit evidence is claimed: that belongs to Stage 4 and requires its authority
prerequisites. No pressure, utility, cargo-mass or docking acceptance is claimed.

## Validation and browser evidence

All evidence is under `output/playwright/ship-layout/`. Review scripts use a
separate named Playwright CLI browser and the actual tailnet dashboard origin;
no generated concept image is used as runtime evidence. Earlier failed/review
captures remain in `review-before-final/` and the `*-first.png`/`before-panel-fix-*`
files. `capture-manifest.json` records document fingerprint, projection, viewport
and top camera per final screenshot; `review-checkpoint.json` contains the exact
seed/document and local history. GPU camera defaults: side alpha −π/2, beta π/2;
3D alpha −π/2.6, fixed beta π/3.2; geometry subtracts the recorded origin.

- Pure tests: 17 new tests in `layout-compiler.test.ts` and `state.test.ts` pass.
  They cover partial joins/T-junctions, insertion/winding order, quarter turns and
  reflection, concavity, holes, point contacts/islands, overlaps/self-crossing,
  admission budgets, room/portal distinction, duplicate partitions, opening
  clearance, typed crossings/mismatches, segment support, empty containers,
  migration preservation, command history and local revision conflicts.
- Browser scripts cover actual pointer stamps, fill, copying, symmetry, replace,
  transforms, text-input shortcut suppression, cancellation, context selection,
  room/partition/door edits, rejected clearance, routes, refresh undo/redo,
  preserved unknown import export/reload, legacy migration, catalog outage,
  two-tab conflict/fork, resizing and DPI 2 panning/picking.
- Final reference-mode captures: `structure-1680.png`, `rooms-1680.png`,
  `hull-side-1680.png`, `systems-1680.png`; additional
  `enclosure-3d-1680.png`, `cargo-container-versus-contents.png`,
  `door-sweep-rejected.png`, `structure-1280.png`, `inspection-980.png`,
  `mobile-390.png`, `mobile-canvas-dpi2.png`, `dpi2-1280.png`,
  `station-2048.png`, `station-2048-3d.png` and recovery/conflict captures.
- Exact Node/browser output comparison passed (`cmp`). Both JSON outputs have
  SHA-256 `7d220c843d4221d2859fe4403c7104737d8480de7378c85c662776ea9708f09e`.
  The short document fingerprint is explicitly a cache key, not an authorization
  payload fingerprint or cryptographic publication hash.
- `npm run verify:isolation` passed: independent build outputs, app-only builds
  do not rebuild the world, independent app lifetimes, database kept running.
- `npm run build` passed; the existing large-chunk warnings remain visible.
  TypeScript and documentation checks pass. The first full `npm run check`
  passed 208 tests. A later shared-tree run passed 220 tests and failed two
  legacy assembly occupancy tests after another agent's runtime catalog/proxy
  update at 23:01:52. Isolated rerun reproduces `floor--2--4` overlapping
  `wall--2--4`, and unavailable occupancy in the cargo support fixture. Logs:
  `check-final.log`, `assembly-isolated.log`. Those assets and legacy rules were
  left with their owners; this is an outstanding repository gate, not a passing
  final all-project check. No milestone was marked complete to conceal it.

Authority smoke is not applicable to these client/pure design-only changes.
No database reset, production sign-in, live publication or refit was performed.

## Measured costs

Machine: AMD Ryzen 9 9955HX, eight logical CPUs visible to this environment,
Linux x64, Node 24.18.0, Chromium 153 software WebGL. Twenty measured iterations
after two warm-ups; timings are this machine's review evidence, not a capacity
promise. See `compiler-benchmark.json` and `browser-worker-benchmark.json`.

| Fixture | Browser worker p95 | Worker round-trip p95 |
| --- | ---: | ---: |
| Ship, 66 tiles | 1.8 ms | 2.2 ms |
| Station, 256 tiles | 3.1 ms | 4.4 ms |
| Station, 1024 tiles | 11.2 ms | 16.6 ms |
| Station, 2048 tiles | 17.5 ms | 25.8 ms |
| 2048 tiles, long collinear subdivision | 25.4 ms | 36.4 ms |
| 1024 tiles, 64 fittings, 64 route branches | 18.0 ms | 23.0 ms |

An initial large-plan pointer preview cost roughly 15 seconds for 30 moves.
Separating the gesture overlay, caching floor elements, disabling hover work
while stamping and simplifying distant fills reduced that same review to 523 ms
for 30 moves (ship: 496 ms). No >50 ms main-thread long task was observed during
the final pointer runs. This does not measure GPU completion latency or guarantee
every individual edit fits one frame. Screenshots also caught a collapsed-panel
CSS grid placement error; explicit grid tracks fixed it and the 980px review was
repeated with a minimum-canvas-width assertion.

The 2048-tile proxy preview used two active batches / two draws, 13,440 indices,
zero textures and zero shadow passes. The ship with one native equipment
placement and one unresolved cargo proxy used ten active meshes, nine draws,
11,424 indices, one texture (262,144 bytes estimated RGBA8 allocation) and zero
shadow passes. `frameMs` is CPU render submission time, not a GPU timing query.
No per-tile lights or per-frame topology rebuilds are used.

## Handoff

Review the local planner and its exact evidence before approving visual design.
The new UI review series preserves source/evidence separately from the equipment
and hull owners' ledgers; no owner final sign-off is inferred. Next integration
work is to resolve the separately reported assembly occupancy regressions, then
coordinate approved generic construction adapters. Stage 3 must establish real
OIDC/capability/private draft authority before enabling any server-side save,
publication, refit or capture command.

Final asset validation also ran: `npm run art:check` fails its existing manifest
hash assertion for `assets/runtime/assembly/catalog.json`, consistent with the
concurrent catalog update. See `art-check.log`. No canonical asset file was
rewritten to conceal this. The final browser gesture run passed 22 assertions;
additional real palette drag/drop, deck undo/active-deck restoration and return
from the preserved legacy editor passed. Browser checks were repeated after
builds completed so public-asset preparation did not interrupt the review.

The preserved native UI review series is
[ship-layout-editor r001](../../assets/art-library/ship-layout-editor/README.md).
It includes exact full-frame reference copies, native source, earlier iterations,
actual captures and a feedback/approval ledger. It is not an equipment/hull
publication or a final owner sign-off.
