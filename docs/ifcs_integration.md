# Component-driven IFCS integration

Status: Phases 0–3 implemented and verified in isolation; phase 3 published with owner approval; phase 4 implemented and verified; phase 5 presentation implemented and verified; phase 6 planned
Last updated: 2026-09-14
Owners: Sidereal simulation and ship assembly

The accepted [IFCS update plan](handoffs/ifcs_update_plan_20260914.md) and
[progress/evidence ledger](handoffs/ifcs_update_progress_20260914.md) distinguish
implemented code, isolated deployment evidence and shared publication. The old
[DR-0034](../reference/sidereal/docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md)
and [allocation proposal](../reference/sidereal/docs/features/proposed/fly_by_wire_thrust_allocation_proposal.md)
remain design history, not instructions to restore the old stack.

## Implemented simulation

The pure allocator prioritizes exact reachable wrench, then minimum actual
newtons, then dimensionless quadratic throttle balancing on the full optimal
face. For unreachable requests it prioritizes attitude and reports translation
shortfall honestly. Physical columns determine solve order; IDs identify output.
All stages share an 80-pass ceiling and expose convergence. There is a 256-actuator
limit. Heading wrapping and collision rollback preserve telemetry with motion.

The controller clamps to the derived envelope and projects joint feasibility.
Guidance shortfall remains separate from allocator residual. Centripetal feedforward
and speed-preserving turn limits are the default; `rawTurnBehavior` is an explicit
profile flag. Heading capture limits gain for critical damping. All arithmetic
is f64 metres, and simulation remains planar. Local +Y is bow-forward; positive
heading rotates +Y toward -X. Exhaust is opposite the force axis.

The versioned physical catalog supplies individual structure, armor, equipment,
crew-body, inventory-unit and liquid-density definitions. The compiler counts
placed hardware once; fitting rows add no mass. Cargo root payload and crew with
carried/equipped inventory come from bounded authoritative joins. Carrier adoption
replaces its prior shell under the same identity. Rotation and mirroring transform
centroid, mount, force and nozzle together. Every component adds centroidal inertia
and its parallel-axis term. Missing definitions or invalid bindings reject flight.

The empty canonical r002 has 301 hardware contributions, 12,000 kg and
636,480 kg·m² to floating roundoff. Its COM is approximately (0.012567, 0.915898) m.
This is an offline v1 calibration, not live target-minus-parts ballast. Actual cargo
and crew change the result. The authored capsule midpoint remains (0, 1.125) m,
radius 5.4 m and half-length 7.125 m. Native collision revisions/pins are unchanged.
Only qualified r001/r002/r005 native structural sources are accepted; arbitrary
structural revisions still require qualification.

## Implemented authority switch

The scheduled shared-world path requires compiled-definition hooks. It compiles
at most two oldest dirty ships per tick, then integrates forces and contact about
the compiled COM and persists the authored frame origin. Moving cargo or walking
crew changes COM/inertia without translating the ship or passengers. The legacy
fixture flight schedule is disabled; preserved unadmitted rows require explicit
validated migration and never select a stock flight fallback.

Private fitting rows bind definitionRevision (additive default 1). Private
compiled/dirty tables retain input/catalog hashes, mass/inertia, envelope, actuators,
computers, hull and contribution ledger. Installation and explicit pilot entry or
input recording may compile one pending authorized ship before applying the same
strict validators. This additional bounded work avoids rejecting pilot setpoints
because a passenger just moved; scheduled consumption never opts into it.

Only ready definitions create controls. A rejected update clears actuation but
retains previously valid mass/hull for coasting. An initial invalid definition
cannot invent inertia: admission rejects it, and an already present invalid body
rejects its contact island and clears stale telemetry. No stock recovery is used.

Station occupancy, current deck/admission, connection lease, operational computer
and input expiry remain checked at consumption. Clients submit throttle/turn
setpoints and walking intent, never flight transforms or forces. Fresh seated zero
input brakes; stale input, station loss or power loss yields coasting.

