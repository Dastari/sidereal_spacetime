/** Planar rigid capsule/circle contacts. All positions and impulse math stay f64.
 * One capsule per lab (the ship); circles for movable asteroids. No render mesh
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
function contact(a: RigidBody, b: RigidBody) {
  if (b.halfLength > 0) {
    if (a.halfLength > 0)
      throw new Error(
        "Capsule/capsule requires the shared-world collision phase",
      );
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
    heading: body.heading + body.omega * dt,
  };
}
function impactTime(a: RigidBody, b: RigidBody, dt: number) {
  const bound =
    Math.hypot(b.vx - a.vx, b.vy - a.vy) +
    Math.abs(a.omega) * (a.halfLength + Math.abs(a.longitudinalOffset ?? 0)) +
    Math.abs(b.omega) * (b.halfLength + Math.abs(b.longitudinalOffset ?? 0));
  let t = 0;
  for (let i = 0; i < 64; i++) {
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
    .sort((a, b) => a.id.localeCompare(b.id));
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
  for (let event = 0; event < 48 && remaining > 1e-9; event++) {
    let first = remaining + 1,
      pair: [number, number] | undefined,
      confirmed = false;
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const time = impactTime(bodies[i], bodies[j], remaining);
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
    if (!confirmed) return { bodies, impacts, exhausted: true };
    const [a, b] = pair;
    if (impulse(bodies[a], bodies[b], restitution) > EPS) impacts++;
  }
  return { bodies, impacts, exhausted: remaining > 1e-9 };
}
