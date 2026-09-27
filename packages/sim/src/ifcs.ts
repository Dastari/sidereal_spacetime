import { DT, type Motion, type Intent } from "./index";
import {
  balanceMinimumEffort,
  minimumNewtonAllocation,
} from "./ifcs-allocation";
import { wrapFlightHeading } from "./flight-angle";

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
  torqueLengthMeters?: number;
  /** Dimensionless tie-breaker, applied only after exact wrench and minimum N. */
  effortWeight?: number;
  rawTurnBehavior?: boolean;
};
export type FlightEnvelope = {
  forward: number;
  reverse: number;
  left: number;
  right: number;
  angularPositive: number;
  angularNegative: number;
};
export const DEFAULT_EFFORT_WEIGHT = 1e-6;
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
  if (inertiaKgM2 <= 0) throw new Error("An assembly needs positive inertia");
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

/** Guidance requests motion; limits are accelerations in the authored body axes. */
export function desiredWrench(
  state: Motion,
  desired: DesiredMotion,
  mass: MassProperties,
  profile: FlightProfile = STANDARD_FLIGHT,
  envelope?: FlightEnvelope,
): Wrench {
  const numericProfile = [
    profile.velocityGain,
    profile.headingGain,
    profile.angularGain,
    profile.maxAcceleration,
    profile.maxAngularAcceleration,
    profile.maxAngularSpeed,
    profile.torqueLengthMeters ?? Math.sqrt(mass.inertiaKgM2 / mass.massKg),
    profile.effortWeight ?? DEFAULT_EFFORT_WEIGHT,
  ];
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
    ...numericProfile,
    ...Object.values(envelope ?? {}),
  ]);
  if (
    mass.massKg <= 0 ||
    mass.inertiaKgM2 <= 0 ||
    numericProfile.some((v) => v < 0) ||
    Object.values(envelope ?? {}).some((v) => v < 0) ||
    (profile.torqueLengthMeters !== undefined &&
      profile.torqueLengthMeters <= 0) ||
    (profile.rawTurnBehavior !== undefined &&
      typeof profile.rawTurnBehavior !== "boolean")
  )
    throw new Error("Invalid flight controller");
  const c = Math.cos(state.heading),
    s = Math.sin(state.heading);
  const error =
    desired.heading === undefined
      ? 0
      : Math.atan2(
          Math.sin(desired.heading - state.heading),
          Math.cos(desired.heading - state.heading),
        );
  const positive = Math.min(
    profile.maxAngularAcceleration,
    envelope?.angularPositive ?? Infinity,
  );
  const negative = Math.min(
    profile.maxAngularAcceleration,
    envelope?.angularNegative ?? Infinity,
  );
  // Critical damping; the old headingGain could demand an underdamped response.
  const gain = Math.min(profile.headingGain, profile.angularGain / 4);
  const capture =
    Math.sign(error) *
    Math.min(
      Math.abs(error) * gain,
      Math.sqrt(2 * (error >= 0 ? negative : positive) * Math.abs(error)),
    );
  let omega = clamp(
    (desired.angularVelocity ?? 0) + capture,
    -profile.maxAngularSpeed,
    profile.maxAngularSpeed,
  );
  if (
    envelope &&
    !profile.rawTurnBehavior &&
    desired.angularVelocity !== undefined
  ) {
    const speed = Math.max(
      Math.hypot(state.vx, state.vy),
      Math.hypot(desired.vx, desired.vy),
    );
    const forwardSpeed = -desired.vx * s + desired.vy * c;
    const lateral = omega * forwardSpeed >= 0 ? envelope.left : envelope.right;
    omega = clamp(
      omega,
      -Math.min(profile.maxAcceleration, lateral) / Math.max(speed, 1e-12),
      Math.min(profile.maxAcceleration, lateral) / Math.max(speed, 1e-12),
    );
  }
  // Heading guidance holds a fixed world velocity. Pilot rate guidance rotates its velocity target.
  const feedforward = desired.angularVelocity === undefined ? 0 : omega;
  const ax =
    (desired.vx - state.vx) * profile.velocityGain - feedforward * desired.vy;
  const ay =
    (desired.vy - state.vy) * profile.velocityGain + feedforward * desired.vx;
  let localX = ax * c + ay * s,
    localY = -ax * s + ay * c;
  const scale = Math.min(
    1,
    profile.maxAcceleration / Math.max(1e-12, Math.hypot(localX, localY)),
  );
  localX *= scale;
  localY *= scale;
  localX = clamp(
    localX,
    -(envelope?.left ?? Infinity),
    envelope?.right ?? Infinity,
  );
  localY = clamp(
    localY,
    -(envelope?.reverse ?? Infinity),
    envelope?.forward ?? Infinity,
  );
  return {
    fx: localX * mass.massKg,
    fy: localY * mass.massKg,
    torque:
      clamp((omega - state.omega) * profile.angularGain, -negative, positive) *
      mass.inertiaKgM2,
  };
}

