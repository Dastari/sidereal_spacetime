import { stepContacts, type RigidBody } from "../../sim/src/collision";
import { DT, type Motion, type Intent } from "../../sim/src/index";
import { pilotDesiredMotion, solveFlight } from "../../sim/src/ifcs";
import {
  LAB_FLIGHT_MASS,
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_COMPUTER,
  LAB_FLIGHT_PROFILE,
  LAB_FLIGHT_SPEED,
} from "../../content/src/flight";
import { LAB_HULL } from "../../content/src/space";
type Vessel = Motion & {
  id: string;
  massKg: number;
  thrustN: number;
  turnAcceleration: number;
};
type Rock = Motion & { id: string; massKg: number; radius: number };
export function stepLabSpace(
  ship: Vessel,
  rocks: readonly Rock[],
  intent: Intent,
  authorized = false,
) {
  const hull: RigidBody = {
    ...ship,
    ...LAB_HULL,
    massKg: LAB_FLIGHT_MASS.massKg,
    inertia: LAB_FLIGHT_MASS.inertiaKgM2,
  };
  let bodies = [
    hull,
    ...rocks.map((r) => ({
      ...r,
      halfLength: 0,
      inertia: 0.5 * r.massKg * r.radius ** 2,
    })),
  ];
  let impacts = 0,
    exhausted = false;
  let commands: { id: string; throttle: number }[] = [];
  for (let tick = 0; tick < 3; tick++) {
    const vessel = bodies.find((b) => b.id === ship.id)!;
    const flight = solveFlight(
      vessel,
      pilotDesiredMotion(
        vessel,
        intent,
        LAB_FLIGHT_SPEED.forward,
        LAB_FLIGHT_SPEED.reverse,
        LAB_FLIGHT_PROFILE.maxAngularSpeed,
      ),
      LAB_FLIGHT_MASS,
      LAB_FLIGHT_ACTUATORS,
      authorized &&
        LAB_FLIGHT_COMPUTER.installed &&
        LAB_FLIGHT_COMPUTER.powered,
      LAB_FLIGHT_PROFILE,
    );
    commands = flight.commands;
    const thrust = flight.motion;
    // Kick velocities once at 60 Hz; conservative contact stepping owns drift.
    vessel.vx = thrust.vx;
    vessel.vy = thrust.vy;
    vessel.omega = thrust.omega;
    const result = stepContacts(bodies, DT);
    bodies = result.bodies;
    impacts += result.impacts;
    exhausted ||= result.exhausted;
  }
  return {
    ship: bodies.find((b) => b.id === ship.id)!,
    rocks: bodies.filter((b) => b.id !== ship.id),
    impacts,
    exhausted,
    commands: LAB_FLIGHT_ACTUATORS.map((a) => ({
      id: a.id,
      throttle: commands.find((c) => c.id === a.id)?.throttle ?? 0,
    })),
  };
}
