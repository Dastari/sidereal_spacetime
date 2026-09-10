# Wayfarer authored interface audit

Status: measured source nonconformance and required authoring correction, 2026-09-10. No model, placement or live database migration has been applied. This is independent of the separately qualified preserved-fuel mount in the existing-ship refit.

The owner clarified that models must fit declared reserved shapes and heights before placement. Fix Blender asset/interface revisions; do not shift individual furniture pieces to conceal structural intrusion. Original source revisions and placed-object identities remain preserved.

## Exact measured results

Run the declared geometry interpreter:

```sh
.runtime/construction-enclosure-python/bin/python scripts/qualify_wayfarer_authored_envelopes.py
.runtime/construction-enclosure-python/bin/python scripts/qualify_wayfarer_placement_interfaces.py
.runtime/construction-enclosure-python/bin/python -m unittest discover -s scripts/geometry_tests -p test_authored_envelopes.py
```

Reports are `.runtime/wayfarer-authored-envelope-audit.json` and `.runtime/wayfarer-placement-interface-audit.json`. Both record exact input SHA-256 and unchanged transforms. They consume the 262-placement source mapping from `shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json`, rather than a newer unpinned live snapshot.

| Source | Result |
| --- | --- |
| Floor kit r002, GLB `138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585` | All twelve complete native asset groups fit their declared convex polygon and Z 0–0.1875 m. All exported geometry nodes are assigned and checked. No sampled proxy substitutes for visible geometry. |
| Locker r005, GLB `f527af1e44fc1570355c2268055b7b31343c45849a807b40993cf516c263093a` | Complete native export fits its existing bottom-centered 0.5 × 1.5 × 1.3125 m envelope. Source `SOCK_MOUNT`, power and data interfaces remain explicitly proposed, without a qualified mating surface/normal/clearance contract. |
| Legacy boundary-bearing wall groups | 21 source groups intersect the nominal main-deck usable prism X −5…5, Y −9…9, Z 0.1875…1.9875 m. Some groups also contain room partitions, so they must be separated by authored role before correcting exterior portions. This count is not 21 independently certified exterior panels. |
| Equipment against actual native wall solids | Six locker instances have positive native intersection volume, approximately 0.000442 m³ each. Fifteen other audited equipment/container placements have no native wall-solid overlap. This does not certify every access, support or service interface. |

The floor kit is not oversized. A beveled edge retreats inside its nominal polygon as intended. Its open seam/pressure backing qualification is a separate question from reserved-envelope conformance.

The six affected stable IDs are:

- `equipment-locker--4.7--6` against `wall--2--3`
- `equipment-locker--4.7--2` against `wall--2--1`
- `equipment-locker--4.7-2` against `wall--2-1`
- `equipment-locker-4.7--6` against `wall-2--3`
- `equipment-locker-4.7--2` against `wall-2--1`
- `equipment-locker-4.7-2` against `wall-2-1`

Port lockers occupy X −4.9375…−4.4375 m; starboard lockers occupy 4.4375…4.9375 m. The simple adjacent port wall groups extend inward from X −5 to −4.375 m, and starboard groups from 4.375 to 5 m. These are genuine solid intersections, not merely touching AABBs. The earlier bounded inward-position searches were diagnostic, have been removed from the executable audit, and are explicitly rejected as the primary fix. No proposed furniture shift was applied.

## Corrected source/interface contract

1. Keep the r002 floor polygons, height and origins. Add the same complete-export containment gate to catalog admission and publication; require positive evidence for every new variant and allowed reflection. A 2.04 m handle on a 2 m reservation fails. A point outside a triangle fails even if it fits the triangle's bounding rectangle. Do not hide geometry from the validator through node selection or collision simplification.
2. Author a reusable exterior structural wall family whose interior plane is the nominal usable floor boundary and whose complete above-deck geometry is outward of that plane. Declare its own reserved outward thickness, roof/floor datum contacts and compatible corners/openings. Hidden floor bearing must stay at/below deck-top; an inward wall panel is not bearing contact. Armor has a separate further-outward interface.
3. For existing straight port source origins X −4.6875, the fixed local interior boundary is X −0.3125. For starboard source origins X 4.6875, it is X +0.3125. This comes from the unchanged nominal world edges ±5 m, not a guessed correction offset. A replacement source at those existing origins must respect the outward half-space. New general library assets should use the canonical boundary origin, with an explicit versioned source-frame adapter for legacy placements.
4. Separate integrated interior partitions from exterior skins in the old composite wall groups. Give partitions declared reservations, door openings and physical roles. Do not move an entire mixed group outward or silently erase its room boundary. Preserve source placed-ID lineage and explicitly map any split child IDs in a later authoritative migration.
5. The unchanged locker body would have 62.5 mm distance from a corrected plane at X ±5. Qualify its actual floor support and intended mount/access interface; do not turn the current proposed `SOCK_MOUNT` into a certified wall attachment by name. If a bracket is required, author it inside an explicitly reserved attachment volume, without reducing the usable floor reservation. Proposed strength/power/capacity values remain unapproved.
6. Requalify source vertices, walking/support, door sweep, all neighbor contacts and pressure surfaces before switching revisions. Then apply a server-owned expected-revision refit preserving fitting/item/container/character IDs and contents. The audit itself never edits transforms or live state.

## Limits and next qualification

The raw floor containment check uses 1 µm tolerance only for GLB float encoding. It checks actual native vertices before collision normalization; convex containment therefore bounds every native triangle. Animated/deformed assets require a separate swept envelope. Current collider-based wall-volume measurements use the existing independently recorded native CSG normalization and are not visual coplanarity evidence.

Same-facing coplanar visual faces, decals and z-fighting require an additional native face-layer test. A positive structural overlap is allowed only at a declared hidden support/seal contact; it never grants equipment penetration permission. The measured floor/wall issue does not justify global tolerances or arbitrary overlap allowance.

Native roof closure work has locally qualified contacts, but the whole main hull still has an open connectivity result. The attached airlock chamber is separately bounded at approximately 20.5981 m³; no whole-Wayfarer airtightness or gas inventory is claimed. Structural authoring corrections must be incorporated into the final enclosure proof before any whole-ship pressure claim. Passing these numerical checks also does not constitute owner artistic sign-off.
