import { wrapFlightHeading } from "./flight-angle";
import { sweptContactCandidates } from "./collision-broadphase";
/** Planar rigid capsule/circle contacts. All positions and impulse math stay f64.
 * Multiple capsules (ships) and circles (movable asteroids). No render mesh
 * participates in authority. Conservative advancement handles fast translation
 * and rotating hulls without stepping through a collider.
 */
export interface RigidBody {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
  massKg: number;
  inertia: number;
  radius: number;
  halfLength: number;
  /** Capsule midpoint offset along local +Y; x/y remain the physical COM. */
  longitudinalOffset?: number;
}
const EPS = 1e-5;
/** Closest points of two finite planar capsule spines. Parallel overlapping
 * spines use the overlap midpoint, avoiding arbitrary endpoint torque. */
function capsuleContact(a: RigidBody, b: RigidBody) {
  const spine = (body: RigidBody) => {
    const ux = -Math.sin(body.heading),
      uy = Math.cos(body.heading);
    const offset = body.longitudinalOffset ?? 0;
    return {
      x: body.x + ux * (offset - body.halfLength),
      y: body.y + uy * (offset - body.halfLength),
      dx: ux * 2 * body.halfLength,
      dy: uy * 2 * body.halfLength,
    };
  };
  const A = spine(a),
    B = spine(b);
  const aa = A.dx ** 2 + A.dy ** 2,
    bb = B.dx ** 2 + B.dy ** 2;
  const dot = A.dx * B.dx + A.dy * B.dy;
  const rx = B.x - A.x,
    ry = B.y - A.y;
  const cross = A.dx * B.dy - A.dy * B.dx;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  let s = 0,
    t = 0;
  if (Math.abs(cross) <= 1e-12 * Math.sqrt(aa * bb)) {
    const start = (rx * A.dx + ry * A.dy) / aa,
      end = start + dot / aa;
    const lo = Math.max(0, Math.min(start, end)),
      hi = Math.min(1, Math.max(start, end));
    if (lo <= hi) {
      s = (lo + hi) / 2;
      t = clamp(
        ((A.x + s * A.dx - B.x) * B.dx + (A.y + s * A.dy - B.y) * B.dy) / bb,
      );
    } else {
      s = clamp((start + end) / 2);
      t = clamp(
        ((A.x + s * A.dx - B.x) * B.dx + (A.y + s * A.dy - B.y) * B.dy) / bb,
      );
    }
  } else {
    const intersectionS = (rx * B.dy - ry * B.dx) / cross;
    const intersectionT = (rx * A.dy - ry * A.dx) / cross;
    if (
      intersectionS >= 0 &&
      intersectionS <= 1 &&
      intersectionT >= 0 &&
      intersectionT <= 1
    ) {
      s = intersectionS;
      t = intersectionT;
    } else {
      const candidates = [
        [0, clamp((-rx * B.dx - ry * B.dy) / bb)],
        [1, clamp(((A.dx - rx) * B.dx + (A.dy - ry) * B.dy) / bb)],
        [clamp((rx * A.dx + ry * A.dy) / aa), 0],
        [clamp(((rx + B.dx) * A.dx + (ry + B.dy) * A.dy) / aa), 1],
      ];
      let best = Infinity;
      for (const [cs, ct] of candidates) {
        const distance =
          (A.x + cs * A.dx - B.x - ct * B.dx) ** 2 +
          (A.y + cs * A.dy - B.y - ct * B.dy) ** 2;
        if (distance < best) {
          best = distance;
          s = cs;
          t = ct;
        }
      }
    }
  }
  const ax = A.x + s * A.dx,
    ay = A.y + s * A.dy;
  const bx = B.x + t * B.dx,
    by = B.y + t * B.dy;
  const dx = bx - ax,
    dy = by - ay,
    distance = Math.hypot(dx, dy);
  let nx = distance > EPS ? dx / distance : Math.cos(a.heading);
  let ny = distance > EPS ? dy / distance : Math.sin(a.heading);
  if (distance <= EPS) {
    const side = (b.x - a.x) * nx + (b.y - a.y) * ny;
    const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (side < -EPS || (Math.abs(side) <= EPS && approach < 0)) {
      nx = -nx;
      ny = -ny;
    }
  }
  return {
    distance: distance - a.radius - b.radius,
    nx,
    ny,
    px: ax + nx * a.radius,
    py: ay + ny * a.radius,
  };
}

