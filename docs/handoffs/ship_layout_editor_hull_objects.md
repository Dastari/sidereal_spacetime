# Hull and Objects: editable existing ship

Status: implemented local visual assembly editing; browser and final validation
results are recorded below. This does not publish a blueprint or refit a live ship.

The owner requested an orbitable Hull workspace using the individual panels
already in the game, followed by the same placement, selection, move, copy,
paste and undo workflow in Objects. Both modes now open the shared 3D workbench.
Objects defaults to equipment; Hull defaults to walls/panels. Top remains
available for the existing polygon floorplan tools in Objects.

## Delivered behavior

- **Load existing Wayfarer** creates a separate local document from the current
  authored `/assets/assembly/wayfarer.json`. The current source has 262 placements
  and 163 reusable definitions. Every placement ID, metre-space transform,
  mirrored state, fitting proxy and retained damage proposal is copied exactly.
  The previous draft remains saved. This is a fixture copy, not capture-live.
- Every ship placement can be selected from the viewport or placed-components
  list. Move by dragging or numeric east/north/height fields, rotate, mirror,
  duplicate, delete, focus and undo/redo. Ctrl-drag makes an independent copy.
- Copy/Paste buttons and Ctrl/Cmd-C/V use an editor-local clipboard. Paste assigns
  a new placement UUID and offsets the copy one metre so it can be selected.
  Ctrl/Cmd-D duplicates; arrows nudge; R rotates; F mirrors; Delete removes.
  Text inputs keep their normal keyboard behavior. Escape cancels a drag or
  placement tool. Commands share the planner history, autosave, recovery,
  export/import and conflict protection.
- Click a library component, then click the build plane, or drag the palette
  entry onto the viewport. Adjustable snap and build height, a metre grid and
  placement-bounds preview support precise positioning. Height is editable
  independently of the camera. Existing planar fittings keep their named deck.
- Orbit changes azimuth and elevation in the authoring viewport. Middle drag
  rotates, right drag pans, wheel zooms; Orbit also uses left drag. Top, Side,
  Front, Fit and Focus are available. Camera movement does not write placement
  transforms or simulation state. The runtime RPG camera contract is unchanged.
- Roof and category visibility make interiors accessible. Matching native assets
  load lazily by GLB URL, with shared floor-kit mesh groups loaded once. Retained
  older parts reuse the existing part library. Authored meshes/materials are
  preserved; there is no voxel remeshing, geometry redesign or art publication.
- A previously migrated assembly can be opened as another editable copy from
  its retained raw source, while preserving the original bytes. Native visual
  revision mismatches block changes and leave export/recovery available.

## Data and application boundaries

`LayoutDocument.assembly` is an optional, independently versioned visual component
collection. Old layout documents still load without it. Structural admission
bounds the part count/coordinates, validates transforms/proxies, rejects duplicate
identities and unknown assembly revisions, and keeps the 1 MiB document budget.
Compiler fingerprints sort visual placements deterministically. Existing
floorplan fittings are adapted into the same renderer without a second placed
identity; their edits map back into the original fitting row.

The imported ship's visible floors remain individually editable native parts.
**A polygon floorplan, room topology and functional fitting definitions are not
inferred from those meshes.** The original Structure/Rooms compiler remains a
separate design representation. Local assembly editing permits visual overlaps;
it does not claim validated collision, cargo capacity, utilities, damage or
installation. Retained damage-cell proposals remain stored; this workbench shows
the intact source surfaces. Some reusable assets contain an authored group of
meshes; this is placement editing, not a Blender submesh editor.

No world/net authority adapters, credentials, gameplay controls, canonical Blender
files or runtime asset exports are edited. Dashboard composition stays separate
from the client application. Publish, live refit and capture remain unavailable.

Implementation: `packages/content/src/layout-assembly.ts`, optional layout schema
and validation, `packages/render/src/layout-hull.ts` and assembly preview adapter,
`apps/dashboard/src/shipyard/layout/HullWorkspace.tsx`, CSS and narrow composition
changes. The native source archive and actual captures belong to the supplemental
ship-layout-editor review series; prior r001 evidence stays intact.

