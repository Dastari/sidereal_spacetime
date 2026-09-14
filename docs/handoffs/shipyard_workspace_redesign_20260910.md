# Shipyard workspace redesign — 2026-09-10

Status: local editor implementation and browser review; no public game deployment, blueprint publication, live refit, or art revision.

The owner supplied a navy/cyan, three-column ship editor reference. Shipyard now uses a compact document bar, a two-column visual part palette, collapsible hull/deck configuration, a larger framed canvas, and separate Properties/Layers/Overview sections for component editing. Existing Structure/Rooms/Systems inspectors retain their domain controls. An active-deck selector is available in both canvas workspaces. Deep space and Graphite themes persist independently of drafts and update the WebGL background. Narrow viewports collapse panels into overlays and retain access to tools through a horizontally scrollable toolbar.

No fictional ship statistics or inactive Publish/Test actions were added. The component overview reports actual document counts and compiler diagnostics. The supplied reference guides the interface; the ship remains the existing native Wayfarer template. Draft recovery, conflicts, imports, local history, structural validation, asset revision locks and separate server operations retain their existing rules.

## Code boundaries and rendering

- App routes lazily load LayoutEditor, AssemblyEditor and PlanetStudio with loading and error boundaries. HullWorkspace has its own lazy boundary. Account/construction adapters load when their disclosure is opened.
- DocumentBar, LayoutToolbar, NewLayoutDialog, ViewportDeckControl, ShipSummary, LayoutPalette and LayoutInspector are separate components. Layout gestures and panel contracts have separate modules. Shared editor controls provide keyboard tabs and pointer-captured panel resizing; native modal focus handling is used for new drafts.
- Each preview effect mounts and owns a fresh canvas. Async disposal of its engine can no longer release WebGL programs belonging to an engine reusing the same DOM canvas. Canvas nodes and listeners are released on teardown.
- Camera projection updates write to the SVG overlay refs without rerendering the floorplan through React on every frame. The shared camera still owns picking and overlay projection.
- FXAA reduces mesh-edge aliasing. Device pixel density is capped at 2 and framebuffer area at four million pixels. Hidden tabs skip rendering. Visible build guides have a minimum 0.5 m interval while placement snap retains its original precision.
- Explicit 3D view uses a side-biased overhead angle. Fit accounts for horizontal as well as vertical field of view, including portrait canvases. Manual camera orientation still survives ordinary document updates.

## Review evidence

Actual browser captures in `output/playwright/`:

- `shipyard-redesign-before.png`: original structural workspace.
- `shipyard-redesign-wayfarer.png`: redesigned native Wayfarer workspace.
- `shipyard-redesign-structure-final.png`: structural editor after extraction.
- `shipyard-redesign-graphite.png`: second theme.
- `shipyard-redesign-mobile.png`: 390 × 844 portrait canvas.

Browser flows exercised document rename/undo/redo/save, palette search, panel collapse, theme reload persistence, template opening, roof visibility, selection through Overview, component copy/paste/undo, and mobile library access. The HMR lifecycle repro was repeated after the fix: replacement canvas differed from the old canvas, old canvas was detached, exactly one active editor canvas remained, and WebGL `getError()` returned 0.

The software-GPU browser is visual and interaction evidence, not a hardware FPS benchmark. Existing native geometry/material limitations and construction authority backlog are not resolved by this UI change. Babylon's large shared rendering chunks remain; route splitting is not a claim that every renderer chunk is small.

## Validation

- `VITEST_MAX_WORKERS=4 npm run check`: passed, 1,459 tests in 243 files and 77 document/provenance checks. The worker cap avoids CPU contention on this shared host; it changes no assertions or timeouts.
- `npm run build`: passed for world generation and independent client/dashboard builds. Dashboard entry JS is 213.18 kB (69.04 kB gzip); LayoutEditor 150.96 kB, HullWorkspace 20.32 kB, and deferred ConstructionPanel 224.44 kB are separate chunks. Shared Babylon chunks still warn above 500 kB.
- Focused changed-file ESLint, Prettier and whitespace checks passed.
- Final warmed native preview: 262/262 placements, 776 active meshes, WebGL error 0. New-draft native modal/Escape and keyboard resize also passed.

Earlier unrestricted aggregate runs had a planet-terrain timeout under shared-host load and one intermittent Babylon instance-registration failure; the instance test passed immediately in isolation. No unrelated test was weakened. No authority code changed, so a database smoke publication was not part of this task.

Skills installed for this task: Vercel React best practices, Vercel composition patterns, and Anthony Fu's Vite guidance. The existing frontend-design and Playwright skills were also used.
