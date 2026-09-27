# Wayfarer flight computer implementation

Status: Compiled authority verified through phase 3 in isolation; phase 3 published with owner approval; resource gating implemented and verified; presentation implemented and verified; cleanup implemented and verified
Last updated: 2026-09-14

The implementation follows the [IFCS integration contract](ifcs_integration.md)
and [phased update plan](handoffs/ifcs_update_plan_20260914.md). Exact commands,
measurements, phase commits and publication state are in the
[progress ledger](handoffs/ifcs_update_progress_20260914.md).

## Controls and physical integration

W/S request forward/reverse velocity ceilings of 30/12 m/s. A/D request angular
rate bounded by the compiled envelope, profile and default speed-preserving turn
limit. Fresh released controls use actual opposing actuators to brake velocity
and rotation. Heading capture is tested but has no heading-selection UI/reducer.
The shared 50 ms schedule runs three 60 Hz controller/contact steps. Collision
owns drift; forces/torque alter COM velocities. The authority adapter converts
COM state back to the unchanged authored frame. There is no passive velocity
multiplier or client-authored force/transform.

The resolver requires actual compiled state. Its mass, inertia, actuator mounts,
axes and thrust come from versioned physical definitions and placed transforms.
Crew, equipment, stored items, liquid and cargo contribute once. Inventory unit
masses/liquid densities have explicit physical v1 snapshots, independent of later
inventory presentation metadata edits. The empty r002 calibration is 12,000 kg /
636,480 kg·m²; the measured initial occupied starter was 12,089.7 kg.

Controller requests never exceed the derived envelope. The bounded allocator
minimizes expended newtons for reachable requests, balances only within the optimum
face, and uses physical ordering independent of actuator labels. An 18,000 N
forward or lateral request spends 18,000 N; a pure 18,000 N·m couple spends
2,769.230769 N. Effort penalty is dimensionless. The baseline full turn preserves
30 m/s within the documented tolerance; raw behaviour requires a profile flag.

## Authority and availability

Actual station occupancy, current ship/deck admission, connection lease, computer
installation/power and input freshness are checked at consumption. Inputs expire
after 300 ms. Expired or lost control coasts with zero output; tests measure COM
velocity because authored-origin velocity changes as an offset hull rotates.
A pending physical update can be compiled once during explicit pilot entry/input
recording before the unchanged validators; normal scheduled work remains two ships
per tick. This prevents walking crew from causing transient false power-loss denials.

Dirty producers cover physical crew/inventory movement, fitting installation,
refit, removal, detachment, power and server damage events. Removal changes the
compiled actuator list and mass. Detachment/damage retain hardware mass. The engine
power validator accepts bounded unique actual installed definition-bound fittings,
preserving its other authority checks. Invalid definitions expose a reason and no
actuation; previously valid inertia permits coasting. Initial invalid admission
has no invented stock fallback. The old fixture schedule no longer runs.

Passenger admission is explicit, owner-issued, expiring/revocable and separate from
pilot access. Passengers consent to boarding and receive walking/interior membership
only. Validated return changes actor membership/pose with increasing revisions,
never rolls back ship motion or inventory. Revoked access remains denied if return
is obstructed; the retained physical body has bounded recovery retries.

## Telemetry and presentation boundary

Private compiled rows store the physical contribution ledger and hashes. Owner
physics projections expose readiness/rejection and compiled values. Compiled actuator
projections supply placed identity, mount/nozzle, exhaust axis and achieved throttle.
Passenger projections expose current interior membership and flight rejection reason
without account identities or private ratings. Removed/rejected/dormant devices
cannot leave stale firing output rows behind.

The composed client and `packages/render/src/flight-effects.ts` now consume the
owner-scoped compiled actuator projection. Actuator UUIDs identify dynamic plume
nodes; nozzle offset and exhaust vector come from the compiler, and only achieved
throttle lights them. Removed/rejected projections remove plume geometry. Exterior
observers retain motion-only data. The authored flight review and Flight properties
panel show compiled mass, COM, inertia, envelope and rejection reasons. Passenger
presentation requires its current admission, interior revision and discovered ship
motion. Retained shell nozzle references use the same v1 definitions and transforms.