Validated removal retains the fitting UUID as a tombstone and removes its physical
contribution. Damage/detachment retain mass and reduce availability. The server-only
damage-event producer and consumption are bounded, revision-checked and audited;
weapon hit detection remains future combat work. Engine power validates the bounded,
unique actual installed definition-bound set, including after removal, while retaining
owner/active/reactor/mapping/revision/operation checks.

Explicit owner-issued passenger invitations expire or can be revoked. Boarding
requires separate passenger consent and supported nearby stationary ship entry.
Separate membership predicates grant walking and approved interior views, not
owner/pilot/object/inventory/refit permissions. Revocation removes access immediately;
blocked return retains the physical body and retries bounded recovery. Read projections
redact account identities and private ratings. See the ledger for policy bounds.

## Evidence and remaining phases

Full phase 0, 1 and 2 gates passed with 1,925, 1,951 and 1,993 tests respectively.
Phase 1 forward/lateral 18,000 N requests spend exactly 18,000 N; the eight-second
turn baseline ends at 30.001315 m/s with zero heading overshoot in its capture test.

Phase 3 isolated evidence includes the standard authority smoke; actual two-client
passenger walking during asymmetric turning; removal; zero-powered-engine coasting;
cargo transfer shifting COM without frame translation; and preserved inventory UUIDs.
A copied isolated module triggers the real server damage producer with a fixed event
and deliberately corrupts a definition for rejection testing. Those test triggers
are absent from the production module. Damage reduced measured acceleration from
2.977741 to 2.398736 m/s² while retaining mass. Populated additive migration preserved
all captured ship/item IDs and fitting rows, defaulted definitionRevision to 1, and
compiled all ten preexisting ships. Client reload is required by the additive row
layout change. The owner approved phase 3 publication; the reviewed module was
published non-destructively to the shared development database. Both live ships
compiled ready and captured ship/item UUID sets were preserved.

Phase 4 adds a separate validated computer circuit command using the existing
power-fitting rows. Unpowered computers reject IFCS input and cut actuation; fresh
intent is required after restoring power. The compiler accepts bounded per-actuator
supply fractions, multiplying damage/power availability; authority explicitly
supplies 1 pending M4. Accepted per-substep newton-seconds are recorded in a private
latest-nonzero sample with tick, compiled revision and input hash. Coordinate
rollback discards usage; a contact-budget stop retains accepted force kicks. Idle
ticks do not rewrite the previous sample. No fuel or electrical energy is deducted;
routed resource networks remain outside this update. Phase 5 plumes now read owner-scoped compiled nozzle positions, exhaust vectors
and achieved throttle by actuator UUID. Removed/rejected projections dispose their
plumes; there is no stock mount list or exactly-nine display gate. The authored
flight review and normal Flight properties panel display compiled mass, COM,
inertia, directional/angular envelope and rejection reason. Passenger composition
joins the narrow current interior admission to discovered motion and exact document
revision, without owner-only telemetry or pilot controls. Retained voxel-shell
nozzles reference the v1 physical definitions and placed transforms.

Real browser review passes forward burn (three aft plumes, zero retro output),
turning and removed port main (two remaining aft plumes). The latter reduces mass
by 203.917043 kg and leaves eight compiled actuators. Screenshots and sampled
telemetry are in [phase 5 evidence](handoffs/ifcs_update_evidence_20260914/README.md).
Phase 6 removes dead lab helpers, fixture references, duplicate writers and dead
ship fields from the client projection; base-table fields remain by owner decision.

Phase 4 final gates: 2,058 tests, TypeScript, 88 document/provenance checks and
full build pass; fresh isolated two-client computer-power smoke passes.

Phase 5 full gates pass: 2,061 tests, TypeScript, 88 document checks, build,
voxel export in isolation, canonical art validation and the three required real
browser flight checks. Phase 6 cleanup remains planned.
