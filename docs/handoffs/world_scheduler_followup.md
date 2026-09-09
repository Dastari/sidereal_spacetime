# Remaining world scheduler work

Status: source audit and one bounded corrective implementation, 2026-09-10.
Shared schema remains stable during the real-provider browser review. This is
not a load-test or frame-rate claim.

## Verified current state

| Audit concern | Current source and remaining work |
| --- | --- |
| Unkeyed projections | Corrected by earlier network pass. The installed SDK metadata regression checks actual row primary keys. |
| Character and atmosphere idle writes | Earlier pass suppresses unchanged character and gas writes. Native stair heartbeat regression also suppresses unchanged accepted pose. |
| Empty pressure/traversal clock writes | Already corrected; an empty subsystem creates no clock. |
| Installed but idle pressure clock | Corrected in this pass: sealed/equilibrated or stationary-vacuum installations commit no clock. See evidence below. |
| Bound instance document cap | Already enforced after UUID expansion by `packages/sim/src/construction-instance.ts`, exercised by the 262144-byte regression. The world spawn adapter persists that validated plan. |
| Door occupancy full scan | Already uses `constructionLocation.by_instance`; moving doors use `constructionDoor.by_moving`. Native pressure uses the instance index too. |
| Shared discovery | Private composite system/cell indices select candidates; server exact-distance checks authorize rows. Client nine-cell SQL only narrows already-authorized views. |
| Grant expiry | Uses indexed due expiry range; revoked rows leave the due range. |
| Session expiry | `auth.expireSessions` still scans every session each world step, including retired-identity checks. An expiry index alone does not cover retirement; retirement needs targeted invalidation or its own indexed path. |
| Active traversal stalls | Ladder controller still increments revision/lastTick and writes its state each step while persistently blocked, including geometry-change fallback. Empty traversal is already idle. Suppress only semantically identical state while retaining re-evaluation for obstruction removal and permission loss. |
| Combat | Scans aims/energy rows, but inactive aim and full/unchanged energy rows do not write. Recovery checkpoints are capped at 4 Hz. Further savings require active/due indices and measured population. |
| Global timer | One existing persisted interval row schedules 50000 microseconds. Editing the init constant does not alter an installed row. No timer migration was applied by this pass. |

## Pressure clock correction

`stepNativePressure` now persists its clock only when a hinge/gasket/status or gas
row actually changes. Immutable installation validation still runs; idle does not
bypass native model, seal or document checks. A completely idle sample has no
state transition to replay, so no clock write is needed. The next real change
consumes one fixed step regardless of idle wall time. After a changed sample,
duplicate, older and sub-50000-microsecond deliveries are held. Existing serialized
restart, gas conservation, door obstruction and ownership tests remain intact.

Tests count writes directly: 100 successive sealed-room samples with unequal
compartment charge produce zero gas, pose, hinge or clock writes; resuming after
a day advances the gasket by one step and writes one clock; a repeated/substep
callback cannot advance again. A fully opened vacuum room also becomes write-free
after settling. This removes 100 clock writes from that five-second fixture, not
a claimed production CPU or network saving. Geometry verification and finite gas
comparison still consume bounded read/compute work on each installed room.

Source changes are confined to `packages/world/src/construction-native-pressure.ts`
and its focused test file. No table, projection, generated binding, public endpoint
or installed schedule changed. Focused native pressure/atmosphere tests: 19 pass;
full TypeScript passes. Managed isolated authority acceptance is recorded after
its scheduled validation, rather than inferred from unit tests.

## Safe event scheduling sequence

1. Preserve global movement/contact tick ownership. Auth and construction grants
   remain rechecked when controls/actions are consumed, even with targeted expiry
   schedules. A delayed timer must never extend an expired permission.
2. Give each independently owned subsystem a private one-shot schedule row with
   stable target identity, due time and generation/revision guard. Cancellation,
   restart and duplicate delivery must be idempotent. Schedule the next fixed
   sample from the accepted delivery time; never catch up an unbounded backlog.
