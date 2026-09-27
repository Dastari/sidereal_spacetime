# IFCS update plan: derived mass, layout actuators, corrected allocator

Status: Proposed implementation plan; nothing in this document is implemented
Written: 2026-09-14
Basis: IFCS audit of 2026-09-11 (pure math, authority pipeline, live probes)
Owners: Astra `authoritative_ifcs` for `packages/sim` and `packages/world` flight
modules; root for `apps/client` and `packages/render` integration

## 1. Why this plan exists

The audit found that the flight-computer math in `packages/sim/src/ifcs.ts`
is general and correct, but nothing feeds it real data. Every live ship uses
the authored Wayfarer fixture in `packages/content/src/flight.ts`: one
12,000 kg slab, nine actuators with fixture positions, availability always 1,
computer power a literal. `compileMass` has no production caller. On top of
that the allocator and controller have defects that reproduce on the fixture
itself:

| Defect | Reproduced measurement |
| --- | --- |
| Allocator co-fires opposing nozzles | 30,472 N spent for an 18,000 N forward request |
| Allocation depends on actuator ID sort order | Same ship, IDs renamed: 20,653 N spent for the identical result |
| No centripetal feedforward | Throttle + turn held from 30 m/s decays to 15 m/s in 8 s |
| Profile exceeds torque authority | 0.65 rad/s² demanded, 0.562 rad/s² available, heading overshoot up to 5° |
| Centroid offset unimplemented | `RigidBody` has no lateral offset; a real off-origin centre of mass is unrepresentable |

This plan turns the fixture into the first instance of a universal path:
installed physical definitions compile to mass, centre of mass, inertia,
actuator set and envelope; the controller requests a wrench inside that
envelope; a regularised allocator meets it with the fewest newtons; the
authority adapter integrates about the compiled centre of mass and preserves
the authored frame origin.

## 2. Scope and non-goals

In scope:

- Pure allocator/controller corrections in `packages/sim`.
- A versioned physical definition catalog in `packages/content`.
- A pure flight-definition compiler from installed parts, fittings, cargo and
  crew to `MassProperties`, `Actuator[]`, envelope and hull proxy.
- Persisted compiled flight state with revision and dirty tracking in
  `packages/world`, replacing the fixture resolver output.
- Availability writes from damage, removal and refit.
- Powered-computer gating from actual power fittings.
- Presentation reading the compiled actuator list instead of the constant.
- Removal of dead flight code and hand-maintained duplicates.

Out of scope, deliberately:

- Full power/fuel network solving and conservation (M4). This plan lands the
  interface the network will drive: an envelope clamp and a consumption hook.
- Six-degree-of-freedom motion. The simulation stays planar per AGENTS.md.
- Heading-select UI and reducer. The controller stays ready for it.
- Retuning the Wayfarer's feel. Section 9 records the owner decision needed.

Constraints carried from AGENTS.md: pure rules in `packages/sim`, content in
`packages/content`, adapters in `packages/world`; all spatial values f64
metres; clients send setpoints only; `npm run check`, `npm run build` and an
isolated `npm run smoke` before completion; non-destructive module publish;
document scaffold versus implemented versus planned honestly.

## 3. Current state the plan builds on

- Live path: `stepWorld` → `stepSharedWorld` → `stepSystemSpace` →
  `solveFlight`, 20 Hz schedule, three 1/60 s substeps, contacts own drift.
- Resolver: `packages/world/src/construction-flight-resolver.ts` returns
  `LAB_FLIGHT_MASS`, `LAB_HULL`, `LAB_FLIGHT_ACTUATORS` for both the legacy and
  construction branches, requires exactly ten fitting rows, and derives only
  `availability` and computer power from rows.
- Fitting table: `construction_flight_fitting` has `installed`, `powered`,
  `availability`, no mass, thrust or mount columns.
