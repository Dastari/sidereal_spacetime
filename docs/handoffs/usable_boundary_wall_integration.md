# Corrected native exterior wall family

Status: representative source/interface qualification passes; candidate only. No installation, whole-Wayfarer completion, pressure allocation or final owner art approval.

Current exact attempt: `assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a004/`. The versioned contract is `revisions/r000/interface-family.json`; exact GLB and material hashes are in `a004/delivery-manifest.json`, and `a004/native-qualification.json` records all 40 checks. Editable Blender source, native PBR/material textures, separate contact proxies and actual images accompany the manifest.

The four exports are:

- `straight-2m.glb`: canonical 2 m run, interior boundary Y=0, outward structural body Y=−0.25…0. Floor/roof bearing contacts occupy separate explicitly declared slab intervals.
- `outer-corner.glb`: convex exterior corner, outside the usable X≥0/Y≥0 quadrant. Hidden contact ears overlap two straight walls without overlapping visible top faces.
- `straight-port-legacy.glb` and `straight-starboard-legacy.glb`: exact authored source-frame versions for original wall origins X±4.6875. These leave original placed transforms unchanged; no runtime recentering, scaling or furniture movement.

The native continuous bodies use Blender Boolean union to eliminate overlapping coplanar contact faces. The original editable contact operands remain hidden source objects and independent proxies, never duplicate exported visual solids. Surface enamel, recessed red service panel, cyan emitter and native normal/packed maps reuse the pinned side-armor r003 material datablocks.

## Actual unchanged-context evidence

The comparison preserves `floor--2--3`, `equipment-locker--4.7--6` and the original wall placement `wall--2--3`. The expanded layer check also preserves `roof--2--3` and `superstructure--3--3`.

- `a004/same-placement-original.png`
- `a004/same-placement-corrected.png`
- `a004/same-placement-with-armor.png`
- `a004/straight-and-corner.png`

The original wall intersects the locker by approximately 0.000442 m³. The corrected native source has zero intersection and at least 62.5 mm separation. Raw native triangles and native solid intersections leave the entire declared usable prism clear. Real unchanged floor and roof solids have positive bearing contact. Removing the authored floor bearing opens the measured edge void; this is a genuine negative control.

The original armor inner plane is X=−5.3125. The initial 625 mm outward wall body collided with that unchanged armor by 3.298675 m³. It was not accepted as a full attachment. Attempt a004 uses an authored 250 mm structural reservation derived from the available interface space and leaves 62.5 mm separation; it does not move or scale the armor. Armor sockets face outward at the structural plane. A mechanical spacer/fastener interface across that gap still needs explicit qualification and approved functional definitions; a socket coordinate is not load/strength approval.

Parent reviewed the actual a003 original/corrected images and accepted the representative integration improvement, explicitly not final owner art approval. The subsequent armor correction is separately preserved in a004. Earlier a001/a002 coplanarity failures remain evidence and executable negative controls.

## Reproduce and validate

```sh
python3 scripts/art_library/run_usable_boundary_wall.py --attempt N
.runtime/construction-enclosure-python/bin/python scripts/qualify_usable_boundary_wall.py
.runtime/construction-enclosure-python/bin/python -m unittest discover -s scripts/geometry_tests -p test_usable_boundary_wall.py
```

Use a fresh attempt number. The configured Blender path comes from `dev.toml`; these commands author offline and do not prepare/publish apps or mutate a database. Four focused tests cover current native geometry, a thin triangle crossing the usable quadrant without an inside vertex, the old coplanar corner and the old wall/armor collision.

## Required expansion and activation boundary

The current representative uses one simple straight source group. Next apply the same constrained source datums to the simple port/starboard wall groups, then separate the exterior and internal-partition roles of the mixed boundary groups. Do not move an entire mixed group outward, erase its partition or use nominal room labels as pressure geometry. Preserve the original placed-ID lineage; any child split requires an explicit deterministic mapping and later authoritative state migration.

Qualify each floor/roof/shoulder/cockpit neighbor with the unchanged source hashes, source support and complete reserved envelopes. R006 cockpit remains preserved. Exterior corner and shoulder adapters must mate actual profiles and support surfaces, with real aperture/gap negative controls. Check armor, equipment access and visible face overlaps across modules as well as within each export.

Only a complete admissible candidate should update the trusted template's source hash, native visual mapping and independently qualified walking/pressure/damage bindings. Existing source SHA gates must not be weakened or accept client-provided collision data. Publication and a state-preserving live refit remain distinct operations. The previous standalone airlock authority proof does not certify this unfinished full ship enclosure.

## First actual source-pair expansion: a005

Wayfarer's old inner-facing and outer-structure strips have separate placed IDs. Installing the entire prototype in the inner-facing slot while retaining the old outer strip duplicates structure. Attempt a005 therefore exports separate pressure-body and inner-facing parts at their respective unchanged source origins. Full canonical/legacy prototypes remain comparison/library artifacts and must not also be installed beside those split parts.

`a005/pair-qualification-a003.json` passes 81 native checks and records eight exact replacement mappings across four real source pairs:

| Exterior structure ID | Interior-facing ID | Unchanged locker |
| --- | --- | --- |
| `wall--3--3` | `wall--2--3` | `equipment-locker--4.7--6` |
| `wall--3--1` | `wall--2--1` | `equipment-locker--4.7--2` |
| `wall-3--3` | `wall-2--3` | `equipment-locker-4.7--6` |
| `wall-3--1` | `wall-2--1` | `equipment-locker-4.7--2` |

Every original record/transform stays intact, with only proposed native asset bindings changing. All 4,020 native surface triangles and materials match the complete qualified wall when the split parts are assembled at the recorded origins. Retaining the old exterior strip produces a measured positive-volume duplicate and fails the intended installation contract. Unchanged lockers and armor remain clear.

The current report compares complete triangle/material multisets at the 1 µm export-encoding precision. An earlier comparator incorrectly included display labels truncated differently by Blender's name limit; its failed report is preserved as `pair-qualification-a002.json`. That comparison fix did not modify geometry. a005 is an export/binding iteration with equivalent surfaces, so it reuses the explicitly identified a004 actual native render evidence; no new screenshot is falsely claimed.

Reproduce with `scripts/qualify_usable_wall_pairs.py` and `scripts/geometry_tests/test_usable_wall_pairs.py`. This batch is not yet an admissible whole-ship rebuild: mixed partition groups, neighboring old strip junctions, shoulders/cockpit adapters and full closure remain required. No database or runtime catalog changes accompany the candidate.
