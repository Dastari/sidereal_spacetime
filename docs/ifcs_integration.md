# Component-driven IFCS integration

Status: Pure controller/allocator and authoritative authored lab fixture implemented; modular installation/resource authority pending M2/M4
Last updated: 2026-09-08
Owners: Sidereal simulation and ship assembly

## Update plan

The 2026-09-11 audit and the phased plan to replace fixture mass/actuators with compiled definitions and to correct the allocator are in [the IFCS update plan](handoffs/ifcs_update_plan_20260914.md). Phase 0 characterization tests and the deterministic allocator benchmark are implemented; full phase 0 gates pass (1,925 tests, typecheck, docs and build). Behaviour corrections and the compiled live path remain planned. See [progress](handoffs/ifcs_update_progress_20260914.md).

## Preserved design and current status

IFCS was part of the original design: [DR-0034](../reference/sidereal/docs/decisions/dr-0034_fly_by_wire_thrust_allocation_and_gnc_stack.md) and the [allocation proposal](../reference/sidereal/docs/features/proposed/fly_by_wire_thrust_allocation_proposal.md) separate desired motion, flight control, actuator allocation, physics and presentation. The pivot retains that separation in TypeScript. It does not retain Avian-specific APIs or aggregate magic-engine behavior as the final target.

`packages/sim/src/ifcs.ts` now implements mass/center-of-mass/inertia compilation, mounted directional actuator forces and moment arms, a velocity/heading controller, bounded nonnegative thrust allocation and fixed-step integration of the achieved force/torque. Tests cover moving cargo, mount/nozzle direction, asymmetric damage, absent engines, saturation, stable solve order, heading wrap, braking and closed-loop convergence. The scheduled lab now uses this controller and allocator with authored installed engine/nozzle/computer definitions, active release braking and private achieved-output telemetry. See [the fixture implementation](ifcs_iteration.md) for exact controls, authority gating and provisional mass/resource limits. Full modular installation and resource authority remain pending.

## Pipeline and conventions

```text
authorized station / powered AI grant
           ↓
desired world velocity + heading / angular rate
           ↓
powered flight computer: feedback controller
           ↓
requested body force (X,Y) and torque
           ↓
available mounted actuators → bounded allocator
           ↓
resource / spool / damage actuation → achieved force and torque
           ↓
fixed-step server physics → authorized motion/effect projections
```

All physical arithmetic remains JavaScript number / f64. Local +Y is bow-forward. Positive orientation rotates +Y toward -X. The engine's unrotated **force** axis is +Y; its exhaust points -Y. Mirroring/rotation transform both mounting position and thrust direction. Nozzle clearance and compatible mount faces are assembly rules, not something the allocator can repair.

Every floor/structural tile, armor section, device, stored item, fuel mass and crew mass contributes once. An element supplies its own centroidal inertia; the compiler adds the parallel-axis term about the combined center of mass. Moving cargo shifts the center and inertia without creating mass. Physics integration is about the center of mass; the authority adapter must preserve the authored frame origin by its explicit centroid offset so cargo movement does not teleport the ship or its passengers.

For each thruster, force comes from its actual direction and available maximum newtons. Torque is `(mount - center of mass) × force`. The current solver uses a stable-ID ordered, fixed-budget projected coordinate descent over translation and torque together, with throttle constrained to `[0,1]`. It reports residual/unachievable force and torque. Zero actuators means zero actuation. A forward engine cannot supply reverse thrust; an off-center engine produces torque.

## Concrete live implementation order

1. M1: finish authenticated character/session binding and admitted crew/exterior visibility lanes. The currently owner-private lab is not shared MMO authority.
2. M2: persist installed part UUIDs, sockets, orientation, definition version, mass elements and actuator stats. Compile valid attachment/clearance and room topology. Replace fixture mass/engine fields with derived values. Keep live refit CAS/receipts atomic with all affected parts and contents.
3. M2: maintain a fixed-step flight state domain using this pure math. Station occupancy is revalidated at both request and consumption. Inputs contain setpoints, never mass, transforms or force. Schedules own motion; render smoothing never writes it. Add server/two-client tests for an asymmetric ship and a passenger walking while it turns.
4. M4: solve connected power/fuel networks and resource allocation. Installed tanks retain actual quantity; generator/battery/core consume power; engines burn fuel only from reachable supply. Clamp the available actuator envelope before solving and recheck actual resource consumption during actuation. Prevent each engine from independently spending the same tank capacity. Recompute residual after spool/gating so telemetry and plumes reflect achieved output.
5. M4: require a valid powered computer core for IFCS. Without it, a nearby authorized actor may request a bounded manual pulse on one supplied engine; this does not grant full-ship control. A powered AI module may grant explicit owner remote piloting/orders under the existing security rules. Owners and scripts do not bypass occupancy/capability checks.
6. M6: damage/voxel changes invalidate mass, actuator health, utility connectivity and compartments through committed state. Limits and failure reasons are visible to authorized crew. Exterior clients receive only permitted motion and observable effects, not interior fittings, exact fuel/cargo or control grants.

## Required tests before full modular/resource integration

No engine means coasting without thrust; no tanks means no stored fuel; disconnected/depleted supply prevents engine output; no powered core prevents IFCS. Thrust saturation must remain observable. Move cargo, destroy a thruster, detach an engine, change mount orientation and run out of fuel during a turn. Verify resource conservation, mass/inertia changes, achieved exhaust, revoked seat/AI grants, reconnect/restart and concurrent refit/damage. Test heading/velocity targets on underactuated layouts rather than only a symmetric starter craft. Benchmark the solver with representative actuator counts before choosing the production iteration/actuator budget.
