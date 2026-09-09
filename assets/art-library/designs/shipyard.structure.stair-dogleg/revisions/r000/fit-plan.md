# Dogleg stair — dimensional proposal r000

Status: dimensions and interfaces proposed; no Blender mesh, native qualification, runtime installation or owner artistic approval yet. This is a new design. The r000/a003 ladder and its current browser fixture remain unchanged.

The proposed primary kit occupies **4 × 6 m**, using two adjacent 2 m flight lanes. Seventeen equal risers of **0.1875 m** bridge the exact **3.1875 m** walking-plane separation. Each tread going is **0.3125 m**. Both values are exact multiples of the 1/32 m lattice: six and ten units respectively. The repeated nosing pitch is about **30.96°**. These are proposed game asset dimensions, not a building-code or load certification.

| Datum / dimension | Metres |
| --- | ---: |
| Lower structural origin | 0 |
| Lower walking surface | 0.1875 |
| Intermediate landing top | 1.875 |
| Lower ceiling underside | 3 |
| Lower roof maximum / upper structural origin | 3.1875 |
| Upper walking surface | 3.375 |
| Clear width between flight handrails | 1.5 minimum |
| Proposed guard height above local nosing/landing | 1.1 |
| Intermediate landing nominal depth | 1.8125 |
| Lower landing nominal depth | 1.6875 |
| Upper landing nominal depth | 2 |

All coordinates below are kit-local Blender XYZ, with Z up. A placed instance transforms the complete kit through a declared planar origin and quarter-turn; it never scales the mesh.

Flight A occupies the left lane, with centre X = 1. It starts at Y = 1.6875 and climbs toward +Y to Y = 4.1875. Its nine risers ascend from Z = 0.1875 to Z = 1.875. Eight intermediate tread goings occupy 2.5 m. The ninth rise arrives on the intermediate landing.

The intermediate landing spans nominal X = 0..4 and Y = 4.1875..6 at Z = 1.875. A proposed clear standing region after rails is X = 0.25..3.75 and Y = 4.1875..5.875. With the existing radius-0.3 m actor policy, the reference U-turn at Y = 5.0625 has room to turn from X = 1 to X = 3. This must be measured again from the authored guard and support solids.

Flight B occupies the right lane, with centre X = 3. It starts at Y = 4.1875 and climbs toward −Y to the upper landing edge at Y = 2. Eight risers ascend from Z = 1.875 to Z = 3.375. Seven intermediate tread goings occupy 2.1875 m. Its final rise meets the native upper floor edge exactly at the 2 m grid boundary. No fractional sliver of intact upper floor may cover the high tread.

The reference route is lower standing [1, 0.75, 0.1875], left flight, intermediate points [1, 5.0625, 1.875] and [3, 5.0625, 1.875], right flight, upper standing [3, 0.75, 3.375]. This centreline is inspection guidance. It is **not** a forced character trajectory or a click-to-traverse command.

## Real aperture and headroom

Omit the four native 2 m panels with kit-local origins (0,2), (2,2), (0,4), (2,4) from both the upper floor and lower roof. Their union is X = 0..4, Y = 2..6. Retain the lower floor below the stair and the entrance-strip upper floor / lower roof at Y = 0..2. New fascia closes the exposed slab edge without crossing the declared opening. Stair solids occupy part of this slab opening; usable actor clearance is the measured support/body envelope, not a claim that the whole 4 × 4 m volume is empty.

A complete interior-hole validation board can be **8 × 10 m**, with the stair kit at [2,2,0]. Its actual omitted panel origins become (2,4), (4,4), (2,6), (4,6), leaving 2 m floor margins around the hole. The 4 × 6 m kit reservation and the larger validation board are different footprints. The current 6 × 6 m ladder room is not silently expanded or reused.

Under the retained entrance-strip ceiling, the radius-0.3 m body can overlap the ceiling edge while its centre reaches Y = 2.3. Conservatively considering the forward toe/support reach to Y = 2.6 lifts the reference body no higher than the third tread, Z = 0.75. An upright 1.8 m body then reaches Z = 2.55, leaving **0.45 m** to the 3 m ceiling underside. This is a dimensional prediction requiring native measurement, not completed clearance qualification. The remainder of both flights and the turn landing are within the real slab opening; the higher deck's separately authored ceiling must also be checked.

Intermediate landing underside, stringers, posts, risers, mounting plates, handrails and the upper slab edge all belong in the eventual collision/headroom audit. Lower-plane walking under a stair cannot be inferred from a single height field: there may be multiple support surfaces at the same XY. The first native authoring pass should close unsafe underflight support/service spaces with real panels or explicitly measure supported under-stair paths. Invisible collision boxes cannot substitute for those visual boundaries.

## Ordinary walking contract

Walking intent remains planar direction/speed. Authority identifies the current support surface, clips the actor capsule against the actual stair/rail/ceiling geometry, permits the declared maximum riser only at supported adjacent treads, and derives Z from the validated support/gait envelope. The character can stop, reverse and move laterally within the clear flight or landing area. It does not receive the ladder's timed climb mode, exclusive ladder reservation or an automatic trip to the other deck. The effective deck changes only across the validated landing boundary.

Keep two representations: native stepped Blender treads/risers and guards for visual truth; separate supported-walking surfaces, adjacency, step limits and conservative body/sweep envelopes for authority. A smoothed support plane, if used, must have an explicit measured deviation bound relative to actual tread tops and must not allow the body through a riser, rail or ceiling. No client position, Z, target deck or traversal duration is accepted as authority.

## Smallest native kit and fit sequence

1. Author a nine-riser flight and an eight-riser return flight, with editable closed tread/riser meshes and continuous side stringers.
2. Author the intermediate landing, real supports/bearing contacts and the upper/lower mount pieces. Reuse existing native floor/roof panels only through exact pinned placements; do not alter their source meshes.
3. Author separate outer and centre handrail/guard groups, landing toe guards and aperture fascia. Preserve at least the proposed 1.5 m flight width after all intrusions.
4. Check every actual tread edge and riser against both walking directions, including the floor-to-first-step and last-step-to-floor transitions. Prove the landing turn with the full radius/height envelope rather than just a centreline.
5. Export the authored surfaces directly to a new staged GLB; retain a separate collision/support audit, Blender source, full context and orthographic evidence. There is no pressure, structural load, material-cell damage or owner artistic qualification from dimensions alone.

A simpler alternative is a **2 × 8 m straight stair** with the same seventeen risers, sixteen intermediate 0.3125 m goings (5 m total), and 1.5 m lower/upper landings. It uses less total plan area (16 m² versus 24 m²) but needs an uninterrupted 8 m ship run. The dogleg is the primary proposal because it shortens the long dimension to 6 m and provides a rest/turn landing. Neither is a claim that the current Wayfarer has appropriate free space.

## Elevator boundary

Larger ships and stations need a distinct elevator family: actual car floor/enclosure, shaft guides and supports, landing thresholds and doors, a car door where applicable, measured swept car/counterweight clearance, stop anchors and maintenance spaces. Authority requires allocated power/drive policy, door and obstruction interlocks, support/occupancy for all passengers and carried contents, persisted travel/stop states, failure/recovery behavior and separately validated landing transfer. A moving platform animation or reused manual-ladder timer does not supply these systems. No elevator mesh, power behavior, passenger capacity or load rating is created by this stair proposal.
