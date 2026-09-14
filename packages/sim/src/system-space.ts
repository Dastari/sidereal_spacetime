import { stepContacts, type RigidBody } from "./collision";
import { DT, type Intent } from "./index";
import {
  pilotDesiredMotion,
  deriveEnvelope,
  type FlightEnvelope,
  desiredWrench,
  actuatorWrench,
  solveFlight,
  type Actuator,
  type FlightProfile,
  type MassProperties,
} from "./ifcs";
import { validateSpacePoint } from "./spatial-cells";

/** Admission limits for this first single-system contact island. Never truncate a
 * crowded island: an omitted body could be struck without receiving an impulse. */
export const SYSTEM_SPACE_LIMITS = Object.freeze({
  bodies: 64,
  controls: 64,
  actuatorsPerControl: 256,
  totalActuators: 1024,
  substeps: 3,
});

/** Terminal accuracy of authorized IFCS braking, not passive space damping.
 * At most one micrometre/second and 0.1 microradian/second are removed, only
 * while the allocator is actually reducing that component toward zero demand.
 * Coasting bodies, rocks and unavailable control axes retain all their motion. */
export const SYSTEM_CONTROL_REST = Object.freeze({
  metresPerSecond: 1e-6,
  radiansPerSecond: 1e-7,
});
export interface SystemFlightControl {
  bodyId: string;
  /** Already validated occupancy/power/resource authority, rechecked this tick. */
  enabled: boolean;
  intent: Intent;
  mass: MassProperties;
  actuators: readonly Actuator[];
  /** Compiled availability envelope; derive once per tick for older callers. */
  envelope?: FlightEnvelope;
  profile: FlightProfile;
  maxForwardSpeed: number;
  maxReverseSpeed: number;
}
export interface SystemSpaceStep {
  bodies: readonly RigidBody[];
  changedBodyIds: string[];
  commands: { bodyId: string; actuators: { id: string; throttle: number }[] }[];
  /** Actual accepted force kicks, summed per actuator over this invocation. */
  consumption: SystemActuatorConsumption[];
  impacts: number;
  exhausted: boolean;
  reason?:
    "body-budget" | "actuator-budget" | "contact-budget" | "coordinate-bound";
  /** Whole 60Hz substeps completed, not wall-clock elapsed time. Never catch up. */
  completedSubsteps: number;
}
export interface SystemActuatorConsumption {
  bodyId: string;
  actuators: { id: string; newtonSeconds: number }[];
}
const compareIds = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function bodyValid(body: RigidBody): void {
  validateSpacePoint(body);
  if (
    !body.id ||
    body.id.length > 128 ||
    ![
      body.vx,
      body.vy,
      body.heading,
      body.omega,
      body.massKg,
      body.inertia,
      body.radius,
      body.halfLength,
      body.longitudinalOffset ?? 0,
      body.lateralOffset ?? 0,
      body.authoredMidpointX ?? 0,
      body.authoredMidpointY ?? 0,
    ].every(Number.isFinite) ||
    Math.min(body.massKg, body.inertia, body.radius) <= 0 ||
    body.halfLength < 0 ||
    Math.max(Math.abs(body.vx), Math.abs(body.vy)) > 1e6 ||
    Math.abs(body.omega) > 1e4 ||
    body.massKg > 1e18 ||
    body.inertia > 1e30 ||
    Math.max(
      body.radius,
      body.halfLength,
      Math.abs(body.longitudinalOffset ?? 0),
      Math.abs(body.lateralOffset ?? 0),
      Math.abs(body.authoredMidpointX ?? 0),
      Math.abs(body.authoredMidpointY ?? 0),
    ) > 1e6
  )
    throw new Error("Invalid bounded system body");
}
function motionChanged(a: RigidBody, b: RigidBody): boolean {
  return (
    a.x !== b.x ||
    a.y !== b.y ||
    a.vx !== b.vx ||
    a.vy !== b.vy ||
    a.heading !== b.heading ||
    a.omega !== b.omega
  );
}
/** Integrate an authoritative system/contact island once per 50ms world tick.
 * Reuses the IFCS allocator and conservative impulse solver. All bodies receive
 * each force kick before the common drift, independent of table enumeration.
 * Inputs remain immutable. Adapter supplies each body once (ships AND rocks),
 * persists only changedBodyIds, and records exhaustion instead of retrying time.
 *
 * Budget fallback retains all momentum/state; it does not zero velocities or
 * silently omit contacts. A solver exhaustion keeps its last safe state and
 * stops further force kicks. Capacity growth needs a proper island broadphase,
 * not calling this function with the same shared rocks once for every ship. */