- Part placements (`PartPlacement` in `packages/content/src/assembly.ts`) carry
  `position`, `rotation`, `flipped`. The runtime assembly catalog has bounds,
  category and nodes but no mass or thrust.
- Cargo payload mass is already summed per container in
  `packages/world/src/construction-cargo-carriers.ts` but never reaches flight.
- A power-fitting projection (`own_authored_flight_power_fittings`) has just
  been added by another session; phase 4 consumes it rather than replacing it.
- Uncommitted resolver and `construction-flight.ts` edits on 2026-09-14 change
  blueprint-hash matching only. This plan does not touch or depend on them.

## 4. Phase 0: lock the baseline before changing behaviour

Goal: make every later phase provable and reversible.

1. Add `packages/sim/src/ifcs-baseline.test.ts` recording the current fixture
   behaviour numerically: allocation for pure forward, pure lateral, pure
   torque; expended thrust; closed-loop speed under throttle + turn; heading
   overshoot. These are characterisation tests and will be updated on purpose
   in phase 1, so each assertion carries a comment naming the phase that
   changes it.
2. Add `scripts/benchmark_ifcs_allocator.ts` alongside the existing contact
   benchmark: random layouts of 4, 9, 16, 64 and 256 actuators, reporting
   passes to convergence and microseconds per solve. The docs already require
   this benchmark before choosing a production budget.
3. Add the missing y-axis unit test: off-axis mass elements and a y-offset
   mount, so a sign error in the `(y - centerY)` terms fails a unit test
   rather than only a fixture test.

Exit: baseline suite green, benchmark numbers recorded in this document.

## 5. Phase 1: pure allocator and controller corrections

All changes in `packages/sim/src/ifcs.ts` and `system-space.ts`. No schema,
no content, no authority changes. Each item is independently reviewable.

### 5.1 Allocator objective

Replace the single unweighted least-squares with a two-term objective solved
by the same projected coordinate descent:

- Primary: weighted wrench residual. Torque weight comes from the profile's
  torque length, defaulting to the gyradius `sqrt(I / m)` so a 7 m ship and a
  70 m ship weight attitude error comparably.
- Secondary: a small quadratic effort penalty on throttle, scaled so it never
  changes which requests are reachable, only which of several equivalent
  solutions is chosen. This makes the solution unique, removes the dependence
  on ID sort order, stops opposing nozzles co-firing, and balances near-
  identical engines instead of filling them greedily.
- Priority: solve attitude first. Run the descent on the torque row alone to
  find the minimum-effort couple, then descend on translation constrained to
  the torque null space, then a final joint polish pass. A single off-centre
  thruster asked for pure translation will now deliver less force rather than
  an unrequested yaw, and the residual reports it honestly.

Keep the 256-actuator cap, the `[0, 1]` throttle bound, zero actuators
meaning zero actuation, and the stable-ID ordering for determinism.

### 5.2 Convergence exit

Break when a full pass improves the weighted residual by less than a fixed
tolerance. Keep 80 passes as the cap. The benchmark from phase 0 records the
typical pass count so the cap is a documented ceiling, not a guess.

### 5.3 Envelope derivation and profile clamp

Add `deriveEnvelope(actuators, mass)` returning maximum achievable forward,
reverse, lateral (each side) and angular acceleration, computed by running
the allocator against unit requests on each axis. `desiredWrench` clamps the
requested acceleration to `min(profile, envelope)` per axis, so the profile
becomes a ceiling the pilot experiences and never a demand the ship cannot
meet. This closes the heading overshoot and satisfies the documented "clamp
the available actuator envelope before solving".

### 5.4 Centripetal feedforward and turn-rate limiting

In `desiredWrench`, add the feedforward term `ω_cmd × v_desired` before the
acceleration clamp. In `pilotDesiredMotion`, limit the commanded angular rate
so the required centripetal acceleration at the current speed stays inside
the lateral envelope. Holding throttle and turn then holds speed and flies
the widest turn the ship can actually make. The owner decision in section 9
covers whether to keep the current speed-bleeding behaviour as an option.

