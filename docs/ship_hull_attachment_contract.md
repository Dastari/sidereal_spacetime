# Hull attachment frames

2026-09-13 implementation candidate. Owner dimensions remain 250 mm walls inward of the structural boundary, a 187.5 mm floor and 3 m clear wall height.

The structural floor perimeter is the hull mating plane. Decorative depth, paint variants and mesh bounds do not set placement. An authored component supplies a named attachment frame; the editor rotates that frame toward the outward normal and translates its mounting point onto a compatible perimeter segment. The component base sits at the finished floor top. No mesh scaling is performed.

`packages/content/src/ship-hull-interfaces.v1.json` binds profiles to exact asset IDs and native SHA-256 values. New straight side panels have a 2 m span and a 3 m height. Blender local X points outward, Y follows the wall and Z points up. The origin is the mounting plane midpoint at the component base. Required editable Blender empties are `HULL_ATTACH` at (0,0,0), `HULL_EDGE_START` at (0,-1,0), `HULL_EDGE_END` at (0,1,0), and `HULL_TOP` at (0,0,3), in metres. Native surfaces remain entirely at X >= 0. Their measured bounds define protrusion for that exact asset; they do not change the structural footprint.

The editor rejects attachment attempts farther than 2 m from a perimeter or where the native span cannot fit. Translation along the perimeter uses the 1/32 m lattice. Mirroring transforms the attachment frame as well as the mesh. Arbitrary component rotation is disabled for these attached panels; their facing follows the boundary. Snap preview and committed placement share the same resolver.

The r005 side-armor derivative preserves all eighteen authored variants and their materials. It removes the retained engine/thruster Boolean cutouts; it does not remove the actual devices. r004 records the normalization step. r005 changes only the upper border region by 62.5 mm to reach 3 m. Historical r003 approval does not approve either derivative.

Legacy cockpit parts are now selectable in Hull, including parts whose old asset category was wall or roof. The registry retains exact supported legacy straight interfaces. Unqualified curved/diagonal cockpit interfaces and engines use explicit grid placement pending dedicated mounts. The editor identifies those parts as having a pending mounting interface. Their placement does not confer gameplay or pressure qualification.

Logical service connections describe emitter/receiver connectivity. They are separate from `layout.routes`, whose physical support and wall-penetration checks remain required. Current reactor/engine power is a boolean connection gate with unrated output and demand; no fuel, coolant or ventilation simulation is implied.

New r005 source admission independently proves the eighteen hull bounds remain outside the floor, then reuses the unchanged qualified Wayfarer walking interfaces. Live refit with the new logical circuit identity domain requires a separate conservation qualification. Existing personal ships and approved native source pins are not rewritten by editing or publishing a draft.
