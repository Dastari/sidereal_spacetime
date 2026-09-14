# IFCS update progress — 2026-09-14

Integration owner: Astra `authoritative_ifcs`; branch `ifcs-update`.
Implementation contract: [plan](ifcs_update_plan_20260914.md).

## Phase status

| Phase | Status | Evidence / commit |
| --- | --- | --- |
| 0 Baseline | Complete: 6 baseline tests, 1,925 total tests and build pass | `output/ifcs-update/phase0-check.log`, `phase0-build.log` |
| 1 Allocator/controller | Not started | Depends on phase 0 exit |
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

`allocator_review`: read-only investigation of the phase 1 numerical algorithm;
no file edits until phase 0 passes and an explicit phase 1 assignment is sent.
Reserved eventual ownership: `packages/sim/src/ifcs.ts`, `ifcs.test.ts`,
`ifcs-baseline.test.ts`, `scripts/benchmark_ifcs_allocator.ts`. Must not edit
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