### 5.5 Profile changes

`FlightProfile` gains `torqueLengthMeters` (optional, default gyradius) and
`effortWeight` (optional, default a documented small constant). Existing
content compiles unchanged.

### 5.6 Hygiene fixes

- `compileMass` throws on zero inertia so its output always satisfies the
  consumers' contract.
- Heading wraps to (-π, π] on write in `integrateWrench` and the contact
  integrator.
- `system-space.ts` builds a `Map` from allocator commands once per body
  instead of a linear `find` per actuator, and snapshots the command map
  with the bodies so a rolled-back substep does not leave telemetry from a
  step that never happened.
- `collision.ts` switches its body sort to the same plain comparison used by
  `system-space.ts` and `ifcs.ts`.

Exit: updated baseline tests show expended thrust equals requested thrust
for pure translation on the fixture, allocation identical under ID renaming,
speed held within 2 percent under throttle + turn, heading overshoot under
0.5°, and all existing IFCS, system-space and smoke tests green.

## 6. Phase 2: physical definitions and the flight-definition compiler

Goal: a pure function from installed state to flight inputs, with the
Wayfarer as the first authored instance.

### 6.1 Content: physical definition catalog

New `packages/content/src/physical-definitions.ts`, versioned and hashed:

- `PhysicalPartDefinition { id, revision, massKg, centroid: [x, y],
  inertiaKgM2 }` for every structural floor tile, wall, roof, armor section
  and installed device class that carries mass. Centroid and inertia are in
  the part's own frame; mirroring and rotation are applied by the compiler.
- `ActuatorDefinition { id, revision, massKg, centroid, inertiaKgM2,
  maxThrustN, forceAxis: [x, y], nozzleOffset: [x, y] }`. Force axis is the
  unrotated +Y convention already documented; nozzle offset positions the
  exhaust for presentation only.
- `ComputerDefinition { id, revision, massKg, requiredPowerW }`.
- A Wayfarer v1 definition set covering the nine existing device IDs and
  the hull. Section 9 records whether it must sum to the current 12,000 kg.

The existing `LAB_FLIGHT_ACTUATORS` and `LAB_FLIGHT_MASS` remain until phase
3 switches the resolver, then become a test fixture only.

### 6.2 Sim: `compileFlightDefinition`

New `packages/sim/src/flight-definition.ts`:

```text
inputs:  placed parts (id, definitionId, revision, position, rotation, flipped)
         fitting rows (id, placedObjectId, installed, powered, availability)
         cargo masses (containerId, massKg, position)
         crew masses (characterId, massKg, position)
         definition catalog
outputs: MassProperties, Actuator[], envelope, hull proxy with centroid offsets,
         definition hash, reasons for any rejection
```

Rules:

- Every element contributes once. A part with a fitting row is one element;
  the fitting supplies availability, the definition supplies mass and thrust.
- Rotation and `flipped` transform mount position, centroid and force axis
  together. A mirrored nozzle produces the mirrored force. This is the
  documented "mirroring/rotation transform both" rule, currently untested
  because no mirroring code exists.
- Missing definition, unknown revision or non-finite placement rejects the
  whole ship with a reason. No fallback to any fixture.
- Output is deterministic and hashed so the authority can store the hash and
  skip recompilation when inputs are unchanged.

### 6.3 Sim: hull proxy with centroid offset

Extend `RigidBody` with a lateral offset alongside the existing longitudinal
offset. Both are derived from the compiled centre of mass relative to the
authored frame origin. `stepSystemSpace` asserts the offsets match the mass
row exactly as it already asserts mass and inertia. Add the test the docs
call for: move cargo aft and port, verify the ship neither teleports nor
gains velocity, and that a passenger's local coordinates are unchanged.

