# Implementation agent prompt — IFCS update

Work in `/root/sidereal_spacetime`.

/goal Implement the IFCS update specified in
`docs/handoffs/ifcs_update_plan_20260914.md`: phase 0 baseline, phase 1 pure
allocator and controller corrections, phase 2 physical definitions and the
flight-definition compiler, phase 3 authority switch-over, phase 4 bounded
resource gating, phase 5 presentation, phase 6 dead-code removal. Deliver each
phase's exit criteria in full before starting the next dependent phase. Stop
for the owner check-in before phase 3 publishes to the shared development
database. Do not stop at a proposal, a partial phase, or a fixture that still
feeds live flight.

Read `AGENTS.md`, `PIVOT.md`, the complete plan, `docs/ifcs_integration.md`,
`docs/ifcs_iteration.md` and `docs/handoffs/ship_construction_authority_plan.md`.
Inspect actual source before relying on any status claim in a document. The
plan's section 3 lists the current live path, the resolver, the fitting table
and the part placement schema you must reuse. Read these files completely
before editing anything: `packages/sim/src/ifcs.ts`, `ifcs.test.ts`,
`system-space.ts`, `collision.ts`, `construction-flight.ts`,
`packages/world/src/construction-flight-resolver.ts`,
`construction-flight-tables.ts`, `construction-flight-writer.ts`,
`construction-flight-authority.ts`, `shared-world-physics.ts`, `lab-flight.ts`,
`packages/content/src/flight.ts`, `packages/render/src/flight-effects.ts`.

You are the integration owner for this task under the Astra `authoritative_ifcs`
ownership in `docs/active_agent_ownership.md`. You may use subagents for
investigation and for independent pure-sim work in phases 1 and 2, which the
plan marks as parallel. Only you edit schema registration, generated bindings,
the resolver and the scheduled step. Keep at most two subagents active and
record each one's file ownership in the progress document before it starts.
Other sessions currently hold uncommitted edits to the resolver's blueprint-hash
matching and a new power-fittings projection; rebase on whatever they have
landed and never revert their work.

Decisions you must escalate to the owner rather than make are in the plan's
section 12. Until the owner answers, proceed with the plan's recommended
defaults and record that you did: tune the Wayfarer v1 definition set to
reproduce 12,000 kg and the slab inertia within 1 percent; limit turn rate so
speed holds in a turn, with the raw behaviour behind a profile flag; keep the
effort penalty dimensionless; leave dead ship base-table columns in place and
remove them only from the client projection. Also escalate any non-additive
schema change, any relaxation of an existing authority validator, and any
change to the live Wayfarer's collision revision or native pins.

The essential requirements are:

- Every element of a ship's mass contributes exactly once, from versioned
  physical definitions, not from any fixture constant on a live path.
- Actuator mount, force axis and thrust come from placed-part transform and
  definition. Rotation and mirroring transform mount and force together.
- The controller never requests more than the ship's derived envelope. The
  allocator meets a reachable request with the fewest newtons, produces the
  same answer regardless of actuator ID strings, and reports residual honestly.
- The hull rotates about the compiled centre of mass while the authored frame
  origin is preserved. Moving cargo shifts the centre and inertia without
  translating the ship or its passengers.
- Availability has real producers: refit removal, damage, detachment,
  unpowered state. A missing or invalid definition rejects flight with a
  visible reason and never falls back to a stock ship.
- Clients still send only throttle and turn setpoints. Station, admission,
  lease and computer checks at consumption stay exactly as strict as today.
- Plumes and the authored flight review read compiled state. A forward burn
  shows no retro plume.

Hard constraints from `AGENTS.md`: pure rules in `packages/sim`, content in
`packages/content`, server adapters in `packages/world`, GPU work in
`packages/render`; all spatial values f64 metres; planar simulation only; no
client-authored transforms or force; non-destructive module publish; never
start the old stack. Run `npm run check` and `npm run build` after every
phase, and isolated `npm run smoke` after phases 3, 4 and 6. Phase 5 requires
a real browser review of a forward burn, a turn and a removed thruster.

Record progress in `docs/handoffs/ifcs_update_progress_20260914.md`: phase
status, phase 0 baseline and benchmark numbers, the updated numbers after
phase 1, file ownership for any subagent, every owner question with your
proposed default, every deviation from the plan and why. Update
`docs/ifcs_integration.md` and `docs/ifcs_iteration.md` at the end of each
phase so they describe implemented versus planned state honestly.

Follow the Git Workflow section of `AGENTS.md`. Branch from the latest
upstream `main` as `ifcs-update`, one commit per phase with the phase and its
verified exit criteria in the message, push to `origin`, and open a pull
request with `gh` after phase 0. Update that pull request after every later
phase with summary, changes, testing performed and outstanding risks. Do not
publish the world module to the shared development database before the
phase 3 owner check-in. Never commit or push to `main` and never merge the
pull request; return its URL to the owner.

Definition of done: all six phases committed, all exit criteria in the plan
demonstrated with test output or browser evidence in the progress document,
the four owner decisions either answered or recorded with the default taken,
and no `LAB_FLIGHT_*` constant referenced from any live world or render path.