export function stepSystemSpace(
  input: readonly RigidBody[],
  controls: readonly SystemFlightControl[] = [],
): SystemSpaceStep {
  const budgetResult = (
    reason: "body-budget" | "actuator-budget",
  ): SystemSpaceStep => ({
    bodies: input,
    changedBodyIds: [],
    commands: [],
    consumption: [],
    impacts: 0,
    exhausted: true,
    reason,
    completedSubsteps: 0,
  });
  if (
    input.length > SYSTEM_SPACE_LIMITS.bodies ||
    controls.length > SYSTEM_SPACE_LIMITS.controls
  )
    return budgetResult("body-budget");
  if (
    controls.some(
      (c) => c.actuators.length > SYSTEM_SPACE_LIMITS.actuatorsPerControl,
    ) ||
    controls.reduce((sum, c) => sum + c.actuators.length, 0) >
      SYSTEM_SPACE_LIMITS.totalActuators
  )
    return budgetResult("actuator-budget");
  const originals = new Map<string, RigidBody>();
  for (const body of input) {
    bodyValid(body);
    if (originals.has(body.id)) throw new Error("Duplicate system body ID");
    originals.set(body.id, body);
  }
  const controlMap = new Map<string, SystemFlightControl>();
  for (const control of controls) {
    const body = originals.get(control.bodyId);
    if (!body || controlMap.has(control.bodyId))
      throw new Error("Missing or duplicate controlled body");
    if (
      control.mass.massKg !== body.massKg ||
      control.mass.inertiaKgM2 !== body.inertia ||
      (body.lateralOffset ?? 0) !==
        (body.authoredMidpointX ?? 0) - control.mass.centerX ||
      (body.longitudinalOffset ?? 0) !==
        (body.authoredMidpointY ?? body.longitudinalOffset ?? 0) -
          control.mass.centerY
    )
      throw new Error("Flight/contact inertial properties differ");
    // Exercise existing validation even when disabled: malformed trusted content
    // must not become a latent failure only when a pilot sits down.
    pilotDesiredMotion(
      body,
      control.intent,
      control.maxForwardSpeed,
      control.maxReverseSpeed,
      control.profile.maxAngularSpeed,
    );
    desiredWrench(body, { vx: 0, vy: 0 }, control.mass, control.profile);
    if (
      !Number.isFinite(control.mass.centerX) ||
      !Number.isFinite(control.mass.centerY)
    )
      throw new Error("Invalid flight center of mass");
    const actuatorIds = new Set<string>();
    for (const actuator of control.actuators) {
      if (!actuator.id || actuatorIds.has(actuator.id))
        throw new Error("Duplicate or empty actuator ID");
      actuatorIds.add(actuator.id);
      actuatorWrench(actuator, control.mass);
    }
    controlMap.set(control.bodyId, {
      ...control,
      envelope:
        control.envelope ?? deriveEnvelope(control.actuators, control.mass),
    });
  }
  let bodies = input.map((body) => ({ ...body })).sort(compareIds);
  let impacts = 0,
    completedSubsteps = 0;
  let reason: SystemSpaceStep["reason"];
  let commandMap = new Map<string, { id: string; throttle: number }[]>();
  const consumption = new Map<string, Map<string, number>>();
  for (let step = 0; step < SYSTEM_SPACE_LIMITS.substeps; step++) {
    const beforeKick = bodies;
    const beforeCommands = new Map(commandMap);
    const attemptedConsumption = new Map<string, Map<string, number>>();
    const kicked = bodies.map((body) => {
      const control = controlMap.get(body.id);
      if (!control) return { ...body };
      const flight = solveFlight(
        body,
        pilotDesiredMotion(
          body,
          control.intent,
          control.maxForwardSpeed,
          control.maxReverseSpeed,
          control.profile.maxAngularSpeed,
          control.envelope,
          control.profile,
        ),
        control.mass,
        control.actuators,
        control.enabled,
        control.profile,
        control.envelope,
      );
      const achievedCommands = new Map(
        flight.commands.map((c) => [c.id, c.throttle]),
      );
      attemptedConsumption.set(body.id, new Map(control.actuators.map(a => [
        a.id, a.maxThrustN * a.availability * (achievedCommands.get(a.id) ?? 0) * DT,
      ])));
      commandMap.set(
        body.id,
        control.actuators
          .map((a) => ({
            id: a.id,
            throttle: achievedCommands.get(a.id) ?? 0,
          }))
          .sort(compareIds),
      );
      // Finish the controller's asymptotic braking tail at physical tolerances.
      // Require achieved reduction: an enabled computer without available thrust
      // cannot erase momentum. Never apply this to contact results or rocks.
      const zeroDemand =
        control.enabled &&
        control.intent.throttle === 0 &&
        control.intent.turn === 0;
      const priorSpeed = Math.hypot(body.vx, body.vy);
      const nextSpeed = Math.hypot(flight.motion.vx, flight.motion.vy);
      const stopLinear =
        zeroDemand &&
        nextSpeed < priorSpeed &&
        nextSpeed <= SYSTEM_CONTROL_REST.metresPerSecond;
      const stopAngular =
        zeroDemand &&
        Math.abs(flight.motion.omega) < Math.abs(body.omega) &&
        Math.abs(flight.motion.omega) <= SYSTEM_CONTROL_REST.radiansPerSecond;
      // integrateWrench also computes a tentative drift. Discard it: all actual
      // position/heading advancement belongs to the shared contact solver.
      return {
        ...body,
        vx: stopLinear ? 0 : flight.motion.vx,
        vy: stopLinear ? 0 : flight.motion.vy,
        omega: stopAngular ? 0 : flight.motion.omega,
      };
    });
    // Reject an out-of-domain drift atomically at this substep; never clamp away
    // momentum. World migration/admission must keep bodies away from domain edge.
    try {
      for (const body of kicked) {
        bodyValid(body);
        validateSpacePoint({
          x: body.x + body.vx * DT,
          y: body.y + body.vy * DT,
        });
      }
    } catch {
      bodies = beforeKick;
      commandMap = beforeCommands;
      reason = "coordinate-bound";
      break;
    }
    const result = stepContacts(kicked, DT);
    // Correction from an overlap can also move a body outside the admitted box.
    try {
      for (const body of result.bodies) bodyValid(body);
    } catch {
      bodies = beforeKick;
      commandMap = beforeCommands;
      reason = "coordinate-bound";
      break;
    }
    bodies = result.bodies;
    // Coordinate rollback discards the attempted kick. Contact exhaustion keeps
    // its accepted velocity kick, even if no complete drift substep is counted.
    for (const [bodyId, values] of attemptedConsumption) {
      let total = consumption.get(bodyId);
      if (!total) consumption.set(bodyId, total = new Map());
      for (const [id, value] of values) total.set(id, (total.get(id) ?? 0) + value);
    }
    impacts += result.impacts;
    if (result.exhausted) {
      reason = "contact-budget";
      break;
    }
    completedSubsteps++;
  }
  return {
    bodies,
    changedBodyIds: bodies
      .filter((body) => motionChanged(originals.get(body.id)!, body))
      .map((body) => body.id),
    commands: [...commandMap].map(([bodyId, actuators]) => ({
      bodyId,
      actuators,
    })),
    consumption: [...consumption].map(([bodyId, values]) => ({
      bodyId,
      actuators: [...values].map(([id, newtonSeconds]) => ({ id, newtonSeconds })).sort(compareIds),
    })).sort((a, b) => a.bodyId < b.bodyId ? -1 : a.bodyId > b.bodyId ? 1 : 0),
    impacts,
    exhausted: reason !== undefined,
    ...(reason ? { reason } : {}),
    completedSubsteps,
  };
}
