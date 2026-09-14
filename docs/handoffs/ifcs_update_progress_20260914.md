# IFCS update progress — 2026-09-14

Integration owner: Astra `authoritative_ifcs`; branch `ifcs-update`.
Implementation contract: [plan](ifcs_update_plan_20260914.md).

## Phase status

| Phase | Status | Evidence / commit |
| --- | --- | --- |
| 0 Baseline | Complete: 6 baseline tests, 1,925 total tests and build pass | `output/ifcs-update/phase0-check.log`, `phase0-build.log` |
| 1 Allocator/controller | Complete: 1,951 tests, build and isolated smoke pass | `0307ace4` |
| 2 Definitions/compiler | Complete: 1,993 tests and build pass | `0de90fe8` |
| 3 Authority switch | Complete; owner-approved non-destructive shared publication succeeded | 2,048 full-check tests; 1,511 staged-source tests; build, smoke variants, additive migration and shared schema comparison pass |
| 4 Resource gating | Complete: 2,058 tests, build and isolated two-client smoke pass | phase4-check-final.log, phase4-build-final.log, phase4-smoke-r0002.log |
| 5 Presentation | Not started | Depends on phase 3; real browser evidence required |
| 6 Cleanup | Not started | Depends on phases 3 and 5 |

## Owner decisions

All four section 12 recommended defaults explicitly approved by the owner in this
session on 2026-09-14:

1. Tune Wayfarer v1 definition mass and slab inertia to the current 12,000 kg /
   636,480 kg·m² within 1%; retuning is separate work.
2. Limit turn rate to preserve speed by default; retain raw behaviour behind a
   profile flag.
3. Keep effort penalty dimensionless. Future M4 fuel costs are separate.
4. Remove dead mass/thrust/turn columns from the client projection in phase 6;
   preserve base-table columns until a separately scheduled destructive publish.

Any non-additive schema change, validator relaxation, collision revision/native
pin change requires escalation. The passenger admission and bounded fitting-set
changes were explicitly approved below. No non-additive schema or collision/native
pin change was made. Shared DB publication remains gated by the explicit phase 3
owner check-in.

## Source inspection and shared edits

Read AGENTS.md, PIVOT.md, complete IFCS plan and integration/iteration docs,
construction authority plan, active ownership, all thirteen required live/pure
source files, and the complete assembly placement schema before editing.
Source confirms both resolver branches use fixture inertial/actuator inputs,
exactly ten fitting rows are required, allocation is always 80 passes, and the
contact body only supports a longitudinal centroid offset. Existing resolver
blueprint qualification changes are preserved. Extensive unrelated uncommitted
work was present on `main`; switched to `ifcs-update` without discarding it.
Only owned files/hunks will be staged. No shared publication, native asset or
live data mutation has occurred.

## Phase 0 baseline

`npx vitest run packages/sim/src/ifcs-baseline.test.ts`: 6/6 pass.
All measurements are from the actual allocator/controller, not copied audit
numbers. Translation/torque residuals are below 1e-6 in these reachable cases.

| Request | Expended thrust |
| --- | ---: |
| Forward 18,000 N | 30,472.404595 N |
| Lateral 18,000 N | 21,326.066990 N |
| Torque 18,000 N·m | 5,494.622081 N |

Full throttle + full turn from 30 m/s, 480 × 1/60 s: 15.237297373 m/s.
One-radian heading capture, 900 steps: maximum overshoot 5.009942441°.
Off-axis mass test independently checks COM (1,1), inertia 50,120 kg·m² and a
side force at y=4 producing +6,000 N·m, catching the centerY moment-arm sign.

`npx tsx scripts/benchmark_ifcs_allocator.ts`: deterministic seed, eight random
layouts per size, 100 warmup solves, five batches of 200 solves. Node wall-clock
microseconds are host/JIT-sensitive, not server throughput promises. Current
production has no convergence exit: every call executes all 80 passes; the
benchmark reports that fact rather than inventing convergence counts.

| Actuators | Passes | Median µs/solve | Min–max batch µs |
| --- | ---: | ---: | ---: |
| 4 | 80 | 27.812 | 27.261–31.494 |
| 9 | 80 | 8.582 | 8.315–9.620 |
| 16 | 80 | 15.616 | 14.865–16.996 |
| 64 | 80 | 66.391 | 62.521–68.928 |
| 256 | 80 | 270.107 | 268.168–291.536 |

## Subagent ownership

`allocator_review`: phase 1 allocator/controller implementation now authorized
after phase 0 commit `c1f2eb4a`.
Reserved eventual ownership: `packages/sim/src/ifcs.ts`, `ifcs.test.ts`,
`ifcs-baseline.test.ts`, `scripts/benchmark_ifcs_allocator.ts`, and new pure numerical helper
`packages/sim/src/ifcs-allocation.ts` (bounded three-row minimum-newton solve). Must not edit
system-space/collision, authority, content, schema, generated bindings or docs.
Integration owner exclusively owns resolver, schema registration, generated
bindings and scheduled-step integration.

