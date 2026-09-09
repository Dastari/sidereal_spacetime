# Top-down 3D and a new dedicated UI

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## 3D rendering direction

Babylon.js with glTF/GLB is the selected presentation engine. Preserve Blender geometry as editable source, not only rasterized tiles. A long-lens perspective camera moves overhead for flight; walking uses a fixed-elevation (35.264° above deck), azimuth-rotatable perspective camera with a smooth station-driven transition overhead. Space flight initially remains planar. Ship decks use local coordinates; height supports walls, machinery, roofs, characters and lighting. Roof/cutaway visibility changes presentation only. No client render-layer toggle grants access to hidden interiors; never send unauthorized interior data merely because the exterior hides it.

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

## 2026-09-08 shared model and material study

The client now uses one Blender-exported voxel ship hierarchy in both modes, with roof/camera-facing upper-wall cutaway. It includes voxel panel relief, baked metal normal/roughness maps, an independent HDR reflection rig, shadowed neutral cabin light, limited room accents, emissive instruments and a chunky crew proxy. The dashboard can separately review the new model and the preserved original Blender GLB. Region art and fixed-elevation camera details live in the [visual theme](visual_theme.md).

## 2026-09-08 Godot option

Godot with SpacetimeDB is viable for a native-client evaluation: SpacetimeDB provides an [official Godot SDK setup](https://spacetimedb.com/docs/tutorials/godot/part-1/). For the currently selected browser-first path, keep Babylon while measuring the representative art scene. Godot's [current stable web export documentation](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) states that Godot 4 C# projects cannot export to web and that web uses the Compatibility renderer. A different-language web bridge would add integration work. No Godot migration was performed. GLB, voxel material data, blueprints, SpacetimeDB authority and the separate web dashboard remain reusable if a later native-client comparison justifies switching. Renderer choice alone does not supply the reference's art detail or a server-authoritative destruction system.

2026-09-08 spatial refinement: planets have persistent world XY and deeper visual height; nearby asteroids use authoritative planar contacts. Only the infinite directional sky follows camera position. See [space environment](space_environment.md). The studless brick material direction and opaque-versus-glass implementation limits are in the [theme](visual_theme.md).

## 2026-09-08 canvas-only game interface (supersedes game DOM shell above)

The game client now composes its entire visible interface in the existing Babylon
WebGL canvas. `packages/canvas-ui` owns a transparent `DynamicTexture` and a
foreground `Layer`; its CPU raster backing surface is uploaded as a texture and
is never mounted as a second visible canvas. React owns lifecycle and permitted
network state only. The separate authoring dashboard retains its HTML UI.
The earlier ceramic navbar, tool rail and persistent HTML inspector are removed
from the game. Owner reference sheets `ui-elements.png` through `ui-elements-6.png`
and `in-game-ui-interface-example-1.png` were visually reviewed, then translated
into code-native clipped blue frames, dark translucent wells, compact Barlow
text, cyan focus and amber seat actions. Reference images are not runtime skins.

Implemented: flexible rows and grids; measured text and wrapping; panels; button
selected/disabled/hover/focus states; toggles; pointer/keyboard sliders; constrained
text fields; draggable/resizable/clamped windows; tabbed console; local UI scale,
panel opacity and control hints; scene vista and reduced-camera-motion controls;
live velocity/heading; character entry; seat intent; expected-revision vessel
rename and receipt count; connection, loading and actionable error states.
No health, fuel, inventory, weapon, quest or sensor values are invented.

Escape opens the console and suspends outgoing movement while the multiplayer
world continues. F6 explicitly transfers keyboard focus to the interface; Tab
then traverses enabled controls, Enter/Space activates and arrow keys adjust
sliders. Outside interface focus, Tab only changes view. E only sends the normal
server-validated station intent. UI panels consume pointer, wheel and camera
orbit input; focused fields consume gameplay keys. Blur, visibility changes,
menu opening and disconnect prevent held movement from carrying into text input.
Text fields currently support direct character entry and backspace at the end;
selection, clipboard, IME, virtual keyboards and a complete screen-reader control
tree remain planned. The canvas exposes its current focused control through an
accessible label; this is a keyboard-accessible first implementation, not a claim
of complete assistive-technology parity. Small screens clamp windows and clip
unreachable content; full mobile touch piloting and scrollable console overflow
remain planned. Local display settings do not author character progression or
world data.

A UI is attached before asynchronous asset loading and rendered during loading.
Asset failures retain the scene and interface with an error message. Renderer
initialization failure uses a same-position canvas error fallback. No build or
UI action publishes the backend. This change extends the M0 presentation proof;
it does not complete shared-world, combat, inventory or editor milestones.

2026-09-08 visual review refinement: desktop defaults to 135% UI scale, with
100% and 160% alternatives. Darker navy wells, narrow cyan emissive corner cores,
localized blue halos and amber action corners replace the first muted frame
pass. Crew controls offer local suit palette, helmet and backpack visibility
previews through the renderer's customization API. Browser review confirmed one
visible canvas and zero HTML game controls, correct orientation, focused vessel
text consuming WASD/E, and an intact canvas error interface after deliberately
blocking the ship GLB request. Review captures are
`output/playwright/canvas-scaled-flight.png` and
`output/playwright/canvas-console.png`. The first captures loading; the second
shows the loaded scene through the console. Layout/blocked-input tests are in
`packages/canvas-ui/src/layout.test.ts`. Async renderer cancellation during HMR
requires the renderer lifecycle follow-up; this is separate from the cold-load
browser checks.

## Inventory window baseline and renderer diagnostics

The second inventory pass replaces the large telemetry tile and combined inventory
board with a compact top navigation strip and independent Character (`C`),
Inventory (`I`), and reachable container windows. Each window has its own titlebar,
close control, stacking order, viewport clamping and clipped scroll area. Inventory
keeps the authoritative multi-cell footprints and orientation; dragging between
windows sends the same validated move intent, and equipment selection sends the
normal equip intent. Available container windows disappear immediately when their
server projection loses reach. The five quick slots retain server assignment and
activation semantics. Carry mass and liquid volume bars use replicated values;
there are no invented health, combat, rarity or currency statistics.

The visual baseline uses shared dark blue window frames and measured-value bars,
with near-white selected outlines and a blue/cyan halo. Item images are transparent
renders of the preserved equipment source. The renderer crops to manifest alpha
bounds and turns long weapons to fit portrait footprints. The Character window shows the selected preset’s authored transparent PNG, cropped
to its alpha bounds, with separate actual hand/back item thumbnails. It is labeled
“Preset appearance preview”: the image is static and does not reproduce live
animation, custom skin recolors or current equipment. A neutral articulated slot
map remains the loading/error fallback. Changing the selected preset changes the
image; the default label uses the same appearance resolver as the live renderer.

`F3` independently toggles a movable performance window, including before character
entry. It displays measured renderer FPS, frame interval, render CPU time, draw
calls, meshes, active indices, material/texture/light/shadow counts and resolution.
Instrumentation is enabled only while the window is open, sampled through the
renderer adapter, and disabled on close/dispose. No GPU timing or network latency
is inferred from these CPU counters. Before the renderer exists it says “Renderer
starting.” Browser visual review is performed separately from pure interaction
checks; complete assistive technology parity and touch gameplay remain pending.

Second-pass browser evidence on the required tailnet client URL:
`output/playwright/inventory-windows-01.png` (1440×1000, actual rendered scene),
`inventory-windows-diagnostics.png` (Character, Inventory, reservoir and F3 open
simultaneously), and `inventory-windows-compact.png` (800×640, three clamped
windows). A real pointer titlebar drag moved the reservoir independently. A real
pointer Equip action changed the authoritative hand slot from compact pistol to
carbine, and the previous pistol appeared in its freed backpack space. Five quick
slots remain visible; their desktop wells are approximately 89 pixels at the
135% UI setting. The review observed exactly one visible WebGL canvas.

SwiftShader stalled the initial continuously rendered screenshot, so the render
loop was paused between single-frame captures. The F3 screenshot demonstrates the
measured-data UI, not a benchmark of normal play. Final polish increases strong
window opacity to prevent underlying text showing through stacked panels and adds
30 logical pixels to the default Inventory window. Pure window tests cover focus,
clamping, cross-window drop intent, compact partial-item selection, and immediate
removal of container drop targets on access loss. Character look selection reads
the exported appearance catalog, leaving room for the ten-reference art pass;
local hand/back preview toggles were removed because equipment is authoritative.

Final source portrait and diagnostic acceptance (2026-09-08): the actual tailnet client shows distinct Engineer and Scientist authored PNG previews while the authoritative carbine and backpack cards remain unchanged (`output/playwright/ui-final-engineer-diagnostics.png`, `ui-final-scientist-diagnostics.png`). F3 initially displays “Renderer starting”, then completed frames report 441 draw calls and 175 active / 333 total meshes. The review used SwiftShader with manually stepped frames after pausing the continuous loop; displayed timing is not a hardware performance benchmark. `ui-final-ship-prow.png` also records the unobstructed current ship deck, walls and prow. The preview is explicitly labeled and does not pretend to be a live equipped character snapshot.

Destination selection now uses viewport-sized pages instead of truncating the catalog to three entries. Previous/Next controls keep every destination accessible, and selection retains Observe/Return behavior. Pure tests cover all eleven destinations on desktop and compact heights, plus page clamping after catalog changes. This final pagination change still awaits the live expanded-catalog browser review; the earlier portrait screenshots used the prior frozen navigation module.

Expanded catalog live acceptance subsequently passed on the normal published database: the actual client subscribed to 16 visible bodies and exposed all 12 destinations across pages of 5, 5 and 2. The final page includes Companion Moon and Ember Garden (`output/playwright/ui-catalog-last-page.png`). Observe focused the actual mixed Ember Garden 7.99 km away (`ui-catalog-observe-ember.png`), and Return restored the original ship camera (`ui-catalog-return-ship.png`). Full subscribed character, ship and inventory-item rows compared identical before and after: stable character and item UUIDs, carbine in hand, field pack on back, and authoritative position all persisted. Camera interpolation used bounded presentation-only frame stepping during this SwiftShader review; no authoritative transform was written. The review browser was closed after capture.

## Character and equipment reference refresh

The owner's subsequent `ui-elements-5.png` / `ui-elements-3.png` request supersedes the earlier static-portrait and no-preview-stat baseline for this character interface. Native Canvas2D now supplies a three-column Character sheet, distinct common/rare/epic/legendary double-inset item rims, four colored mock vitals, organized stat tabs and resistance cards, plus an eight-position action bar with two separate quick-item slots. The illustrative statistics are explicitly marked preview values; authority data and actual inventory operations remain unchanged.

The paper doll lazily renders the existing Blender-derived crew and held-equipment GLBs over a reusable transparent holographic disc. Shader rings/arcs/ticks/electrical traces, bloom, a subject-only cyan boot light and a small reflection texture create the projection. Drag/arrows rotate the character; reduced motion retains a static effect while allowing deliberate rotation. The portrait and controls fit shorter viewports, and the remaining sheet scrolls inside its window. Closing the final inventory window clears stale selection, and item details also have their own dismiss button.

Existing five server hotbar bindings remain functional. Visual positions6–8 are reserved; local quick shortcuts9/0 inspect/bind actual items without fabricating consumption. Rarity and cosmetic anatomy icons remain presentation metadata until their authority contracts exist. Source, revision history, independent reference review, actual desktop/compact/interaction evidence and validation are in [the character UI handoff](handoffs/character_ui_refresh.md) and [the living design ledger](../assets/art-library/designs/ui.character-status-and-equipment/DESIGN.md). Owner authorization permits live UI integration after independent acceptance; it is separate from final art sign-off.
