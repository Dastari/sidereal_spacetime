# Cockpit boundary variants and nonwalkable bow areas

Date: 2026-09-11. Read-only audit and proposed integration contract. No runtime, assets, blueprint, collision or live ship changes were made by this audit.

## Owner direction

Preserve Wayfarer's low cockpit sill, swept glazing and frames. An automatically generated full-height solid wall must not cover those windows. The two diagonal bow areas are not walkable in the final Wayfarer design. Keep diagonal floor and boundary modules available for other authored ships.

A nonwalkable area and a pressure boundary are different things: declaring a patch unsuitable for walking must not automatically erect a wall on its edge or expose an otherwise enclosed cockpit to vacuum.

## Current source evidence

`packages/content/src/wayfarer-starter-r001.json` contains 51 semantic native floors, but no semantic partitions, openings or room labels, and no `structure` extension. Its deck ceiling is 82 lattice units (2.5625 m); `roof` is false because the preserved native roofs have not been replaced by generic roof qualification. Its immutable pin is in `packages/content/src/wayfarer-starter.ts`.

The bridge's currently authored floor union is the hexagon in metres:

`(-3,9), (3,9), (3,11), (1,13), (-1,13), (-3,11)`.

The specific diagonal floor records are:

| Stable ID | Nominal polygon, metres | Current representation |
| --- | --- | --- |
| `pilot-r004-floor-corner45-05` | `(1,11), (3,11), (1,13)` | Semantic floor using native r002 triangle |
| `pilot-r004-floor-corner45-06` | `(-3,11), (-1,11), (-1,13)` | Semantic floor using native r002 triangle |

There are also separate exterior diagonal cheek armor records, `pilot-r005-outer-diagonal-cheek-starboard` and `pilot-r005-outer-diagonal-cheek-port`, at `(1,11,-.25)` and `(-1,11,-.25)`. These are already exterior visuals; they do not grant walking support. Do not confuse them with the two semantic triangles above. The owner direction should be mapped explicitly to these named regions before producing a revised template, rather than removing all diagonal modules from the catalog.

Native placement/catalog evidence is `assets/runtime/assembly/wayfarer.json` and `assets/runtime/assembly/catalog.json`. R006 is cumulative: retained IDs and unchanged mesh names often still say r004, while installed material-preserving derivatives live under `hull/finish-r004`. Do not select art by the highest numeral in a filename.

## Proposed exact cockpit boundary role mapping

Keep the following authored assembly groups as boundary *variants*, replacing the default opaque wall visual on their covered spans. A variant must retain its native sill, glazing, frames, collision envelope and separate qualification state.

| Boundary span in ship-local metres | Native low sill/base | Native glazing/frame | Proposed role |
| --- | --- | --- | --- |
| Starboard `(3,9) → (3,11)` | `pilot-r004-hull-straight-07` | `pilot-r004-canopy-side-08` | Swept glazed cockpit boundary |
| Port `(-3,11) → (-3,9)` | `pilot-r004-hull-straight-09` | `pilot-r004-canopy-side-left-10` | Mirrored swept glazed cockpit boundary |
| Starboard diagonal `(3,11) → (1,13)` | `pilot-r004-hull-diagonal45-11` | `pilot-r004-canopy-diagonal45-12` | Angled swept glazed cockpit boundary |
| Port diagonal `(-1,13) → (-3,11)` | `pilot-r004-hull-diagonal45-13` | `pilot-r004-canopy-diagonal45-14` | Angled swept glazed cockpit boundary |
| Nose `(1,13) → (-1,13)` | `pilot-r004-bow-transom-15` | `pilot-r004-canopy-nose-16` | Swept glazed nose boundary |

All five base placements begin at Z .1875 m; glazing starts at Z 1.3125 m. The straight base is 1.125 m high. Preserve authored transforms and optical materials; do not stretch a generic wall or turn the glazing opaque in this local editor proof.

Additional distinct roles:

