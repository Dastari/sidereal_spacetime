# Shipyard native wall and design-enclosure preview

2026-09-11. Implemented in the managed dashboard source review at
https://sidereal.tail7a58a6.ts.net:8445/shipyard. No game/world deployment, asset
publication, live refit or template rewrite is part of this change.

## Result

Semantic floorplan drafts now show installed Blender boundary-r004 wall meshes
in Structure/Rooms/Objects and Hull views. The shared Walls layer controls both
meshes and guides. Native meshes are not editable equipment and cannot be picked
or dragged independently of the semantic boundary. Existing reference assemblies
without semantic structure retain their wall models without generated duplicates.

The library is imported once per viewport. Exact native spans and junctions are
cloned with original materials and transforms. Unsupported spans remain wireframe
and appear in **Wall fit** notes. Draft/camera/layer changes and teardown retain
correct asynchronous import ownership; clearing a draft clears stale fit notes.

Current r004 geometry is **centred on the boundary**: 93.75 mm core (46.875 mm on
each side), 125 mm decorative envelope (62.5 mm on each side), floor-top datum
0.1875 m and authored top 3 m. These are preview measurements, not compliance with
the outward-only exterior wall target in `ship_tileset_interface_contract.md`.
Internal partitions reserve a centred strip; exterior walls ultimately belong
outside the usable floor boundary. Native meshes are not stretched to arbitrary
ceiling heights or span lengths.

Pin: `/assets/construction/boundary-r004/kit.glb`, SHA-256
`568d491623f03df932a9c5c120a94e4a60b00bd0fd421ae3cf928c89543505db`.

## Hull attachment and cockpit limits

Hull placement is explicitly labelled **Free placement · origin-to-grid**. It
snaps source origins, not attachment faces. Existing side armor has inner planes
187.5, 250 or 312.5 mm away from its retained origin. This pass does not invent a
physical mount or silently adjust existing placements. The draft outward wall
candidate and its proposed 62.5 mm armor spacer are not installed by this change.

The Wayfarer floorplan-only preview has two unfilled bow diagonals: required
[64, ±64] lattice spans with 0.0625/0.0625 m cutbacks have no matching native r004
profile. Shorter panels lack a qualified diagonal straight junction. Tests pin
these exact gaps. Generic diagonal modules remain required for other designs.

The owner clarified that Wayfarer's final bow corners should not be walkable and
its swept windows must remain. Generic full-height opaque walls are **not** the
final cockpit treatment. See `cockpit_boundary_variants_20260911.md`: native low
sill + glazing/frame must substitute for the opaque boundary over exact spans;
structural support/enclosure and walking reservations must be separate. No live
cockpit geometry or navigation changes are claimed here.

## Rooms and enclosure overlay

Rooms remain informational labels. **Show pressure areas**, enabled by default,
shows all named and unnamed draft areas and their area in square metres:

- Enclosed design: requested semantic boundary/roof coverage, with doors closed.
- Open to exterior: an exterior passage or absent requested roof.
- Unresolved enclosure: unsupported sub-tile divisions.

Invalid layouts do not receive enclosure claims. Doors/airlocks are assumed
closed; open dividers/passages connect areas. Cross-deck airflow and native seal
qualification remain explicit limitations. This is not measured gas pressure or
proof of installed collision, airtightness or live pressure simulation.

**Deck properties → Include roof in design** changes requested structural
coverage. **Layers → roof** changes visibility only and does not vent the design.
Pressure visibility persists in saved drafts; older checkpoints default it on.

## Evidence and verification

Actual Chromium/SwiftShader review at localhost:5174/shipyard, isolated browser
profile, screenshots in `output/playwright/shipyard-walls/`:

- `native-walls.png`: footprint-only preview, 58 native wall placements.
- `native-walls-with-partition.png`: drawn internal partition, 67 placements,
  266 native wall meshes; unsupported bow spans remain guides.
- `hull-native-walls.png`: same native walls retained in Hull mode; source-origin
  placement explanation shown.
- `rooms-pressure.png`: named Lounge + unnamed area, each 100 m², open because
  the imported floorplan requests no roof.
- `rooms-enclosure.png`: requesting roof makes both areas enclosed-design;
  hiding the roof layer leaves the enclosure result intact.
- Walls and pressure layers toggle, room label placement works, reload preserves
  the edited draft, and New empty design clears all native walls and fit notes.
- No application errors during final reload/interaction review. Intermediate HMR
  errors occurred while a new imported component file was being created; resolved
  before final review. Named browser blanked/closed and software-GPU slot released.

`npm run check` passed: 1,541 tests in 268 files plus typecheck and 77 document
checks. `npm run build` and `npm run art:check` passed. Final native-wall lifecycle
regression passed all 10 focused tests. All changed editor/viewport files passed
ESLint after replacing pre-existing cross-package relative imports in state files.
The build retains the existing large-chunk advisory. Authority unchanged; no
isolated authority smoke was required for this presentation-only pass.