Exit: compiler tests for a symmetric ship, a mirrored-nozzle ship, a ship
with one engine removed, cargo moved, a crew member walking, a definition
missing, and the Wayfarer v1 set reproducing the fixture's nine actuators at
their documented positions.

## 7. Phase 3: authority switch-over

Goal: the resolver returns compiled state, and the fixture is no longer on
any live path.

### 7.1 Tables

- `construction_flight_fitting` gains `definitionId` revision binding (it
  already has `definitionId`; add `definitionRevision`) and keeps
  `availability`. Mass, thrust and mount are not stored per row; they come
  from the definition catalog at the bound revision so a content update can
  never silently retune a ship.
- New private `construction_flight_compiled { shipId, revision,
  inputHash, massKg, centerX, centerY, inertiaKgM2, envelopeJson,
  actuatorsJson, hullJson, status, reason }`. One row per ship, rewritten only
  when the input hash changes.
- New private `construction_flight_dirty { shipId, revision }` written by
  any reducer that changes an input: refit, install, remove, damage, cargo
  transfer, crew boarding or leaving.

### 7.2 Compilation trigger

`stepSharedWorld` compiles dirty ships at the start of the tick, bounded to a
fixed count per tick with the rest carried forward, then simulates. Ships
whose compiled status is not `ready` are simulated as uncontrolled bodies
with zero actuators and their reason is visible to authorized crew through
the existing authored-flight view. This replaces the exactly-ten-fittings
gate and the fixture spread in the resolver.

### 7.3 Fail closed

- `stepSharedWorld` requires hooks; the optional parameter and the LAB
  fallback are removed.
- Only `status === "ready"` populates controls. Dormant definitions are
  excluded rather than relying solely on computer power.
- The legacy-stock branch is kept only behind the explicit legacy migration
  reducer and produces a compiled row from the Wayfarer v1 definition set,
  never the raw fixture.

### 7.4 Availability producers

- Refit remove or replace deletes or rewrites the fitting row and marks the
  ship dirty.
- The existing damage path (committed voxel or armor changes) writes
  `availability` in `[0, 1]` for affected actuators and marks dirty.
- Detached or unpowered devices set `availability` to 0 without deleting the
  row so mass is retained.

### 7.5 Migration

Non-destructive publish. Existing bound ships get a compiled row on first
tick from their existing fitting rows plus the Wayfarer v1 definitions.
Dead `ship.massKg`, `thrustN` and `turnAcceleration` columns remain in the
schema for binding compatibility this phase; phase 6 removes them from the
client projection.

Exit: isolated smoke proves no engine means coasting, a removed thruster
changes the compiled actuator list and mass, moved cargo shifts the centre
of mass without translation, a damaged nozzle produces less force, and an
invalid definition rejects flight with a visible reason. Two-client test of
a passenger walking while an asymmetric ship turns.

## 8. Phase 4: bounded resource gating

Goal: land the interfaces M4 will drive, with honest initial behaviour.

- Computer power comes from the power-fitting rows added on 2026-09-14, not
  the `powered: true` literal. No power fitting means no IFCS; the manual
  single-engine pulse remains future M4 work and is not started here.
- `compileFlightDefinition` accepts an optional supply map
  `{ actuatorId: fraction }` and multiplies availability by it. Until fuel
  networks exist the authority passes 1 for supplied ships; the hook and its
  tests exist so M4 does not reopen the compiler.
- Add a consumption hook after allocation returning per-actuator newton-
  seconds this tick, recorded in a private table for later fuel accounting.
  Nothing consumes fuel yet; the doc says so.

Exit: unpowered computer cuts actuation in smoke; supply fraction 0 on one
engine reproduces the removed-engine behaviour in unit tests.

## 9. Phase 5: presentation and telemetry

- `packages/render/src/flight-effects.ts` reads mounts from a per-ship
  actuator projection instead of `LAB_FLIGHT_ACTUATORS`. The projection
  exposes device ID, mount, exhaust direction and throttle for the pilot's
  own ship only. Exterior observers keep the existing motion-only view.
