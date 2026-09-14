# IFCS update progress — 2026-09-14

Integration owner: Astra `authoritative_ifcs`; branch `ifcs-update`.
Implementation contract: [plan](ifcs_update_plan_20260914.md).

## Phase status

| Phase | Status | Evidence / commit |
| --- | --- | --- |
| 0 Baseline | Complete: 6 baseline tests, 1,925 total tests and build pass | `output/ifcs-update/phase0-check.log`, `phase0-build.log` |
| 1 Allocator/controller | Complete: 1,951 tests, build and isolated smoke pass | Logs below; phase commit follows |
| 2 Definitions/compiler | Not started | Depends on phase 0 exit |
| 3 Authority switch | Not started | Requires phases 1–2; owner check-in before shared DB publish |
| 4 Resource gating | Not started | Depends on phase 3 |
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
pin change requires escalation. No such change authorized or made. Shared DB
publication remains gated by the explicit phase 3 owner check-in.

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
