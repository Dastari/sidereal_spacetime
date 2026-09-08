# Top-down 3D and a new dedicated UI

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## 3D rendering direction

Babylon.js with glTF/GLB is the selected presentation engine. Preserve Blender geometry as editable source, not only rasterized tiles. A top-down orthographic camera is the gameplay default; an angled inspection view is useful for assets/authoring. Space flight initially remains planar. Ship decks use local coordinates; height supports walls, machinery, roofs, characters and lighting. Roof/cutaway visibility changes presentation only. No client render-layer toggle grants access to hidden interiors; never send unauthorized interior data merely because the exterior hides it.

Use an external shell/roof model set plus interior architecture/equipment/crew, with semantic part IDs mapping to meshes/instances. Model pivots and sockets obey the 2 m construction grid; irregular polygons/multi-cell parts remain supported. glTF stores geometry/materials/animation, while the content manifest stores mass, footprints, mount/utility ports, collision shapes and capability definitions. Collision and usable area never come from guessing visible triangles. The current exported ship study is a review object; the M2 compiler will produce a functional modular model.

Retain faction-specific silhouettes, material palettes and independent decals/text. Use believable rocket/nozzle geometry, animated airlocks, turret bases/heads, local emissives, exhaust particles/shader effects and shield/impact effects. Blender character pipeline needs a reusable rig, skin/outfit/equipment attachments, top-down-readable silhouettes and animation clips. Existing sprite layers remain reference/thumbnail sources, not the new rig.

## Lighting and performance

Exterior sunlight should be neutral enough to preserve material identity. Cabin lighting is isolated from stellar tint using light include/exclude masks and separate interior lights, not an arbitrary global yellow ambient. Cap dynamic shadow casters, use baked/AO detail where it helps, and offer bloom/shadow/particle/resolution quality tiers. Atlas or share materials; instance repeated parts, merge static structure per chunk, and update only dirty regions. Cull by visible frame and camera, with LOD/texture budgets. Do not allocate an independent heavyweight scene/material/light per tile.

Provisional desktop target: 60 fps at 1080p on an agreed midrange reference device, plus explicit lower-quality fallback on integrated graphics. The current machine/software renderer can prove loading and interaction, not final GPU performance. Budget draw calls, visible triangles, shader variants, texture memory, model download and time-to-first-playable; add representative stations/fleets before promising capacity. WebGL2 is tested first; add WebGPU through feature detection and validation, with no gameplay dependency on it.

## New UI design plan

Subject: a crew-operated exploration vessel and a practical shipbuilding workshop. The canvas/ship is the visual focus. Use pale ceramic navigation chrome, blue-gray instrument wells, restrained sea-glass controls and amber warning accents. Avoid heavy sci-fi framing, permanent help overlays and duplicate navigation.

| Token | Value | Purpose |
| --- | --- | --- |
| Ceramic | `#d9e7e8` | navigation/header surfaces |
| Deep space | `#07121e` | world backdrop |
| Instrument well | `#142936` | drawers and tools |
| Structural line | `#345360` | functional separation |
| Sea glass | `#71d0c1` | selected/available actions |
| Caution | `#e0b779` | attention and status accents |

Barlow is the readable interface typeface; Barlow Condensed carries ship names and large telemetry. Both are self-hosted through npm font packages. Use sentence case, compact text widths, native accessible form controls and visible focus. New tokens/components are independent of old Sidereal and Orchard skins. The design review selected a large uninterrupted ship viewport, compact side instrument panel and a single narrow tool rail instead of a card-heavy dashboard. Dashboard tools use navigable rows with explicit implementation state.

```text
┌ ceramic brand / flight | creator / account ───────────────┐
│tool│                                                      │
│rail│      live ship / interior / editor viewport  │details │
│    │      floating parts only while editing      │layers  │
│    │                                              │status  │
└────┴────────────── unobtrusive connection state ────────────┘
```

## Component library and input ownership

Create generic buttons/tooltips, keyed dialogs, inputs, selectors, dropdowns, tabs, tree/list, context menu, resizable dock, toast/status, progress/segmented bars, telemetry and action prompt. Gameplay compositions add item-grid/multi-cell footprint/drag ghost, paper doll, recipe/queue, trade/cargo, crew/fleet list, target/intel, scanner ring and tactical map. The scaffold implements a small specimen set (Panel, ToolButton, Readout, Status, ItemSlot); other components remain milestones.

DOM/React draws interface chrome and accessible text. Babylon renders world and world-anchored markers. UI events consume pointer/key input before gameplay; text entry never thrusts/fires/toggles view. Rebinding, UI scaling, reduced motion, keyboard traversal and mobile layout are explicit. Drag-and-drop has keyboard alternatives and transactional pending/failed feedback. Do not display a fake health/fuel/ammo number to fill a panel; hide unavailable gameplay or mark a development specimen clearly.

M opens the tactical map; TAB switches view; E interacts. Give scanner ring a separate configurable binding. Space/RPG controls must be screen-consistent even when the ship/camera rotates. Frame-rate camera interpolation is presentation only. Components are shared with dashboard tools but support appropriate density and contrast for each context.
