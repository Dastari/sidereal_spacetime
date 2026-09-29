/**
 * The EVA suit as a rigid body with a small IFCS (owner 2026-09-29: "doesn't feel like proper
 * Newtonian physics/movement with thrust ... The backpack should probably have some kind of IFCS
 * system as well"). Pure and deterministic; wiki `Systems/EVA`.
 *
 * - The body is a planar rigid body: mass (body + suit + carried items), moment of inertia, linear
 *   and angular momentum. Nothing snaps: heading changes only through angular velocity, angular
 *   velocity only through torque. With no torque, angular momentum is conserved.
 * - The jetpack has eight fixed nozzles (pack corners, one longitudinal and one lateral jet each).
 *   The player gives INTENT: a translation direction in the body's frame and a facing. The suit
 *   IFCS turns intent into a desired wrench and allocates it to the nozzles with the ship IFCS
 *   allocator (`allocateThrust`, shared with ship flight); nozzle limits bound what happens.
 * - Modes: `hold` (stabiliser: holds the facing and kills velocity relative to the frame's reference,
 *   so a released stick means "stop here") and `free` (no stabiliser: thrust and yaw torque only while
 *   commanded; linear and angular momentum carry you otherwise).
 * Propellant is unlimited (owner, 2026-09-29).
 *
 * Frames: body frame x right (starboard), y forward; heading uses the ship convention
 * (counter-clockwise, forward = (-sin h, cos h)); nozzle `rotation` uses the actuator convention
 * (force = (-sin r, cos r)).
 */
import {
  allocateThrust,
  type Actuator,
  type MassProperties,
  type Wrench,
} from "./ifcs";

type P2 = [number, number];
const zero = (n: number) => n + 0;
const wrap = (a: number) => {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return zero(r);
};
const rot = (v: readonly [number, number], a: number): P2 => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [zero(c * v[0] - s * v[1]), zero(s * v[0] + c * v[1])];
};

/** Provisional lab values (not approved balance). */
export const EVA_SUIT = {
  /** Crew body mass without equipment (kg). */
  bodyMassKg: 80,
  /** Radius of gyration of a floating crew body about its vertical axis (m). */
  gyrationM: 0.35,
  /** Thrust of one jetpack nozzle (N). Two nozzles act on each translation axis. */
  nozzleN: 300,
  /** Pack corner offsets (m): nozzles sit at (±x, ±y). */
  cornerX: 0.22,
  cornerY: 0.18,
  /** Hold mode: speed relative to the reference at full input (m/s) and velocity gain (1/s). */
  holdSpeed: 6,
  velocityGain: 1.6,
  /** Requested linear acceleration cap (m/s²); the nozzles may deliver less. */
  maxAcceleration: 8,
  /** Facing controller: proportional (1/s²) and damping (1/s) gains, speed and accel caps. */
  headingGain: 14,
  angularGain: 7,
  maxAngularSpeed: 3,
  maxAngularAcceleration: 12,
  /** Free mode: yaw torque command at full input (rad/s²); momentum keeps the spin afterwards. */
  freeYawAcceleration: 3,
  /** Hold mode: below these the body is held exactly at rest / on its facing. */
  restSpeed: 0.02,
  restAngularSpeed: 0.02,
  restHeadingError: 0.004,
} as const;

/**
 * The jetpack nozzles in the body frame. Each pack corner has a longitudinal jet (the front
 * corners push back, the rear corners push forward) and a lateral jet (the left corners push
 * right, the right corners push left): pure force on either axis and pure torque are all
 * reachable, so the IFCS can translate and turn independently.
 */