Real browser evidence passes forward burn with zero retro output, turning and
removed port main plume disappearance. See [screenshots and sampled telemetry](handoffs/ifcs_update_evidence_20260914/README.md).

## Verified and planned

Phases 0–2 are committed with full check/build gates; phase 1 also passed isolated
smoke. Phase 3 standard smoke and a fresh two-client cargo/passenger smoke pass.
The passenger test removed 203.917043 kg of actual side-engine hardware, exercised
asymmetric turning while another client walked, cut power to all remaining engines,
and restored the passenger on revocation without changing inventory UUIDs.
The isolated fixed server damage event reduced measured acceleration from 2.977741
to 2.398736 m/s². Detachment retained mass; invalid definition injection produced a
visible rejection and uncontrolled coasting. Test-only event triggers live solely
in a copied isolated module. Weapon hit detection is not implemented.

Populated non-destructive migration preserved the captured ship/item UUIDs and fitting
rows; all ten existing ships compiled ready. The new fitting revision defaults to 1.
The owner approved and phase 3 was published non-destructively from the reviewed
source; both live ships are ready and captured ship/item UUID sets are unchanged.
Phase 4 isolated two-client smoke proves unpowered-computer actuation cutoff,
rejected fresh input, coasting and recovery with fresh input after power restoration.
The optional bounded supply map multiplies effective actuator availability; supply
zero removes force while retaining installed mass. Authority explicitly supplies 1
until M4. A private latest-nonzero consumption sample records actual accepted
per-actuator newton-seconds across substeps, including rollback/contact exhaustion
semantics, with tick and compiled revision/hash. Idle samples keep the last burn
stamped. No fuel or energy is deducted. Phase 5 client/browser work is implemented and verified; its full check/build
gates pass. Phase 6 dead-code/projection cleanup is implemented and verified. Dead ship base columns remain by
explicit owner decision.

Phase 4 final gates: 2,058 tests, TypeScript, 88 document/provenance checks and
full build pass; fresh isolated two-client computer-power smoke passes.

Phase 5 full gates pass: 2,061 tests, TypeScript, 88 document checks, build,
voxel export in isolation, canonical art validation and the three required real
browser flight checks. Phase 6 cleanup is implemented and verified.

## Phase 6 compatibility boundary

The unused `integrate` and `stepLabSpace` implementations and their obsolete tests
are removed. Every currently live shared ship has a shipWorldMotion row. Both
review installation and starter installation delegate to the canonical qualified
writer, which reconstructs the plan before writing. Actuator installation seeds
come from the actual placed transform and versioned physical definition; no live
world/render dependency imports the LAB_FLIGHT fixtures. Device service metadata
and retained mesh selection also use versioned definitions.

The deployed installation protocol ID/hash remain unchanged, independently of the
compiled physical catalog hash. Obsolete ship base columns remain private for
non-destructive compatibility, with zero sentinels on new rows. ownShips and its
generated client row omit massKg, thrustN and turnAcceleration; the primary key
and owner-only membership remain. The old refit comparison against those unused
ratings is removed as approved. Native/collision pins and all pilot consumption
validators remain unchanged. Base-column deletion requires a later scheduled
schema migration and is not performed by this update.

Phase 6 final gates pass: 2,055 tests, TypeScript, 88 document/provenance checks,
full working and independent staged builds, fresh standard and two-client isolated
smokes, lint and formatting. No LAB_FLIGHT fixture imports remain on live paths.
The PR remains draft for separate missing owner-managed Python/art dependencies;
the independent documentation export still has 33 preexisting missing links.
These limitations and the mechanical package-boundary/formatting cleanup are
recorded in the progress ledger, not represented as passing clean-clone CI.