/** Lexicographic allocation: attitude, translation residual, actual newtons,
 * then dimensionless quadratic balancing on the complete minimum-newton face.
 * A blended finite penalty cannot preserve exact reachable requests. */
export function allocateThrust(
  actuators: readonly Actuator[],
  mass: MassProperties,
  requested: Wrench,
  torqueLengthMeters = Math.sqrt(mass.inertiaKgM2 / mass.massKg),
  effortWeight = DEFAULT_EFFORT_WEIGHT,
) {
  finite([
    requested.fx,
    requested.fy,
    requested.torque,
    torqueLengthMeters,
    effortWeight,
  ]);
  if (torqueLengthMeters <= 0 || effortWeight < 0 || actuators.length > 256)
    throw new Error("Invalid allocation budget");
  const sorted = unique(actuators).map((a) => ({
    a,
    w: actuatorWrench(a, mass),
  }));
  // IDs only break ties between identical physical columns; row order and renamed IDs cannot retune flight.
  sorted.sort(
    (a, b) =>
      a.w.fx - b.w.fx ||
      a.w.fy - b.w.fy ||
      a.w.torque - b.w.torque ||
      a.a.maxThrustN * a.a.availability - b.a.maxThrustN * b.a.availability ||
      (a.a.id < b.a.id ? -1 : a.a.id > b.a.id ? 1 : 0),
  );
  const parts = sorted.map((v) => v.a),
    columns = sorted.map((v) => v.w),
    n = parts.length;
  const scale = Math.max(
    1,
    ...columns.flatMap((w) => [
      Math.abs(w.fx),
      Math.abs(w.fy),
      Math.abs(w.torque / torqueLengthMeters),
    ]),
  );
  const vectors = columns.map((w) => [
    w.fx / scale,
    w.fy / scale,
    w.torque / torqueLengthMeters / scale,
  ]);
  const target = [
    requested.fx / scale,
    requested.fy / scale,
    requested.torque / torqueLengthMeters / scale,
  ];
  const costs = parts.map((a) => (a.maxThrustN * a.availability) / scale);
  // First try the exact request: the common path needs no residual iteration.
  let solution = minimumNewtonAllocation(vectors, target, costs),
    passes = solution.passes;
  let commands = solution.values,
    converged = solution.converged;
  if (!solution.feasible) {
    const minTorque = vectors.reduce((sum, v) => sum + Math.min(0, v[2]), 0);
    const maxTorque = vectors.reduce((sum, v) => sum + Math.max(0, v[2]), 0);
    const torque = clamp(target[2], minTorque, maxTorque);
    commands = new Array<number>(n).fill(0);
    let remaining = torque;
    for (let i = 0; i < n; i++)
      if (vectors[i][2] * remaining > 0) {
        commands[i] = Math.min(1, remaining / vectors[i][2]);
        remaining -= commands[i] * vectors[i][2];
      }
    const residual = target.slice(0, 2);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 2; k++) residual[k] -= vectors[i][k] * commands[i];
    // Feasible pair directions span the tangent cone of one torque equality and a box.
    // Exact torque is retained throughout; no final polish can introduce unrequested yaw.
    converged = false;
    for (let pass = 0; pass < 80 - passes; pass++) {
      const before = residual[0] ** 2 + residual[1] ** 2;
      const update = (i: number, j: number, di: number, dj: number) => {
        const vx = vectors[i][0] * di + (j < 0 ? 0 : vectors[j][0] * dj);
        const vy = vectors[i][1] * di + (j < 0 ? 0 : vectors[j][1] * dj);
        const norm = vx * vx + vy * vy;
        if (norm < 1e-24) return;
        let lo = -Infinity,
          hi = Infinity;
        for (const [index, d] of [
          [i, di],
          [j, dj],
        ])
          if (index >= 0 && Math.abs(d) > 1e-15) {
            const a = -commands[index] / d,
              b = (1 - commands[index]) / d;
            lo = Math.max(lo, Math.min(a, b));
            hi = Math.min(hi, Math.max(a, b));
          }
        const step = clamp(
          (vx * residual[0] + vy * residual[1]) / norm,
          lo,
          hi,
        );
        commands[i] = clamp(commands[i] + di * step, 0, 1);
        if (j >= 0) commands[j] = clamp(commands[j] + dj * step, 0, 1);
        residual[0] -= vx * step;
        residual[1] -= vy * step;
      };
      for (let i = 0; i < n; i++) {
        if (Math.abs(vectors[i][2]) < 1e-12) update(i, -1, 1, 0);
        else
          for (let j = i + 1; j < n; j++)
            if (Math.abs(vectors[j][2]) >= 1e-12) {
              const normal = Math.max(
                Math.abs(vectors[i][2]),
                Math.abs(vectors[j][2]),
              );
              update(i, j, vectors[j][2] / normal, -vectors[i][2] / normal);
            }
      }
      if (before - residual[0] ** 2 - residual[1] ** 2 < 1e-14) {
        passes += pass + 1;
        converged = true;
        break;
      }
      if (pass === 79 - passes) passes = 80;
    }
    if (passes < 80) {
      const achievedTarget = [0, 1, 2].map((k) =>
        vectors.reduce((sum, v, i) => sum + v[k] * commands[i], 0),
      );
      solution = minimumNewtonAllocation(
        vectors,
        achievedTarget,
        costs,
        80 - passes,
      );
      passes += solution.passes;
      if (solution.feasible) commands = solution.values;
      converged &&= solution.converged;
    }
  }
  if (effortWeight > 0 && passes < 80) {
    const balanced = balanceMinimumEffort(
      vectors,
      costs,
      commands,
      80 - passes,
      solution.optimalFace,
    );
    commands = balanced.values;
    passes += balanced.passes;
    converged &&= balanced.converged;
  }
  const achieved: Wrench = { fx: 0, fy: 0, torque: 0 };
  for (const axis of ["fx", "fy", "torque"] as const) {
    let sum = 0,
      correction = 0,
      absolute = 0;
    for (let i = 0; i < n; i++) {
      const value = columns[i][axis] * commands[i],
        next = sum + value;
      correction +=
        Math.abs(sum) >= Math.abs(value)
          ? sum - next + value
          : value - next + sum;
      sum = next;
      absolute += Math.abs(value);
    }
    const total = sum + correction;
    // Only discard arithmetic cancellation uncertainty on a requested ZERO
    // axis. This is no physical dead zone: genuine tiny requested wrenches and
    // uncovered-axis side effects remain intact, and motion is never damped.
    const roundoff = 8 * Number.EPSILON * n * absolute;
    achieved[axis] =
      requested[axis] === 0 && Math.abs(total) <= roundoff ? 0 : total;
  }
  return {
    commands: parts
      .map((a, i) => ({ id: a.id, throttle: commands[i] }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    achieved,
    residual: {
      fx: requested.fx - achieved.fx,
      fy: requested.fy - achieved.fy,
      torque: requested.torque - achieved.torque,
    },
    passes,
    converged,
  };
}

/** Pure-axis maxima require zero force/torque on the other axes. Cached only for
 * immutable actuator inputs; authority supplies a new list after compilation. */
const envelopes = new WeakMap<
  readonly Actuator[],
  { key: string; envelope: FlightEnvelope }
>();
export function deriveEnvelope(
  actuators: readonly Actuator[],
  mass: MassProperties,
): FlightEnvelope {
  finite([mass.massKg, mass.inertiaKgM2, mass.centerX, mass.centerY]);
  if (mass.massKg <= 0 || mass.inertiaKgM2 <= 0 || actuators.length > 256)
    throw new Error("Invalid flight envelope");
  unique(actuators);
  const key = JSON.stringify([mass, actuators]);
  const cached = envelopes.get(actuators);
  if (cached?.key === key) return cached.envelope;
  const sum = actuators.reduce((n, a) => n + a.maxThrustN * a.availability, 0);
  const torque = actuators.reduce(
    (n, a) => n + Math.abs(actuatorWrench(a, mass).torque),
    0,
  );
  // Add a bounded ray variable and maximise it under all three wrench
  // equalities. This computes the exact supporting-ray endpoint in one LP.
  const maximum = (axis: number, sign: number, upper: number) => {
    if (upper === 0) return 0;
    const scale = Math.max(
      1,
      sum,
      torque / Math.sqrt(mass.inertiaKgM2 / mass.massKg),
    );
    const length = Math.sqrt(mass.inertiaKgM2 / mass.massKg);
    const vectors = actuators.map((a) => {
      const w = actuatorWrench(a, mass);
      return [w.fx / scale, w.fy / scale, w.torque / length / scale];
    });
    const ray = [0, 0, 0];
    ray[axis] = (-upper * sign) / scale / (axis === 2 ? length : 1);
    vectors.push(ray);
    const result = minimumNewtonAllocation(
      vectors,
      [0, 0, 0],
      [...new Array<number>(actuators.length).fill(0), -1],
    );
    // An exhausted numerical budget can only understate the envelope.
    return (
      (result.values[actuators.length] * upper) /
      (axis === 2 ? mass.inertiaKgM2 : mass.massKg)
    );
  };
  const envelope = {
    forward: maximum(1, 1, sum),
    reverse: maximum(1, -1, sum),
    left: maximum(0, -1, sum),
    right: maximum(0, 1, sum),
    angularPositive: maximum(2, 1, torque),
    angularNegative: maximum(2, -1, torque),
  };
  envelopes.set(actuators, { key, envelope });
  return envelope;
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
    heading: wrapFlightHeading(state.heading + omega * DT),
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
  envelope?: FlightEnvelope,
  profile: FlightProfile = STANDARD_FLIGHT,
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
  let angularVelocity = clamp(intent.turn, -1, 1) * maxAngularSpeed;
  if (envelope && !profile.rawTurnBehavior) {
    const lateral =
      angularVelocity * speed >= 0 ? envelope.left : envelope.right;
    const limit =
      Math.min(profile.maxAcceleration, lateral) /
      Math.max(Math.hypot(state.vx, state.vy), Math.abs(speed), 1e-12);
    angularVelocity = clamp(angularVelocity, -limit, limit);
  }
  return {
    vx: -Math.sin(state.heading) * speed,
    vy: Math.cos(state.heading) * speed,
    angularVelocity,
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
  envelope?: FlightEnvelope,
) {
  const desiredRequest = enabled
    ? desiredWrench(
        state,
        desired,
        mass,
        profile,
        envelope ?? deriveEnvelope(actuators, mass),
      )
    : { fx: 0, fy: 0, torque: 0 };
  const allocation = allocateThrust(
    enabled ? actuators : [],
    mass,
    desiredRequest,
    profile.torqueLengthMeters,
    profile.effortWeight,
  );
  // The controller publishes a jointly reachable request. The raw guidance
  // shortfall remains explicit, rather than being mislabeled allocator error.
  const requested = { ...allocation.achieved };
  return {
    requested,
    guidanceRequested: desiredRequest,
    guidanceResidual: allocation.residual,
    ...allocation,
    residual: { fx: 0, fy: 0, torque: 0 },
    motion: integrateWrench(state, mass, allocation.achieved),
  };
}