- `pilot-r004-corner-buttress-17/18`: junction support/frame at the main-deck interface, not equipment and not standalone airtightness proof.
- `pilot-r004-airlock-frame-22`: future door frame at `(1,9,.1875)`, rotation π. Its 1.25 m clear doorway has no door leaf or closed seal supplied by this asset. It is not an airlock merely because of its legacy ID.
- `pilot-r004-rear-partition-23/24`: interior partitions at `(-2.625,8.625,.1875)` and `(1,8.625,.1875)`, rotation zero. Retain the qualified native collision binding; their conversion alone does not create semantic room/pressure boundaries.
- `pilot-r004-pilot-roof-25`, contextual roof pieces, and `pilot-r005-outer-roof-collar-port/starboard`: roof-layer visuals. Collars follow roof visibility; hiding them does not delete simulation enclosure.
- The seven `pilot-r005-outer-*` shoulder, collar, cheek and bumper identities remain separate exterior armor/roof components. Their footprint must not enlarge walking support or create a pressure compartment.

## Schema and compiler changes required

Current `LayoutStructure.wallFaces` contains left/right cosmetic strings. It cannot describe transparent infill, low sill height, inclined glazing, full native assembly dependencies or an authoritative seal. `Opening.kind` supports door/passage/airlock only: representing a window as a passage would incorrectly imply a portal. `FloorTile` currently has no walkability role; every tile contributes to the floor union. `LayoutWall` distinguishes perimeter/partition but has no physical boundary variant.

Introduce a versioned boundary-variant binding with stable boundary/span ID, explicit role (`opaque`, `glazed-cockpit`, `doorway`), exact native asset/placement pins, base/top datums, coverage segments, transparency, collision adapter, pressure adapter and damage adapter. Unsupported adapters remain explicit. Apply visual substitution only over exactly matched spans; unmatched spans retain diagnostics. Do not simply suppress all perimeter walls whenever an arbitrary hull mesh is nearby.

Introduce a separate walkability/reservation mask, or an explicit tile role whose compiler distinguishes structural floor support from navigable floor. For the two identified bow triangles, remove navigation permission while retaining structural backing/visual coverage if required by the cockpit assembly. Do not delete them from the enclosure floor union merely to prevent walking: doing so would produce a stepped footprint, trigger incorrect automatic walls, and discard support/seal provenance. If the final authored geometry really removes those floors, that is a separate geometry/pressure revision requiring replacement support and closure.

Room labels remain informational. Derive compartments from physical boundary coverage and actual door states, then associate labels by seed/containment. A nonwalkable reservation should not split a pressure volume unless it contains an actual sealed boundary. Glazing can form a sealed boundary only through a qualified adapter; transparency is not ventilation.

## Collision and pressure limits

`docs/r006_collision_boundary_audit.md`, `packages/content/src/pilot-layout.ts` and `packages/sim/src/native-deck.test.ts` record the standing-envelope constraints of the swept canopy. The existing bounded legacy rule uses a .732 m inward canopy/frame clearance plus .3 m actor radius: straight centre cap 1.968 m, nose cap 11.968 m and diagonal sum limit approximately 12.5405316 m. These limits are evidence for the exact authored cockpit, not permission to infer a generic collision wall from visual AABBs.

`packages/sim/src/wayfarer-cockpit-collision.ts` qualifies exact rear-partition source transforms and support while returning `pressureQualified: false`. Its proof must survive a template migration, or be explicitly replaced and requalified. Do not assume legacy lab constraints automatically apply to every construction instance; verify the actual authoritative movement path when integrating the revised template.

The existing native main-hull audit still reports incomplete whole-Wayfarer enclosure proof (`docs/handoffs/wayfarer_authored_interface_audit.md`). Separate airlock/test-room proofs are not evidence that the glazed bridge or entire ship is pressurized. In the editor show design compartments distinctly from verified sealed volumes and live gas/pressure values.

## Acceptance for the later implementation

1. Show the exact low sill and swept windows in the editable Wayfarer and actual game, with no generated opaque duplicate across them; verify roof/collar toggles.
2. Display the two selected bow regions as nonwalkable reservations, while retaining diagonal modules for another independently drawn floorplan.
3. Verify actor body clearance at straight, diagonal and nose glass, blocked access to the reserved triangles, and the rear doorway/partitions without invisible oversized blockers.
4. Recompute structural support, enclosure topology, openings and exact native collision bindings. Report any unqualified pressure faces rather than inventing pressure values.
5. Publish a new immutable template/revision and apply any live refit through authority with expected revision, preserving identities, inventory and fitting state. This audit performs neither action.