function contact(a: RigidBody, b: RigidBody) {
  if (b.halfLength > 0) {
    if (a.halfLength > 0) return capsuleContact(a, b);
    const c = contact(b, { ...a, halfLength: 0 }) as {
      distance: number;
      nx: number;
      ny: number;
      px: number;
      py: number;
    };
    return { ...c, nx: -c.nx, ny: -c.ny };
  }
  const ux = -Math.sin(a.heading),
    uy = Math.cos(a.heading);
  const offset = a.longitudinalOffset ?? 0;
  const t = Math.max(
    offset - a.halfLength,
    Math.min(offset + a.halfLength, (b.x - a.x) * ux + (b.y - a.y) * uy),
  );
  const ax = a.x + ux * t,
    ay = a.y + uy * t,
    dx = b.x - ax,
    dy = b.y - ay,
    d = Math.hypot(dx, dy);
  const nx = d > EPS ? dx / d : uy,
    ny = d > EPS ? dy / d : -ux;
  return {
    distance: d - a.radius - b.radius,
    nx,
    ny,
    px: ax + nx * a.radius,
    py: ay + ny * a.radius,
  };
}
function advance(body: RigidBody, dt: number) {
  return {
    ...body,
    x: body.x + body.vx * dt,
    y: body.y + body.vy * dt,
    heading: wrapFlightHeading(body.heading + body.omega * dt),
  };
}
export interface ContactWork {
  eventPasses: number;
  exhaustivePairs: number;
  broadphaseAxisChecks: number;
  narrowphasePairs: number;
  conservativeIterations: number;
}
function impactTime(a: RigidBody, b: RigidBody, dt: number, work: ContactWork) {
  const bound =
    Math.hypot(b.vx - a.vx, b.vy - a.vy) +
    Math.abs(a.omega) * (a.halfLength + Math.abs(a.longitudinalOffset ?? 0)) +
    Math.abs(b.omega) * (b.halfLength + Math.abs(b.longitudinalOffset ?? 0));
  let t = 0;
  for (let i = 0; i < 64; i++) {
    work.conservativeIterations++;
    const c = contact(advance(a, t), advance(b, t));
    if (c.distance < EPS) return { time: t, confirmed: true };
    if (bound < EPS) return undefined;
    const next = t + (c.distance / bound) * 0.95;
    if (next > dt) return undefined;
    t = next;
  }
  // This is a safe advancement limit, not evidence of contact. The caller must
  // freeze the remainder and report exhaustion without applying an impulse.
  return { time: t, confirmed: false };
}
function impulse(a: RigidBody, b: RigidBody, restitution: number) {
  const c = contact(a, b),
    raX = c.px - a.x,
    raY = c.py - a.y,
    rbX = c.px - b.x,
    rbY = c.py - b.y;
  const relative =
    (b.vx - b.omega * rbY - a.vx + a.omega * raY) * c.nx +
    (b.vy + b.omega * rbX - a.vy - a.omega * raX) * c.ny;
  const torqueA = raX * c.ny - raY * c.nx,
    torqueB = rbX * c.ny - rbY * c.nx;
  const inverse = 1 / a.massKg + 1 / b.massKg;
  const j =
    relative < 0
      ? (-(1 + restitution) * relative) /
        (inverse + torqueA ** 2 / a.inertia + torqueB ** 2 / b.inertia)
      : 0;
  a.vx -= (j * c.nx) / a.massKg;
  a.vy -= (j * c.ny) / a.massKg;
  a.omega -= (j * torqueA) / a.inertia;
  b.vx += (j * c.nx) / b.massKg;
  b.vy += (j * c.ny) / b.massKg;
  b.omega += (j * torqueB) / b.inertia;
  const correction = Math.max(0, EPS * 4 - c.distance) / inverse;
  a.x -= (correction * c.nx) / a.massKg;
  a.y -= (correction * c.ny) / a.massKg;
  b.x += (correction * c.nx) / b.massKg;
  b.y += (correction * c.ny) / b.massKg;
  return j;
}
export function stepContacts(
  input: readonly RigidBody[],
  dt: number,
  restitution = 0.2,
) {
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    dt > 1 / 30 ||
    restitution < 0 ||
    restitution > 1 ||
    !Number.isFinite(restitution)
  )
    throw new Error("Invalid contact step");
  if (
    input.length > 64 ||
    new Set(input.map((b) => b.id)).size !== input.length
  )
    throw new Error("Invalid contact body set");
  const bodies = input
    .map((b) => ({ ...b }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const b of bodies)
    if (
      ![
        b.x,
        b.y,
        b.vx,
        b.vy,
        b.heading,
        b.omega,
        b.massKg,
        b.inertia,
        b.radius,
        b.halfLength,
        b.longitudinalOffset ?? 0,
      ].every(Number.isFinite) ||
      Math.min(b.massKg, b.inertia, b.radius) <= 0 ||
      b.halfLength < 0
    )
      throw new Error("Invalid collider");
  let remaining = dt,
    impacts = 0;
  const work: ContactWork = {
    eventPasses: 0,
    exhaustivePairs: 0,
    broadphaseAxisChecks: 0,
    narrowphasePairs: 0,
    conservativeIterations: 0,
  };
  for (let event = 0; event < 48 && remaining > 1e-9; event++) {
    let first = remaining + 1,
      pair: [number, number] | undefined,
      confirmed = false;
    const candidates = sweptContactCandidates(bodies, remaining);
    work.eventPasses++;
    work.exhaustivePairs += (bodies.length * (bodies.length - 1)) / 2;
    work.broadphaseAxisChecks += candidates.axisChecks;
    work.narrowphasePairs += candidates.pairs.length;
    for (const [i, j] of candidates.pairs) {
      const time = impactTime(bodies[i]!, bodies[j]!, remaining, work);
      if (time && time.time < first) {
        first = time.time;
        pair = [i, j];
        confirmed = time.confirmed;
      }
    }
    if (!pair || first > remaining) {
      for (let i = 0; i < bodies.length; i++)
        bodies[i] = advance(bodies[i], remaining);
      remaining = 0;
      break;
    }
    for (let i = 0; i < bodies.length; i++)
      bodies[i] = advance(bodies[i], first);
    remaining -= first;
    if (!confirmed) return { bodies, impacts, exhausted: true, work };
    const [a, b] = pair;
    if (impulse(bodies[a], bodies[b], restitution) > EPS) impacts++;
  }
  return { bodies, impacts, exhausted: remaining > 1e-9, work };
}