export const EVA_SUIT_NOZZLES: readonly Actuator[] = (() => {
  const { cornerX: x, cornerY: y, nozzleN: n } = EVA_SUIT;
  const back = Math.PI, // force (0, -1)
    forward = 0, // force (0, 1)
    right = -Math.PI / 2, // force (1, 0)
    left = Math.PI / 2; // force (-1, 0)
  const nozzle = (id: string, px: number, py: number, rotation: number) => ({
    id,
    x: px,
    y: py,
    rotation,
    maxThrustN: n,
    availability: 1,
  });
  return [
    nozzle("fl.long", -x, y, back),
    nozzle("fl.lat", -x, y, right),
    nozzle("fr.long", x, y, back),
    nozzle("fr.lat", x, y, left),
    nozzle("rl.long", -x, -y, forward),
    nozzle("rl.lat", -x, -y, right),
    nozzle("rr.long", x, -y, forward),
    nozzle("rr.lat", x, -y, left),
  ];
})();

/** Mass properties of a suited body carrying `carriedKg` of equipment and items. */
export function evaSuitMass(carriedKg: number): MassProperties {
  const massKg =
    EVA_SUIT.bodyMassKg + (Number.isFinite(carriedKg) ? Math.max(0, carriedKg) : 0);
  return {
    massKg,
    centerX: 0,
    centerY: 0,
    inertiaKgM2: massKg * EVA_SUIT.gyrationM ** 2,
  };
}

export type EvaSuitMode = "hold" | "free";
export interface EvaSuitIntent {
  /** Translation direction in the frame (ship-local or world), |d| <= 1. */
  dx: number;
  dy: number;
  /** Desired facing (heading in the frame), or null for none. */
  facing: number | null;
  mode: EvaSuitMode;
  /** Free mode without a facing: yaw torque command, -1..1 (counter-clockwise positive). */
  turn?: number;
}
export interface EvaRigidState {
  x: number;
  y: number;
  /** Velocity in the frame (m/s). */
  vx: number;
  vy: number;
  /** Heading in the frame and angular velocity (rad/s, counter-clockwise). */
  heading: number;
  omega: number;
}
export interface EvaFrameReference {
  /** Velocity the hold mode settles to (m/s, frame): zero in a ship's frame. */
  v: readonly [number, number];
  /** Its rate of change (m/s², fed forward). */
  a: readonly [number, number];
}
const REST: EvaFrameReference = { v: [0, 0], a: [0, 0] };

const clampMag = (v: P2, max: number): P2 => {
  const l = Math.hypot(v[0], v[1]);
  return l > max ? [(v[0] * max) / l, (v[1] * max) / l] : v;
};
const finiteOr = (n: number, d = 0) => (Number.isFinite(n) ? n : d);

/**
 * The suit IFCS: the wrench (body frame) the intent asks for. Hold: drive the velocity toward
 * `reference + direction × holdSpeed` and hold the facing (or kill rotation when none is given).
 * Free: thrust along the direction only while commanded; steer only toward a commanded facing.
 */
export function evaSuitDemand(
  state: EvaRigidState,
  intent: EvaSuitIntent,
  mass: MassProperties,
  reference: EvaFrameReference = REST,
): Wrench {
  let d: P2 = [finiteOr(intent.dx), finiteOr(intent.dy)];
  d = clampMag(d, 1);
  let a: P2;
  if (intent.mode === "hold") {
    const want: P2 = [
      reference.v[0] + d[0] * EVA_SUIT.holdSpeed,
      reference.v[1] + d[1] * EVA_SUIT.holdSpeed,
    ];
    a = [
      (want[0] - state.vx) * EVA_SUIT.velocityGain + reference.a[0],
      (want[1] - state.vy) * EVA_SUIT.velocityGain + reference.a[1],
    ];
  } else a = [d[0] * EVA_SUIT.maxAcceleration, d[1] * EVA_SUIT.maxAcceleration];
  a = clampMag(a, EVA_SUIT.maxAcceleration);
  const facing =
    intent.facing !== null && Number.isFinite(intent.facing)
      ? intent.facing
      : null;
  let alpha = 0;
  if (facing !== null) {
    // Aim to reach the facing without overshooting the angular speed cap.
    const error = wrap(facing - state.heading);
    const wantOmega = Math.max(
      -EVA_SUIT.maxAngularSpeed,
      Math.min(EVA_SUIT.maxAngularSpeed, (error * EVA_SUIT.headingGain) / EVA_SUIT.angularGain),
    );
    alpha = (wantOmega - state.omega) * EVA_SUIT.angularGain;
  } else if (intent.mode === "hold") alpha = -state.omega * EVA_SUIT.angularGain;
  else
    alpha =
      Math.max(-1, Math.min(1, finiteOr(intent.turn ?? 0))) *
      EVA_SUIT.freeYawAcceleration;
  alpha = Math.max(
    -EVA_SUIT.maxAngularAcceleration,
    Math.min(EVA_SUIT.maxAngularAcceleration, alpha),
  );
  const body = rot(a, -state.heading);
  return {
    fx: body[0] * mass.massKg,
    fy: body[1] * mass.massKg,
    torque: alpha * mass.inertiaKgM2,
  };
}