## Deviations and limitations

Phase 0 required no behaviour changes. Phase 0 convergence is reported honestly as
fixed-budget execution because existing production exposes no early exit; phase
1 will report measured passes from the corrected production solver.

Phase 0 exit verified: full `npm run build` passed. Initial full checks twice
passed 1,924 tests but timed out the unrelated planet-terrain 20-second test.
Running unchanged `npm run check` with process affinity limited to four CPUs
bounded Vitest concurrency: 329 files / 1,925 tests passed, typecheck passed,
88 document checks passed (`output/ifcs-update/phase0-check-bounded.log`). No
planet source/test changes or timeout relaxations were made. Future full gates
use the same bounded concurrency, separately from builds.

`physical_review`: read-only phase 2 content/compiler integration investigation.
Reserved eventual ownership: new `packages/content/src/physical-definitions.ts`
and tests, new `packages/sim/src/flight-definition.ts` and tests. No other edits;
root owns contact/frame offsets, resolver, schema, bindings and scheduled step.
Agent must map actual placed-part/native source and structural/cargo/crew mass
inputs, identify reusable definition bindings and compatibility needs. No code
writes yet, so phase 1 gates and commit remain isolated.

Phase 1 planned numerical deviation: a finite residual-plus-quadratic penalty
cannot preserve exact reachable wrenches or guarantee fewest newtons. Use
lexicographic attitude, translation residual, minimum actual expended newtons,
then dimensionless quadratic throttle balancing constrained to equivalent output.
Physical-column ordering removes ID-dependent budget effects; IDs remain stable
identities and command output order. Tests must prove these properties.

Phase 2 independent scratch implementation authorized for `physical_review` under
`/tmp/ifcs-phase2/`, mirroring its reserved files above. Repo copies wait until
phase 1 commit to keep gates and commit scope isolated. Source audit found r002
has 81 assembly + 51 floors + 169 native wall/roof contributions, and baked
asset handedness requires definition-local mount/force variants. No registered
ship voxel/armor damage producer exists: phase 3 must add a bounded committed
producer with existing authority/revision/operation checks, rather than claiming
that the test-only panel damage study supplies availability today.

