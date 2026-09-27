import type { RigidBody } from "./collision";

export interface SweptBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
/** Conservative bounds for the complete translating/rotating capsule sweep.
 * Geometry is one planar spine plus radius; native meshes and camera state never
 * enter this path. Rotational padding bounds every spine point's arc length,
 * capped by the maximum possible diameter around the physical centre of mass. */
export function sweptCapsuleBounds(body: RigidBody, dt: number): SweptBounds {
  const ux = -Math.sin(body.heading),
    uy = Math.cos(body.heading);
  const offset = body.longitudinalOffset ?? 0;
  const a = offset - body.halfLength,
    b = offset + body.halfLength;
  const lateral = body.lateralOffset ?? 0;
  const reach = Math.hypot(lateral, Math.max(Math.abs(a), Math.abs(b)));
  const centerX = body.x + uy * lateral,
    centerY = body.y - ux * lateral;
  const rotation = Math.min(2, Math.abs(body.omega) * dt) * reach;
  // Same contact tolerance as narrow phase, plus a few f64 ULPs at admitted
  // world coordinates. Conservative inflation never authorizes a contact.
  const pad =
    body.radius +
    rotation +
    1e-5 +
    Number.EPSILON * 8 * Math.max(1, Math.abs(body.x), Math.abs(body.y));
  const dx = body.vx * dt,
    dy = body.vy * dt;
  return {
    minX: centerX + Math.min(ux * a, ux * b) + Math.min(0, dx) - pad,
    maxX: centerX + Math.max(ux * a, ux * b) + Math.max(0, dx) + pad,
    minY: centerY + Math.min(uy * a, uy * b) + Math.min(0, dy) - pad,
    maxY: centerY + Math.max(uy * a, uy * b) + Math.max(0, dy) + pad,
  };
}
/** Sweep-and-prune, rebuilt after each impulse because velocities can change.
 * Output retains canonical body-index order for deterministic simultaneous hits.
 * Crowded sets retain every candidate; no truncation silently drops contacts. */
export function sweptContactCandidates(
  bodies: readonly RigidBody[],
  dt: number,
) {
  const sorted = bodies
    .map((body, index) => ({ index, ...sweptCapsuleBounds(body, dt) }))
    .sort((a, b) => a.minX - b.minX || a.index - b.index);
  const pairs: [number, number][] = [];
  let axisChecks = 0;
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]!;
      if (b.minX > a.maxX) break;
      axisChecks++;
      if (a.maxY < b.minY || b.maxY < a.minY) continue;
      pairs.push(a.index < b.index ? [a.index, b.index] : [b.index, a.index]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { pairs, axisChecks };
}