- `packages/content/src/voxel-wayfarer-shell.ts` mount literals are replaced
  by references to the Wayfarer v1 actuator definitions so visual nozzles and
  physical mounts cannot drift.
- `AuthoredFlightReview` shows compiled mass, centre of mass, envelope and
  rejection reason.

Exit: browser review of a forward burn shows no retro plume; a removed
thruster shows no plume; plume positions match the definition set.

## 10. Phase 6: dead code and duplicate removal

- Delete `integrate()` from `packages/sim/src/index.ts` and its test.
- Remove `massKg`, `thrustN`, `turnAcceleration` from the `ownShips`
  projection and generated bindings; drop the immutability guard in
  `wayfarer-refit-authority.ts`. Column removal from the base table waits for
  a scheduled destructive publish and is recorded, not performed, here.
- Collapse the two install writers (`construction-flight.ts` plus
  `construction-flight-authority.ts`, and `construction-flight-writer.ts`)
  into one.
- Remove `STARTER` thrust and mass constants.
- Retire `stepLabSpace` once no ship lacks a `shipWorldMotion` row; until
  then it uses the compiled definition like the shared path.
- Rewrite `docs/ifcs_integration.md` and `docs/ifcs_iteration.md` to describe
  implemented versus planned state after each phase, and remove the stale
  claim that the flight tables are unregistered.

## 11. Ordering, dependencies and estimate

| Phase | Depends on | Touches | Estimate |
| --- | --- | --- | --- |
| 0 Baseline | none | sim tests, scripts | 0.5 day |
| 1 Allocator/controller | 0 | sim | 2 days |
| 2 Definitions/compiler | 0 | content, sim | 2 days |
| 3 Authority switch | 1, 2 | world, smoke | 3 days |
| 4 Resource gating | 3 | sim, world | 1 day |
| 5 Presentation | 3 | render, client, content | 1 day |
| 6 Cleanup | 3, 5 | all | 1 day |

Phases 1 and 2 are independent and can run in parallel under the same owner.
Phase 3 is the only one that changes live behaviour for players and must run
its isolated smoke and a two-client check before publish.

## 12. Owner decisions needed before phase 2 and 3

1. **Wayfarer mass.** Should the v1 physical definition set be tuned to sum
   to the current 12,000 kg and slab inertia so flight feel is preserved, or
   should compiled mass be whatever the parts sum to, accepting a feel change?
   Recommendation: tune v1 to reproduce 12,000 kg within 1 percent so phase 3
   is a pure plumbing change, then retune deliberately later.
2. **Turn behaviour.** With centripetal feedforward and turn-rate limiting the
   ship holds speed in a turn. Without limiting it bleeds speed, which is
   physically honest but currently uncontrolled. Recommendation: limit turn
   rate by default and expose the raw behaviour as a profile flag.
3. **Effort penalty semantics.** The penalty weight expresses "fewest newtons"
   today. When fuel lands it could express fuel cost per newton per engine.
   Recommendation: keep it dimensionless now and document that M4 may replace
   it with per-actuator cost.
4. **Dead ship columns.** Removing them from the client projection changes
   generated bindings. Recommendation: remove in phase 6 and keep the base
   columns until the next scheduled destructive publish.

## 13. Risks

- Changing the allocator changes plume patterns players have seen. Phase 5
  is the fix; between phases 1 and 5 retro plumes will simply stop appearing
  during forward burns, which is the correct direction.
- Compilation per tick must stay bounded. The dirty table and input hash are
  the control; the phase 0 benchmark sets the per-tick compile budget.
- The centroid offset touches the contact solver. The cargo-move and
  passenger tests in phase 2 are mandatory before phase 3.
- Other sessions are editing the resolver's blueprint-hash matching. Phase 3
  rebases on whatever has landed rather than reverting it.