## Validation and evidence

Evidence directory: `output/playwright/layout-hull/`. The source fixture/catalog
and the hashes of its 32 asset inputs are preserved there. Browser review uses
its own `layout-hull` session and the actual tailnet dashboard, with no authority
requests issued by these controls. Source import, bounded admission, revision
mismatch preservation, shared history/recovery, deterministic fingerprints and
existing fitting transforms have five additional tests.

The initial full `npm run check` passed 284 tests across 77 files, TypeScript and
66 documentation checks. Final build and browser replay results follow in the
review record. Software WebGL captures initially stalled with the default ANGLE
mode while other art sessions were active. The review uses SwiftShader-WebGL;
the initial viewport stopped rendering while idle and capped active frame
submission at 25 fps. The owner-reported motion follow-up below removes that cap.

Final verification:

- `npm run check` passed **292 tests in 80 files**, TypeScript and 68 document
  checks after closing the review browser. The earlier concurrent run timed out
  in two newly added planet tests; the clean rerun passed without changing their
  tests or increasing timeouts. Logs: `check-final.log`, `check-serialized.log`.
- `npm run build` and `npm run art:check` pass. Existing bundle-size warnings are
  retained in `build-final.log`; no database publish or authority smoke applies
  to these local visual controls.
- The Hull browser suite passes 20 assertions, including exact source equality,
  separate-draft preservation, both orbit axes, independent height/rotate/mirror,
  pointer dragging, Escape cancellation, duplication/deletion, placement height
  and history after refresh. The Objects suite passes 14 assertions covering
  library clicks, real palette drag/drop, Copy/Paste buttons and shortcuts,
  independent IDs, text-field shortcut isolation and shared Hull/Objects state.
- Six more checks pass for export/import with history, the same assembly in
  Structure's 3D preview, clean scene disposal between modes, DPI-2 surface
  picking and a 390px screen without horizontal overflow. Final mode-switch
  review recorded zero page errors. Software WebGL ReadPixels performance
  warnings remain distinct from application errors.
- Actual full-ship and editing captures, source exports, input hashes, browser
  scripts and logs are preserved in the supplemental
  [UI r002 record](../../assets/art-library/ship-layout-editor/README.md).
  The concurrent markings controls visible in the final review are owned by
  the hull-decals session and were preserved, not authored or approved here.

The imported source remains an editable **visual** reconstruction. Polygon room
mapping and live installation still need their own authority/design stages.
Existing Blender and retained part inputs had unchanged SHA-256 hashes throughout
this editor implementation.

## 2026-09-09 motion follow-up

The owner reported slow movement with an acceleration feel. Hull/Objects now
render at display refresh during activity, retaining the idle pause. Orbit,
pan and zoom have zero inertia, with sensitivity adjusted to preserve the
previous total travel without its delayed decay. The editor also skips Babylon's
automatic pointer picking because it explicitly picks for component selection;
dragging uses a build-plane ray. Hiding a placement ghost requests a final frame.

`layout-camera-motion.test.ts` exercises actual Babylon movement at 144 Hz,
60 Hz, 25 Hz and a 200 ms frame, verifying immediate displacement, no coast and
immediate reversal. `npm run check` passes 297 tests in 81 files, type checks and
document checks; `npm run build` passes. The live HTTPS browser verifies orbit,
pan, zoom, no post-input drift and Objects copy/paste/undo with zero page errors.
Evidence: `output/playwright/layout-motion/`, including actual browser camera
values and `live-objects.png`. Shared software rendering is too slow for a
meaningful hardware FPS comparison; no measured 60 FPS claim is made.

The final surface-picking check also passes: drag a focused native panel and
undo to exactly restore all placements. Seven browser checks pass in total.
Only the `layout-motion` browser was closed after review.