3. Keep moving hinges, active traversal and changing gas on bounded repeated
   one-shot samples while active. A door-open completion timestamp alone is not
   adequate: hinge sweeps and path obstructions must be checked throughout motion.
4. Do not stop a blocked traversal indefinitely without a wake mechanism.
   Character movement, permission changes, model changes and reservation release
   must trigger it, or a bounded active retry remains necessary. Likewise, gas
   topology/charge/door changes must wake a dormant pressure island.
5. Publish separate scheduled reducers only with explicit transaction boundaries.
   Door hinge, gasket acceptance, pressure topology replacement and that sample's
   gas accounting must remain one transaction. A traversal's final placement,
   deck location, reservation release and audit must remain one transaction.
6. Test rollback with actual isolated database transactions, stale callbacks,
   restart gaps, disconnected/revoked actors and concurrent independent islands.
   Measure rows and callbacks/bytes with multiple clients before capacity claims.

**Do not catch and continue around a subsystem that already mutated rows.** That
would permit its earlier writes to commit without later invariants. The current
global reducer is atomic: an exception rolls the whole call back. Safe fault
isolation means moving independent work to separate scheduled transactions or
computing and validating a pure plan before its atomic commit. Local catches
around read-only validation, used to choose a defined blocked/returning outcome,
are different from swallowing a partially applied mutation failure.

One-shot schema registration and generated-binding changes are intentionally
outside this stable-schema correction; the parent must sequence them after the
current shared-world release acceptance.

## Browser-discovered shared flight tail

The parent real-provider browser found velocities around `6.47e-50 m/s` and
angular velocity around `-2.46e-68 rad/s`: position was visually fixed but motion
samples continued changing. Initial-zero idle tests did not cover this. The
cause was authorized IFCS braking approaching zero asymptotically.

`packages/sim/src/system-space.ts` now finishes a zero-demand control component
at a terminal accuracy of `1e-6 m/s` linear speed and `1e-7 rad/s` angular speed,
only if the actual solved actuation is reducing that component. This is a tiny
terminal controller correction, not a global physics cutoff. Disabled computers,
unavailable control axes, drifting rocks and nonzero pilot demands retain their
motion. Shared contact impulses are never directly rounded or damped. The
remaining terminal impulse is therefore an explicitly bounded external control
approximation; pair momentum conservation still holds for unassisted collisions.

The stock-authority test accelerates and turns, brakes until all three rates
are exactly zero, and then proves 100 additional samples write no ship/body motion,
actuator output or system clock. Subsequent thrust resumes movement. Separate tests
cover unavailable thrust, disabled control, tiny drifting rocks, tiny nonzero pilot
inputs and unassisted collision momentum. The focused shared/contact suite has
25 passing tests. The combined `npm run check` passed 915 tests across 156 files,
plus TypeScript and document checks, before the final isolated discovery run.

The shared authority harness now checks new-character automatic admission,
cross-owner and unentered-principal denial, unchanged admission on re-entry,
server-enforced out-of-range revocation, and moving-to-rest behavior. Exact replay
of an explicit legacy migration receipt remains a separate pure/pre-upgrade-fixture
check; a new character's automatic admission operation ID is server-private and
must not be exposed just to make a test replay it.

Final isolated validation passed:

- Standard managed `pressure-idle` authority smoke passed.
- Fresh managed `sidereal-spacetime-dev-review-shared-idle-discovery-smoke`
  passed the updated shared harness, including two matching canonical rock samples,
  automatic new-character admission, private-base/cross-owner/unentered denial,
  greater-than-400-metre wildcard discovery revocation, movement then exact rest
  with an unchanged ship sample tick under continued idle intent, and reconnect
  with unchanged UUIDs/inventory. Summary: `.runtime/shared-world-smoke-summary.json`;
  detailed output: `.runtime/shared-idle-discovery-smoke.log`.
- Full aggregate `npm run build` passed world, generated bindings and separate
  client/dashboard builds (`.runtime/shared-idle-followup-build.log`). Existing
  large JavaScript chunk warnings remain. No normal database/public release was
  changed by this validation, and the parent's provider browser database was
  preserved.