export interface EvaSuitAllocation {
  /** Wrench the nozzles deliver (body frame). */
  achieved: Wrench;
  /** Throttle 0..1 per nozzle, in `EVA_SUIT_NOZZLES` id order. */
  throttles: { id: string; throttle: number }[];
}
/** Allocate a wrench to the jetpack nozzles (the ship IFCS allocator; bounded, deterministic). */
export function allocateEvaSuit(
  demand: Wrench,
  mass: MassProperties,
  nozzles: readonly Actuator[] = EVA_SUIT_NOZZLES,
): EvaSuitAllocation {
  if (
    Math.abs(demand.fx) < 1e-9 &&
    Math.abs(demand.fy) < 1e-9 &&
    Math.abs(demand.torque) < 1e-9
  )
    return {
      achieved: { fx: 0, fy: 0, torque: 0 },
      throttles: [...nozzles]
        .map((n) => ({ id: n.id, throttle: 0 }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    };
  const r = allocateThrust(nozzles, mass, demand);
  return { achieved: r.achieved, throttles: r.commands };
}

export interface EvaSuitTick {
  /** Linear acceleration in the frame (m/s²) and angular acceleration (rad/s²) for this tick. */
  linear: P2;
  angular: number;
  allocation: EvaSuitAllocation;
}
/** One tick of the suit IFCS: demand, allocation, and the resulting accelerations. */
export function evaSuitTick(
  state: EvaRigidState,
  intent: EvaSuitIntent,
  mass: MassProperties,
  reference: EvaFrameReference = REST,
): EvaSuitTick {
  const allocation = allocateEvaSuit(
    evaSuitDemand(state, intent, mass, reference),
    mass,
  );
  const f = rot([allocation.achieved.fx, allocation.achieved.fy], state.heading);
  return {
    linear: [f[0] / mass.massKg, f[1] / mass.massKg],
    angular: allocation.achieved.torque / mass.inertiaKgM2,
    allocation,
  };
}

/**
 * Integrate the rotation over a tick (semi-implicit Euler over `steps`): the angular velocity
 * changes only by `angular`, the heading only by the angular velocity. Hold mode with nothing to
 * do settles exactly (no creeping).
 */
export function integrateSpin(
  heading: number,
  omega: number,
  angular: number,
  dt: number,
  steps: number,
): { heading: number; omega: number } {
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    omega += angular * h;
    heading = wrap(heading + omega * h);
  }
  return { heading, omega: zero(omega) };
}

/** Presentation summary of an allocation: fractions of full thrust per body axis and of full torque. */
export function evaSuitPresentation(allocation: EvaSuitAllocation) {
  const full = 2 * EVA_SUIT.nozzleN;
  const fullTorque =
    4 * EVA_SUIT.nozzleN * Math.max(EVA_SUIT.cornerX, EVA_SUIT.cornerY);
  const c = (v: number) => Math.max(-1, Math.min(1, zero(v)));
  return {
    forward: c(allocation.achieved.fy / full),
    strafe: c(allocation.achieved.fx / full),
    turn: c(allocation.achieved.torque / fullTorque),
  };
}