Phase 3 schema preparation: installed SDK supports `.default()` and the existing
`shared-world-tables.ts` already uses an appended defaulted clock column.
[SpacetimeDB default-value contract](https://spacetimedb.com/docs/tables/default-values/)
permits appending a defaulted column during automatic migration. Proposed
`definitionRevision: t.u32().default(1)` must be last in the fitting schema,
rehearsed additively against an isolated populated database with deletion disabled.
This does not authorize base column removal or any shared publish.

## Phase 1 measurements and verification in progress

| Metric | Phase 0 | Phase 1 |
| --- | ---: | ---: |
| Forward 18,000 N expenditure | 30,472.404595 N | 18,000 N |
| Lateral 18,000 N expenditure | 21,326.066990 N | 18,000 N |
| Pure 18,000 N·m expenditure | 5,494.622081 N | 2,769.230769 N |
| Speed after eight-second full throttle/turn | 15.237297373 m/s | 30.001315416 m/s |
| Maximum transient speed error | Not characterized | 0.038634% |
| One-radian capture overshoot | 5.009942441° | 0° |

Derived fixture envelope: forward/reverse 3 m/s², left/right
2.666666666667 m/s², angular ±0.561525892408245 rad/s². Pure forward burn
uses each side main at 0.5526315789473684 and center main at
0.3157894736842105, all other engines zero. These are the unique quadratic
throttle minimum on the exact minimum-newton face, not an ID-ordered fill.

Post-correction benchmark (same seeded layouts as phase 0):

| Actuators | Actual pass range | Median µs/solve |
| --- | ---: | ---: |
| 4 | 3–8 | 30.319 |
| 9 | 4–13 | 48.016 |
| 16 | 3–28 | 81.217 |
| 64 | 3–5 | 242.558 |
| 256 | 4 | 2,006.960 |

All 40 layouts converged. Some small layouts are underactuated and correctly
retain nonzero residual; convergence is not a claim that their request was
reachable. Timing is more expensive than phase 0 because it now solves minimum
newtons and optimal-face effort, rather than stopping at any residual solution.
The 80-pass cap is shared by simplex, torque-null residual sweeps and balancing;
a simplex pass allows at most n pivots. Benchmark logs include actual passes,
convergence and force residuals. Typical throughput is not a worst-case guarantee.

Independent integration-owner oracle (`output/ifcs-update/phase1-independent-oracle.ts`
and `.log`) exhaustively enumerates bounded-polytope vertices for 30 seeded
reachable layouts of 4, 6 and 9 actuators. Maximum difference from the global
minimum expenditure is 7.276e-12 N.

Focused IFCS/baseline/unchanged shared-world suite: 36 tests pass. Root contact
and system-space suite: 26 tests pass, including heading canonicalization and
first/later-substep telemetry rollback.

Full gate initially found a real tiny angular drift regression after exact rest.
Corrected compensated wrench summation and relative simplex/effort tolerances;
added 1,500-step yaw-free braking and genuine 1e-18 N / 2e-18 N·m regressions.
No world rest test, authority condition or physical stop threshold was relaxed.
Two unrelated test timeouts also occurred (planet terrain 20s, construction
review origin 5s). The affinity-limited retry was stopped after reproducing the
latter timeout. Installed Vitest source supports `VITEST_MAX_WORKERS`; the final
retry uses `VITEST_MAX_WORKERS=1 npm run check` without pinning execution to one
busy CPU. Gates remain pending until that command and build/smoke pass.

`allocator_review` completed its phase 1 code ownership. Follow-up investigation
is read-only: map existing crew/cargo/refit/damage mutation sites and permission
boundaries for later dirty tracking. No phase 3 code may be edited by the agent.
Integration owner retains all world/schema/binding/scheduled-step ownership.

## Phase 1 completed gates

`VITEST_MAX_WORKERS=1 npm run check` passes: 331 files, 1,951 tests,
typecheck and 88 document checks (`output/ifcs-update/phase1-check-smoke-update.log`).
`npm run build` passes (`phase1-build.log`). Isolated
`npm run smoke -- --smoke-name ifcs-phase1 --fresh-smoke` passes against
`sidereal-spacetime-dev-ifcs-phase1-r0002-smoke` (`phase1-smoke-retry.log`).
The first isolated smoke correctly exposed its old omega > 0.1 expectation as
incompatible with the approved speed-preserving limit (0.088889 rad/s at 30 m/s).
The assertion now requires acceleration and yaw within the derived envelope;
all existing control, expiry, privacy and contact assertions remain intact.
Shared development state was not published or reset. Unrelated smoke edits are
excluded from this phase's commit.

## Additional owner questions awaiting answers

Source inspection found three integration decisions requiring explicit answers;
these were sent as asynchronous questions while independent phase 2 work proceeds.

- Passenger evidence: recommend explicit owner-issued passenger admission with
  expiry/revocation for boarding, walking and permitted interior views, preserving
  every pilot station/admission/lease/computer check. Current owner-only,
  one-character admission cannot demonstrate two distinct clients walking/piloting.
  Alternative: retain owner-only access and revise that exit criterion.
- Variable fittings: recommend replacing the power action's exactly-ten predicate
  with bounded unique actual definition-bound fitting validation, retaining owner,
  active binding, reactor, mapping, CAS and operation validators. This validator
  change is not authorized by the four section 12 defaults alone.
- Damage/removal: recommend bounded server-only damage event production and real
  validated refit removal/detachment transactions, exercised by isolated smoke;
  weapon hit detection would remain future work. Current combat produces weapon
  energy/shot telemetry but no hit damage; test-only panel damage is not a live
  producer. Alternative is expanding scope to real weapon hit detection now.

No approval-sensitive implementation for these questions has begun.

## Phase 2 integration ownership

`physical_review` resumes bounded pure compiler/content work, owning
`packages/sim/src/flight-definition.ts`, `flight-definition.test.ts`,
`packages/content/src/physical-definitions.ts`, `physical-definitions.test.ts`,
and new `packages/content/src/wayfarer-flight-definition.ts`. The concrete
Wayfarer source adapter is being extracted from the generic sim compiler to
keep authored catalog and JSON imports in content. Root owns flight-frame,
collision, broadphase and system-space COM integration. No world edits yet.

## Phase 2 implementation and evidence

Versioned physical catalog, generic bounded compiler and authored Wayfarer
adapter are integrated. Root added authored-origin/COM motion conversion and
lateral plus longitudinal capsule offsets. System-space validates compiled
midpoint offsets against mass. Contact and conservative broadphase use the
same displaced geometry, including circles displaced from COM. Tests sample
rotating hull bounds at ±1e9 m with lateral offsets ±8 m; offset contact,
angular impulse and frame/passenger invariants pass.

Focused compiler/content tests: 38 pass. Focused contact/frame/system tests:
37 pass (`output/ifcs-update/phase2-contact.log`); initial combined run: 75 tests
pass (`phase2-focused.log`). Full check and build pass.

Canonical empty r002 has 301 positive contributions (81 assembly, 51 floors,
126 native wall modules and 43 native roof modules). Compiled mass is
11999.999999999967 kg, inertia 636479.9999999965 kg·m², COM
[0.012567135782623, 0.915897698209490] m. Both owner-approved fixture targets
are reproduced to floating roundoff. This COM follows actual placements;
the target did not require a zero COM. Per-definition positive masses were
calibrated offline. There is no live target-minus-parts ballast, aggregate
fixture mass or fixture import in the compiler/catalog.

All nine canonical mounts, force axes, thrust and nozzle heights are tested
against the existing documented fixture. Mirrors and rotations apply together.
Removed parts drop mass and actuation; absent fittings retain hardware mass;
power loss, damage availability zero and detachment retain mass and cut force.
Physical IDs cannot alias across part/cargo/crew contributions. Payload joins
remain an authority responsibility for phase 3; fitting rows never add mass.
Cargo carrier adoption replaces the existing shell under its same identity,
then payload is added once; preserved fuel attachment shell is separate from
its actual liquid payload. Crew body definition is versioned at 80 kg.

Pure compiler rejects missing/unknown definitions, invalid fitting bindings,
invalid placements, duplicate physical identities and degenerate inertia with
reasons and no fallback. Hashes include all inputs and the versioned catalog,
independent of collection order. Work caps: 4096 parts/definitions, 256 fittings,
512 cargo roots, 256 crew. Hash-only dirty detection does not grant validation.

The concrete source adapter accepts actual instance documents for the three
already qualified variants r001/r002/r005. Native structural metadata is reused
only after exact restored semantic-source matching; unsupported structural
edits reject pending a newly qualified variant. This restriction preserves
existing native qualification, not a substitute stock assembly. No collision
revision or native pins changed. The pinned authored capsule midpoint remains
[0,1.125] m, radius 5.4 m and half-length 7.125 m. Only its COM offsets change.

Scratch compiler timing reported by physical_review: 100 warmed samples p50
2.013 ms, p95 2.870 ms, max 4.956 ms, first native preparation plus compile about
79 ms. This is Node characterization, not server performance certification.
The first preparation is cached source metadata; production dirty work must
still have a per-tick ship budget. No supply hook is included before phase 4.

The live resolver and render still use fixture inputs. The pure compiler and
frame functions are not claimed to be active world authority in this phase.

Phase 2 final gates: `VITEST_MAX_WORKERS=1 npm run check` passes 334 files /
1,993 tests, full typecheck and 88 document checks in `phase2-check.log`.
`npm run build` passes in `phase2-build.log`. Pure compiler/frame exit criteria
are complete; no phase 3 authority changes were included in this commit.

## Phase 3 independent implementation underway

Root added private compiled/dirty tables and appended fitting definitionRevision
with default 1. Additive character.by_ship and inventoryContainer.by_ship indexes
support bounded crew and abandoned-ground-inventory mass joins. No module publish
has occurred; populated migration rehearsal is pending. Existing fitting writers
now explicitly supply revision 1. Dead base columns and authority validators remain.

New construction-flight-compilation adapter passes three focused tests: at most
two compilations per tick, pending age survives repeated mutations, unchanged
hashes/rejections do not rewrite rows, and rejection clears actuators/computers
while retaining only the last valid inertia/hull. Initial invalid definitions
have no invented stock inertia and must remain unadmitted until corrected.

New construction-flight-input adapter passes three focused tests: versioned body
mass plus equipped/pocket inventory exactly once, disconnected crew mass retained,
accepted stair positions used, ground inventory retained after its prior owner
leaves, carrier shell replaced once with payload at actual placement, and missing
cargo bindings/unqualified structures rejected. Logs: phase3-compilation-focused.log
and phase3-input-focused.log. Storage/input typechecks pass before wiring.
These adapters are not yet scheduled or authoritative; dirty producers, resolver,
coasting integration, migration, views, smoke and two-client evidence remain.

Source snapshots for already-dirty shared files are retained under
/tmp/ifcs-phase3-before for hunk-selective staging. Existing resolver blueprint
matching and power-fitting projection work remain intact. Additional owner
questions above remain unanswered; no dependent validator relaxation or passenger
policy has been implemented.

## Additional owner approvals and Git workflow update

Owner explicitly approved all three additional questions: explicit passenger
admission with expiry/revocation, the bounded unique definition-bound fitting-set
validator, and bounded server-only damage events plus validated removal/detachment.
All pilot station, admission, lease and computer checks remain strict. Weapon hit
detection remains future combat work; clients cannot provide damage values.

The replacement AGENTS.md requires delivery through a GitHub PR. Applied
/root/.codex/skills/git-pr-rules/SKILL.md. `git fetch origin` failed because this
checkout has no configured remote; `gh pr list --author @me --state open` likewise
reports no Git remotes. Branch inspection shows only main and ifcs-update. Asked
the owner for the target GitHub repository URL; implementation continues. Existing
phase commits stay on the explicitly requested ifcs-update branch. No push,
merge, or shared database publication has occurred.

Queue scan tightened to an indexed oldest-first range, stopping after two rows;
compilation work no longer begins by materializing and sorting the whole queue.

Phase 3 follow-up investigation ownership: allocator_review is read-only (no file
edits), mapping the newly owner-approved passenger admission into game-ship-access,
construction walking/views and boarding/return relations. Root retains all edits,
including schemas, resolver, bindings, schedule, passenger and mutation adapters.

### Phase 3 authority implementation and approved passenger work

The resolver now requires current compiled physical state and bounded actual
fittings. Missing/invalid bindings have no fixture fallback. A rejected update
retains only previously valid inertia/hull for coasting and clears actuation;
an initial invalid definition cannot invent inertia. The scheduled shared step
compiles at most two oldest dirty ships, converts between authored and COM frames,
and retains all station, admission, lease and computer consumption checks. An
initial invalid body rejects the island and clears old telemetry for that sample.
The legacy scheduled fixture flight path is disabled; saved legacy rows remain
for explicit validated migration. The dead lab helper remains for phase 6 removal.

Dirty markers are wired into validated crew placement, inventory movement,
carrier movement, refit, power and fitting mutations. This coverage still needs
its final audit. Additive compiled physics and actuator views exist, including
owner-visible rejection reasons, but generated bindings and presentation are
pending. Explicit installation compiles before admitting a ship; the scheduled
queue handles subsequent mutations. No shared database publication occurred.

Owner-approved fitting removal retains the fitting UUID as a tombstone and
removes its mass/actuation in compilation. Detachment retains mass with zero
availability. Server-only queued damage is bounded to eight events per tick,
rechecks fitting revision, records replay receipts and marks dirty state. Its
replay serialization is independent of database field order; invalid existing
availability is rejected. This is an event producer API, not weapon hit detection.
The isolated smoke must still exercise actual server event production/consumption.
The power action now validates a bounded unique set of actual definition-bound
fittings while preserving owner/active/reactor/mapping/revision/operation checks.

Passenger admission uses separate pure rules and private grant/visit/receipt
rows. It does not broaden ownedGameShipAccess or hasAcceptedAuthoredFlight.
Owner issues an expiring invitation; the grantee explicitly consents to board.
Walking and approved interior views use current passenger membership, while
object use, inventory, refit, power and pilot checks retain their existing guards.
Interior projections omit account identities and private physical ratings.

Routine passenger policy choices taken for the approved feature: invitations
last 1–3600 seconds; at most eight per ship, 256 globally and 128 active visits.
Boarding requires ships within 50 m, in the same system, moving no faster than
0.01 m/s and 0.001 rad/s. Entry is selected server-side from at most 25 supported,
unoccupied positions around the authored spawn. The grant explicitly permits
ship-wide interior geometry and walking only on the admitted entry deck; it
adds no stair/object interaction grant. Return restores the recorded local visit
on the still-owned, currently validated original ship, preserving its current
world motion and all inventory UUIDs. Location/admission counters increase.
Revocation/expiry denies access immediately; an obstructed return retains the
body and a private recovery reason, with at most eight retries per tick. These
are implementation defaults for the approved admission, not additional pilot
or structural permissions. No collision revision/native pins were changed.

Focused evidence: phase3-passenger-guard-focused.log passes 19 tests (14 pure
membership tests, five fitting/damage tests). phase3-passenger-wiring-focused.log
passes five files / 42 tests including seven passenger transaction/projection
tests and existing walking, interaction, spatial view and shared physics tests.
Passenger transaction tests use mocked collision/compilation boundaries; real
native support, compiled two-client mass and browser evidence remain required.
Latest world typecheck passed before disabling the legacy fixture schedule; it
is being rerun. Full phase 3 check/build, populated additive migration rehearsal,
isolated smoke, two-client evidence, generated bindings and owner publication
check-in remain outstanding. Phase 3 is not exit-ready and has no commit yet.

Phase 3 follow-up investigation ownership: allocator_review is read-only,
investigating the installed render-resource budget failure from the first broad
phase 3 check. No render/art edits are delegated. Root is correcting compilation
indexes/table behavior in older authority test doubles and owns all integration.

First broad phase 3 check: typecheck passed; 343 test files ran, with 11 failing
files / 52 failed and 1,986 passed tests. Identified authority failures were old
test doubles missing physical table/index/timestamp support; follow-up groups
now pass 28, 25 and 31 tests respectively. Full check must be rerun after fixes.
The independent installed render budget failed at 1,376 meshes (limit 1,360).
Read-only investigation isolated 20 unused hidden floor-kit prototypes. Root
extended the existing post-load cleanup to unused leaf meshes in all libraries,
preserving selected prototypes, parents, materials and surfaces. Existing render
budget tests now pass. This small unrelated cleanup is needed for the required
full gate; no budget, geometry, native pin or collision revision was changed.

Phase 3 intermediate build passed (world, generated bindings, both apps).
Added compiled asymmetric world-adapter tests: 11 pass in
phase3-asymmetric-adapter-focused.log, including engine-less COM coasting,
cargo recompilation without authored-frame/passenger translation and initial
invalid definition clearing stale burn telemetry.

Fresh isolated smoke r0001 published only to
sidereal-spacetime-dev-ifcs-phase3-r0001-smoke and failed during pilot entry.
Server logs show the operational-flight gate rejecting a pending compilation
from the immediately preceding final walking step. The fix compiles one pending
ship during explicit pilot entry, after current actor/deck access checks, before
the unchanged powered-computer and input-lease gates. Scheduled/recovery readers
do not opt into this synchronous path and retain their two-ship tick budget.
This is an explicit-admission compilation adjustment, not a validator relaxation.
A fresh r0002 smoke is running; no shared development database was published.

Second broad phase 3 check passes: 344 files / 2,045 tests, typecheck and 88
project document checks (phase3-check-retry.log). This precedes the latest
recording-time compilation adjustment and requires a final rerun for exit.
Standard fresh isolated smoke r0004 passes in phase3-smoke-r0004.log. The r0003
attempt reached expiry but its old test compared authored-origin velocities;
with off-origin COM those velocities change during rotation without thrust.
The smoke now verifies conserved COM velocity and zero output, using actual
compiled physics/envelope rather than fixture ratings. r0002 was reserved but
not published because a new test's TypeScript return annotation failed; fixed.

Real two-client passenger smoke is added in scripts/ifcs-passenger-smoke.ts.
Its first run exercised actual admission, privacy and removal, then exposed the
same dirty-mass timing issue when recording fresh pilot setpoints while another
passenger walks. Recording now uses the unchanged complete pilot validator with
one bounded pending physical refresh after current station/actor/deck checks.
Consumption still rechecks all permissions and uses scheduled compilation only.
This is a documented scheduling deviation: explicit entry/recording may compile
one authorized ship in addition to the scheduled queue's two-ship budget. It
avoids treating a crew mass update as a spurious computer-power loss without
relaxing any authority predicate. Final benchmark/smoke evidence is pending.

Real fresh two-client passenger smoke passes on
sidereal-spacetime-dev-ifcs-passenger-r0001-smoke (phase3-passenger-fresh-smoke.log):
initial captain ship mass 12,089.7 kg; boarded mass 12,179.4 kg; removed side
engine mass 203.9170431847797 kg. It proves actual passenger walking while the
asymmetric ship turns, denied passenger piloting/private fitting telemetry,
bounded power changes after removal, zero-powered-engine COM coasting despite
fresh pilot input, and revocation/return preserving inventory UUIDs. The earlier
retry on an already occupied fixture correctly rejected distant berths; the new
managed `npm run smoke -- --smoke-name LABEL --fresh-smoke --ifcs-passenger`
variant reserves its own first two nearby berths without resets. A second run
adds actual ground-to-carried cargo transfer and authored-frame invariance.

Populated migration rehearsal updated the phase 1 isolated database
sidereal-spacetime-dev-ifcs-phase1-r0002-smoke with --delete-data=never.
Complete before/after ship IDs, item IDs and fitting rows compare unchanged
(order-insensitive). All ten existing ships compiled ready; every existing
fitting gained definitionRevision=1. Evidence: phase3-populated-migration.log
and phase3-migration-*.txt. SDK reports that additive row layout changes require
client disconnection/reload; no non-additive table change or data deletion was
performed. Shared publication still requires the owner's phase 3 check-in.

### Phase 3 final isolated evidence

The extended passenger/cargo smoke passes in phase3-passenger-cargo-smoke.log
on sidereal-spacetime-dev-ifcs-passenger-r0002-smoke. Actual ground-to-carried
inventory transfer shifts COM without changing ship/actor poses, conserves mass,
and the earlier removal/turning/walking/power/revocation proofs still pass.

The fixed server event/definition smoke passes on
sidereal-spacetime-dev-ifcs-definition-r0003-smoke. Actual derived forward
acceleration changed 2.9777413831608843 → 2.398736114212934 m/s² after the real
server-only damage producer and scheduled consumption. Measured COM acceleration
was 2.9777413831608865 → 2.3987361142129338 m/s². Detachment further reduced force
without removing mass. Invalid definition revision produced an owner-visible
flight-fitting-definition-mismatch reason and retained last valid inertia for
uncontrolled coasting with no actuator output. The test trigger is a copied
isolated module generated under .runtime, never an export of packages/world.
It supplies a fixed server event (no client damage values) and one deliberate
invalid-definition corruption solely for failure testing. Weapon hit detection
remains future work. The managed variant is `npm run smoke -- --smoke-name LABEL
--fresh-smoke --ifcs-definition`.

Definition smoke r0001 used an invalid elapsed-time measurement: resting ship
motion ticks do not advance while its pilot walks, so the measured burn interval
included prior idle time. It now starts on the first accepted powered sample.
r0002 caught an inventory-adapter call missing its density argument; fixed, and
the isolated-copy publisher now typechecks production before copying/building.
Both failures and corrected evidence are retained in the phase3-definition logs.

Final mass-source audit added explicit inventory-unit and liquid-density physical
v1 definitions to the catalog. Existing inventory metadata supplies storage rules;
flight unit mass comes from the bound physical revision. A regression test mutates
unrelated inventory mass metadata and verifies flight mass/hash remain unchanged.
This completes the authority mass join rather than relying on an implicitly
versioned inventory constant. Existing accepted values and Wayfarer calibration
are unchanged. The final catalog is exercised by definition smoke r0003.

Phase 3 final check passes 344 files / 2,046 tests, full typecheck and 88 document
checks (phase3-check-final.log). All 100 preexisting fittings in the populated
migration acquired revision 1; captured rows and ship/item UUIDs were unchanged.
Final production build/generation passed (phase3-build-final.log). Shared
publication remains gated. No phase 4 work has started.

Owner supplied https://github.com/dastari/sidereal_spacetime and authorized public
repository creation. Created the public repository, configured origin, fetched
and verified no existing branches or PRs. Publishing a review baseline branch
from the original commit avoids pushing main; no merge is authorized.

`allocator_review` is assigned a read-only phase 3 commit dependency audit:
compare committed compiler imports with preexisting untracked source dependencies
and report the smallest required integration set. Owns no edits. Root retains
exclusive schema, resolver, generated bindings and scheduled-step ownership.


### Phase 3 commit dependency audit

The independent staged-source check exposed a phase 2 delivery gap: the compiler
used existing uncommitted r002/r005 definition/qualification sources. Phase 3
includes their exact existing source data, V2 layout contracts/qualification
implementation and required package exports. It does not register the unrelated
replacement/rebuild reducers or change onboarding selection. This is a dependency
closure, not new approval of a native revision; live collision/native pins remain
unchanged. The two baseline render imports debug-collision-geometry and
scene-material-registration also lacked committed implementations and are included.
Unrelated art, dashboard, replacement and other working changes remain unstaged.

A separate source tree is exported from the actual Git index under
/tmp/ifcs-phase3-review, with workspace package resolution pointing to that tree.
Installed dependencies and existing assets are reused. The first check exposed
missing exports and these source dependencies; after correction, TypeScript
passes and the complete staged-source test suite is running. This is additional
verification beyond the shared-workspace 2,046-test/build and isolated smoke gates.


Repository publication: public https://github.com/Dastari/sidereal_spacetime,
draft PR https://github.com/Dastari/sidereal_spacetime/pull/1. Owner subsequently
explicitly requested pushing existing main for other agents: pushed unchanged
599d2c7a as main, made it default, and retargeted PR #1 to main. No merge.

The separate source export now uses all committed files and exact locally cached
Git LFS asset objects, not other sessions' modified art. The staged build passed.
The first complete staged test run passed 1,483 tests and exposed five passenger
tests needing the preexisting qualified r002 admission matcher and standing
support integration. Those exact existing rules are now included; pilot, lease,
computer and command consumption checks are not weakened. An updated full staged
check is running. Earlier incomplete source/asset export test attempts are retained
as diagnostic evidence, not counted as successful verification.


Independent staged-source verification: 277 test files / 1,488 tests pass,
TypeScript passes, and the full staged build/generation passes
(phase3-index-check-r4.log, phase3-index-build-final.log). The staged full check
then fails the preexisting documentation link inventory: 33 missing references
from the original tracked README/AGENTS/PIVOT/project docs point to unrelated
uncommitted documents/art-library material. These are not copied into the IFCS
commit as incidental publication. The shared-workspace full check already passed
2,046 tests and all 88 document/provenance checks; both results are recorded rather
than presenting the independent checkout's documentation gate as passing.

A final standard smoke is running against the independently staged module on
sidereal-spacetime-dev-ifcs-index-r0001-smoke. This retains the original committed
onboarding choice and excludes other sessions' replacement/rebuild reducers.
The r002 two-client/cargo and server damage proofs above exercise the shared
workspace implementation with its existing qualification work preserved.


Read-only shared schema inspection changed the staging decision: the shared DB
already exposes refitRebuiltWayfarer, replaceLegacyPlayerWayfarer and
ownWayfarerRebuildOffer. Excluding those existing APIs would remove them during
publication. No such publication is performed or proposed. The integration must
preserve their existing implementation and dependency set. `allocator_review`
continues its read-only dependency audit for those three already-live APIs and
the existing ground-item projection; owns no edits. This supersedes the earlier
intent to exclude those APIs and is required to avoid reverting other sessions.


Preservation is now verified against actual shared schema metadata:
- No removed tables, reducers or views; no changed existing reducer parameters or
  view result fields (resolved types compared, not unstable type indices).
- Six new private tables, five new reducers and six new authorized views.
- The only existing table row change is the appended fitting definition revision
  with default 1; existing indexes remain with additive lookup indexes.
Evidence: phase3-preserved-schema-comparison.txt and captured describe JSON.

The already-deployed replacement transaction now removes the replaced ship's
compiled/dirty/damage/invitation rows and rejects an outstanding passenger return.
It retains audit receipts and never follows a grantee into another ship's state.
New tests cover these boundaries. Its existing operator restriction remains.
The existing rollback mock needed to instantiate the new passenger table before
its snapshot; focused replacement tests pass 13/13 after that fixture correction.

Standard smoke also passes for the compatibility-preserving staged module on
sidereal-spacetime-dev-ifcs-index-r0002-smoke (phase3-index-smoke-preserved-apis.log).
The prior r0001 staged smoke passed the original committed onboarding path too.
The existing native smoke navigation branches are included with current onboarding.
Existing roof-export validation tests remain in their owner's uncommitted work
because they require that owner's separately published art; they were not copied
as part of the IFCS source dependency closure. The shared full suite still runs
those existing tests against the available assets.


### Phase 3 exit and required owner check-in

Final shared-workspace `VITEST_MAX_WORKERS=1 npm run check`: **345 files / 2,048
tests pass**, TypeScript passes, 88 document/provenance checks pass
(phase3-check-complete.log). Independently staged source: **279 files / 1,511 tests
pass** (phase3-index-tests-complete.log), full `npm run build` passes
(phase3-index-build-preserved-apis.log), and the compatibility-preserving standard
`npm run smoke` passes on ifcs-index-r0002. Earlier two-client passenger/cargo,
fixed server damage/invalid-definition and populated additive migration proofs
complete the phase 3 exit criteria. The separate export's preexisting missing-doc
limitation is recorded above and remains a draft PR risk.

Reviewed module artifact: output/ifcs-update/phase3-world.bundle.js
SHA-256: c322bd12c6df071e8d06e74831addea2e3ccb484e1da436ed21a73226ec8f116.
The staged source export is /tmp/ifcs-phase3-review. Publication must use this
reviewed phase source (or a newly verified rebase preserving the existing APIs),
not an incidental build of other sessions' changing worktree. Non-destructive
shared publication is pending the explicit owner check-in required by the plan.
No shared module publication or replacement/refit maintenance operation was run.
Phases 4–6 remain unstarted. The owner-approved defaults and all three additional
authority decisions are implemented as recorded.


Owner explicitly approved the non-destructive phase 3 shared publication after
reviewing commit cd09510c / PR #1. Approval persists; no further confirmation is
required for this publication. The reviewed world/sim/content source matches that
commit byte for byte, artifact hash matches, and the shared schema is unchanged
from the reviewed additive comparison. Publishing from the isolated source export.


Approved phase 3 publication succeeded to sidereal-spacetime-dev from the reviewed
source export, with delete-data=never. The SDK required client reconnection for
the additive fitting row layout. Both existing live ships compiled ready with
empty reasons, masses 12089.699999999948 and 12089.699999999952 kg. Captured ship
and inventory item UUID sets are unchanged. Evidence: phase3-approved-shared-
publish.log, phase3-shared-*-before/after.txt, phase3-shared-compiled-after.txt.

Phase 4 now starts. `allocator_review` owns a read-only investigation of accurate
per-actuator newton-second accounting across the actual system-space substeps and
rollback paths. No file edits delegated; root owns all phase 4 changes.


### Phase 4 resource interfaces and isolated evidence

Computer power uses a separate additive validated circuit command, retaining the
engine command's owner, active instance, reactor, exact definition and mapping,
revision and operation guards. The first fresh smoke (ifcs-phase4-r0001) exposed a
new-command mapping error: the computer device ID is computer-flight-01, while its
authored placed console maps from equipment-control-console. Corrected that exact
mapping, with a regression proving the device ID cannot replace the console source.
No existing engine or pilot validator was relaxed.

Fresh isolated `npm run smoke -- --smoke-name ifcs-phase4 --fresh-smoke
--ifcs-passenger` passed on ifcs-phase4-r0002 (phase4-smoke-r0002.log). It proves
computer power off cuts all output, fresh pilot input rejects, COM velocity and
omega remain constant while coasting, and restored power permits fresh intent.
Existing two-client walking during asymmetric turning, removed hardware, cargo COM,
remaining-engine power and passenger revocation/inventory identity checks also pass.

Optional compiler supply is bounded, finite [0,1], actuator-ID-only and included
in the input hash. Zero supply retains installed mass but removes wrench/envelope
contribution; fractional supply multiplies damage availability. Authority explicitly
passes 1 for actuators until M4 supplies actual network facts.

The pure step reports actual per-actuator N·s over each accepted force kick, not
last throttle multiplied by elapsed wall time or completedSubsteps. Coordinate
rollback discards the attempted usage; contact exhaustion retains accepted kicks.
Tests compare changing per-substep thrust with momentum, exercise partial rollback,
and ensure positive usage advances the system sample even with no motion/output
row change. Latest nonzero usage per ship is stamped with tick, compiled revision
and input hash in private construction_flight_consumption. Idle samples preserve
the last burn stamp; exact replay is quiet and conflicting/regressed samples reject.
No fuel or electrical energy is deducted. Operator replacement clears this table.

Real scheduled-step output is captured in phase4-consumption-sql.txt (eight actual
remaining actuators, with positive and zero values). phase4-schema.json confirms
Private table access, with no consumption view. The allocator_review investigation
was read-only and its accepted-kick/clock findings are covered by root's tests.

Phase 4 final exit: `VITEST_MAX_WORKERS=1 npm run check` passes **346 files /
2,058 tests**, TypeScript and all 88 document/provenance checks. `npm run build`
passes (phase4-check-final.log, phase4-build-final.log). Fresh isolated two-client
smoke passes as above. Repeated operator SQL after idling is byte-identical
(phase4-consumption-idle-sql.txt). No phase 4 shared publication occurred. Phase 4
contains one additive private table and one additive reducer; no non-additive
schema change, authority relaxation, collision revision or native-pin change.
