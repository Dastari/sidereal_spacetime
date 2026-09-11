# Shipyard editor: blank designs and editable floorplans

2026-09-10. Implemented and browser-reviewed in the independently managed dashboard at
https://sidereal.tail7a58a6.ts.net:8445/shipyard (source review server, not a new game/world release).

2026-09-11 follow-up: exact native wall fit previews and the design-enclosure
overlay now supplement the original wireframe guides; see
[wall and pressure preview](shipyard_wall_pressure_preview_20260911.md).
The outline-only description below records the original release scope.

## Problem and resulting workflow

The earlier editor combined semantic floor tiles with the retained native Wayfarer
assembly. Its model walls were not editable internal partitions. This made an
apparently editable floorplan carry old rooms that floorplan tools could not remove.

- **New → Create empty design** starts with the selected editable hull-size envelope
  and one empty deck. It contains no inherited tiles, walls, rooms or fittings.
  New browser profiles also start blank; existing saved drafts remain intact.
- **New → Use Wayfarer footprint** creates a separate draft with its 51 authored
  floor tiles and deck dimensions, without inherited assembly, equipment, partitions,
  room labels, openings or routes.
- An assembled draft shows **Redesign this floorplan**. This preserves its current
  floor edits, saves the previous draft first, and creates a separate floorplan-only
  draft. It clears live/source binding rather than silently refitting a saved ship.
- **Inspect assembled Wayfarer** retains the complete reference assembly. Inspection
  and a blank/floorplan-only redesign are explicitly different entry points.
- Internal walls and room labels have select/delete controls. Generated exterior
  boundaries follow tile removal; they cannot be removed independently of the floor.
  Undo restores edits. Deleting items does not garbage-collect unrelated service nodes.
  Systems deletion now handles eligible assembly-backed equipment as well as fittings.

## Canvas and renderer

The reference-led workbench has compact document/mode rows, contextual palette and
inspector disclosures, independently collapsible/resizable side panels, floating
tools and a deck control. **Focus canvas** temporarily maximizes the viewport;
Escape or **Exit focus** restores the workspace. Shared Creator theme and the
existing UI decomposition were integrated rather than replaced with another shell.

Compiled exterior/internal spans create lightweight 3D wall outlines at the active
deck elevation and ceiling, including diagonals and opening gaps. They follow the
Walls layer, update on edits and are disposed with the viewport. They are technical
guides, not published wall art, collision, health or pressure state. Native Blender
floor meshes remain the visual floor source. In 3D the editing polygon overlay is
transparent so it cannot cover front-facing wall guides or native floors.

Browser review discovered and fixed two interaction defects:
1. Picking converted CSS coordinates to framebuffer pixels, then Babylon applied
   hardware scaling again. The shared point/pick conversion now accounts for the
   SDK's own scaling; tests exercise actual Babylon ray/plane roundtrips.
2. Focusing the projected SVG could scroll its overflow container, moving the GPU
   canvas away from the overlay. Focus prevents scrolling and the viewport clips
   without becoming a scroll container.

Empty designs fit their hull envelope rather than a zero-sized floor bound.

## Evidence and checks

Actual Chromium/SwiftShader review, isolated local browser profile:
`output/playwright/shipyard-redesign/`.

- Blank design: zero tiles and retained placements.
- Dragging a 3×3 floor block: 9 native floors, 12 exterior wall guides, no errors.
- Internal wall: guide count 13; delete → 12; undo → 13. Room label added/deleted
  independently, preserving the wall and floors.
- Assembled Wayfarer: 262 rendered placements (211 retained parts + 51 floors).
  Redesign: 51 floors, zero assembly/fittings/partitions/rooms, no live source binding.
  Reload retained this draft and exactly one renderer canvas.
- Floor selection/Delete: 51 → 50 native floors, recomputed perimeter; Undo → 51.
- At 1680×1000 the normal canvas measured 1128×818 pixels; focused canvas 1664×958.
  At 1366×768 with both side panels collapsed it measured 1350×586 pixels.
- Escape exits focus. The New dialog, saved-draft path, assembled inspection and
  direct Wayfarer-footprint creation were exercised in the real browser.
- Browser console contained no application errors. Named session was blanked/closed
  and the shared software-GPU slot released after review.

Final combined validation: `npm run check` passed 1,487 tests in 249 files,
typechecking and all 77 registered document/provenance checks. `npm run build`
and `npm run art:check` passed. Changed editor/viewport files passed ESLint;
Vite reports its existing large-chunk advisory.
An intermediate full check had one existing planet-terrain 20-second test timeout
while SwiftShader was active; it was rerun after closing the browser rather than
weakening the test.

## Source coordination and limits

This integrates the pre-existing shared workbench refactor (App, editor theme,
GPU-canvas lifecycle, panel/tool/dialog components) plus bounded specialist slices:
`ad4d2881` wall guides, `09f399c2` contextual/deletion panels, `b6a0e19a` draft
redesign helpers, `67f9f7ee` selection deletion, `cf8b08c5` picking regressions.
Parent owns final shared viewport/editor wiring and combined checks.

No published template, live ship, inventory or gameplay state was rewritten.
This fixes local design/editing and 3D outlines. It does not claim the entire
construction roadmap or finished modular wall/door panel art is complete. Explicit
publish/refit and their authority checks remain separate workflows.
