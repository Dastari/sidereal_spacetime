import { DT, type Motion, type Intent } from "./index";

export type MassElement = {
  id: string;
  massKg: number;
  x: number;
  y: number;
  inertiaKgM2: number;
};
export type MassProperties = {
  massKg: number;
  centerX: number;
  centerY: number;
  inertiaKgM2: number;
};
export type Actuator = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  maxThrustN: number;
  availability: number;
};
export type Wrench = { fx: number; fy: number; torque: number };
export type DesiredMotion = {
  vx: number;
  vy: number;
  heading?: number;
  angularVelocity?: number;
};
export type FlightProfile = {
  velocityGain: number;
  headingGain: number;
  angularGain: number;
  maxAcceleration: number;
  maxAngularAcceleration: number;
  maxAngularSpeed: number;
};
export const STANDARD_FLIGHT: FlightProfile = {
  velocityGain: 1.5,
  headingGain: 2,
  angularGain: 4,
  maxAcceleration: 4,
  maxAngularAcceleration: 1,
  maxAngularSpeed: 1,
};
const finite = (values: number[]) => {
  if (!values.every(Number.isFinite))
    throw new Error("Non-finite flight state");
};
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
function unique<T extends { id: string }>(rows: readonly T[]): T[] {
  if (
    new Set(rows.map((r) => r.id)).size !== rows.length ||
    rows.some((r) => !r.id)
  )
    throw new Error("Duplicate or empty physical part ID");
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Include every installed part AND all actual contents/crew/fuel exactly once.
 * Inertia is about each element's own centroid; parallel-axis terms are added here. */
export function compileMass(elements: readonly MassElement[]): MassProperties {
  const parts = unique(elements);
  let massKg = 0,
    mx = 0,
    my = 0;
  for (const p of parts) {
    finite([p.massKg, p.x, p.y, p.inertiaKgM2]);
    if (p.massKg < 0 || p.inertiaKgM2 < 0)
      throw new Error("Negative mass/inertia");
    massKg += p.massKg;
    mx += p.massKg * p.x;
    my += p.massKg * p.y;
  }
  if (massKg <= 0) throw new Error("An assembly needs positive mass");
  const centerX = mx / massKg,
    centerY = my / massKg;
  const inertiaKgM2 = parts.reduce(
    (total, p) =>
      total +
      p.inertiaKgM2 +
      p.massKg * ((p.x - centerX) ** 2 + (p.y - centerY) ** 2),
    0,
  );
  finite([massKg, centerX, centerY, inertiaKgM2]);
  return { massKg, centerX, centerY, inertiaKgM2 };
}

/** +Y is the unrotated thrust direction; exhaust points -Y. Rotation and mirroring
 * must transform both mount and force axis in the assembly compiler. */
export function actuatorWrench(a: Actuator, mass: MassProperties): Wrench {
  finite([
    a.x,
    a.y,
    a.rotation,
    a.maxThrustN,
    a.availability,
    mass.centerX,
    mass.centerY,
  ]);
  if (a.maxThrustN < 0 || a.availability < 0 || a.availability > 1)
    throw new Error("Invalid actuator envelope");
  const force = a.maxThrustN * a.availability,
    fx = -Math.sin(a.rotation) * force,
    fy = Math.cos(a.rotation) * force;
  return {
    fx,
    fy,
    torque: (a.x - mass.centerX) * fy - (a.y - mass.centerY) * fx,
  };
}

/** Guidance requests motion; the flight computer requests force/torque, never velocity writes. */
export function desiredWrench(
  state: Motion,
  desired: DesiredMotion,
  mass: MassProperties,
  profile: FlightProfile = STANDARD_FLIGHT,
): Wrench {
  finite([
    state.x,
    state.y,
    state.vx,
    state.vy,
    state.heading,
    state.omega,
    desired.vx,
    desired.vy,
    desired.heading ?? 0,
    desired.angularVelocity ?? 0,
    mass.massKg,
    mass.inertiaKgM2,
    ...Object.values(profile),
  ]);
  if (
    mass.massKg <= 0 ||
    mass.inertiaKgM2 <= 0 ||
    Object.values(profile).some((v) => v < 0)
  )
    throw new Error("Invalid flight controller");
  let ax = (desired.vx - state.vx) * profile.velocityGain,
    ay = (desired.vy - state.vy) * profile.velocityGain;
  const scale = Math.min(
    1,
    profile.maxAcceleration / Math.max(1e-12, Math.hypot(ax, ay)),
  );
  ax *= scale;
  ay *= scale;
  const error =
    desired.heading === undefined
      ? 0
      : Math.atan2(
          Math.sin(desired.heading - state.heading),
          Math.cos(desired.heading - state.heading),
        );
  const omega = clamp(
    (desired.angularVelocity ?? 0) + error * profile.headingGain,
    -profile.maxAngularSpeed,
    profile.maxAngularSpeed,
  );
  const alpha = clamp(
    (omega - state.omega) * profile.angularGain,
    -profile.maxAngularAcceleration,
    profile.maxAngularAcceleration,
  );
  const c = Math.cos(state.heading),
    s = Math.sin(state.heading);
  return {
    fx: mass.massKg * (ax * c + ay * s),
    fy: mass.massKg * (-ax * s + ay * c),
    torque: alpha * mass.inertiaKgM2,
  };
}

/** Fixed-budget projected coordinate descent. Nonnegative bounded commands cannot
 * invent reverse thrust or control on an uncovered axis. Stable IDs fix solve order.
 * torqueLengthMeters balances torque error against force error in the objective. */
export function allocateThrust(
  actuators: readonly Actuator[],
  mass: MassProperties,
  requested: Wrench,
  torqueLengthMeters = 5,
) {
  finite([requested.fx, requested.fy, requested.torque, torqueLengthMeters]);
  if (torqueLengthMeters <= 0 || actuators.length > 256)
    throw new Error("Invalid allocation budget");
  const parts = unique(actuators),
    columns = parts.map((a) => actuatorWrench(a, mass));
  const vectors = columns.map((w) => [
    w.fx,
    w.fy,
    w.torque / torqueLengthMeters,
  ]);
  const residual = [
      requested.fx,
      requested.fy,
      requested.torque / torqueLengthMeters,
    ],
    commands = new Array(parts.length).fill(0) as number[];
  for (let pass = 0; pass < 80; pass++)
    for (let i = 0; i < parts.length; i++) {
      const vector = vectors[i],
        norm = vector.reduce((n, v) => n + v * v, 0);
      if (norm < 1e-12) continue;
      const step = vector.reduce((n, v, j) => n + v * residual[j], 0) / norm;
      const next = clamp(commands[i] + step, 0, 1),
        delta = next - commands[i];
      commands[i] = next;
      for (let j = 0; j < 3; j++) residual[j] -= vector[j] * delta;
    }
  const achieved: Wrench = { fx: 0, fy: 0, torque: 0 };
  for (let i = 0; i < parts.length; i++) {
    achieved.fx += columns[i].fx * commands[i];
    achieved.fy += columns[i].fy * commands[i];
    achieved.torque += columns[i].torque * commands[i];
  }
  return {
    commands: parts.map((a, i) => ({ id: a.id, throttle: commands[i] })),
    achieved,
    residual: {
      fx: requested.fx - achieved.fx,
      fy: requested.fy - achieved.fy,
      torque: requested.torque - achieved.torque,
    },
  };
}

/** Physics-only integration of the ACHIEVED wrench at the center of mass.
 * Authority adapters must gate actuators/resources and call at fixed DT. */
export function integrateWrench(
  state: Motion,
  mass: MassProperties,
  wrench: Wrench,
): Motion {
  finite([
    state.x,
    state.y,
    state.vx,
    state.vy,
    state.heading,
    state.omega,
    mass.massKg,
    mass.inertiaKgM2,
    wrench.fx,
    wrench.fy,
    wrench.torque,
  ]);
  if (mass.massKg <= 0 || mass.inertiaKgM2 <= 0)
    throw new Error("Invalid inertial body");
  const c = Math.cos(state.heading),
    s = Math.sin(state.heading);
  const vx = state.vx + ((wrench.fx * c - wrench.fy * s) / mass.massKg) * DT,
    vy = state.vy + ((wrench.fx * s + wrench.fy * c) / mass.massKg) * DT;
  const omega = state.omega + (wrench.torque / mass.inertiaKgM2) * DT;
  return {
    x: state.x + vx * DT,
    y: state.y + vy * DT,
    vx,
    vy,
    heading: state.heading + omega * DT,
    omega,
  };
}

/** Pilot axes are rate/velocity setpoints, matching the legacy coupled flight
 * computer. Released keys request rest, so opposing engines brake residual motion. */
export function pilotDesiredMotion(
  state: Motion,
  intent: Intent,
  maxForwardSpeed: number,
  maxReverseSpeed: number,
  maxAngularSpeed: number,
): DesiredMotion {
  finite([
    intent.throttle,
    intent.turn,
    maxForwardSpeed,
    maxReverseSpeed,
    maxAngularSpeed,
  ]);
  if (Math.min(maxForwardSpeed, maxReverseSpeed, maxAngularSpeed) < 0)
    throw new Error("Invalid pilot flight envelope");
  const throttle = clamp(intent.throttle, -1, 1);
  const speed = throttle * (throttle >= 0 ? maxForwardSpeed : maxReverseSpeed);
  return {
    vx: -Math.sin(state.heading) * speed,
    vy: Math.cos(state.heading) * speed,
    angularVelocity: clamp(intent.turn, -1, 1) * maxAngularSpeed,
  };
}

/** A disabled computer or lost authority cuts actuation, including assistance.
 * Keep solving zero input while authorized: zero requested rates are braking. */
export function solveFlight(
  state: Motion,
  desired: DesiredMotion,
  mass: MassProperties,
  actuators: readonly Actuator[],
  enabled: boolean,
  profile: FlightProfile = STANDARD_FLIGHT,
) {
  const requested = enabled
    ? desiredWrench(state, desired, mass, profile)
    : { fx: 0, fy: 0, torque: 0 };
  const allocation = allocateThrust(enabled ? actuators : [], mass, requested);
  return {
    requested,
    ...allocation,
    motion: integrateWrench(state, mass, allocation.achieved),
  };
}
