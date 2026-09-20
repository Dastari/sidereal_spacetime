import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
export const approach = (a: number, b: number, rate: number, dt: number) =>
  a + clamp(angle(b - a), -rate * dt, rate * dt);
export const exponential = (
  a: number,
  b: number,
  seconds: number,
  dt: number,
) => b + (a - b) * Math.exp(-dt / Math.max(0.001, seconds));
/** Analytical two-bone IK; no scale/stretch, including zero target and collinear poles. */
export function twoBone(
  origin: Vector3,
  target: Vector3,
  pole: Vector3,
  a: number,
  b: number,
  previousBend?: Vector3,
  minBend = 0.08,
  maxBend = 2.85,
) {
  if (
    ![...origin.asArray(), ...target.asArray(), ...pole.asArray(), a, b].every(
      Number.isFinite,
    ) ||
    a <= 0 ||
    b <= 0
  )
    throw new Error("Invalid IK input");
  let direction = target.subtract(origin);
  const requested = direction.length();
  direction =
    requested > 1e-8 ? direction.scale(1 / requested) : new Vector3(0, -1, 0);
  const distance = clamp(
    requested,
    Math.max(
      Math.abs(a - b) + 1e-5,
      Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(maxBend)),
    ),
    Math.min(
      a + b - 1e-5,
      Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(minBend)),
    ),
  );
  let bend = pole.subtract(origin);
  bend.subtractInPlace(direction.scale(Vector3.Dot(bend, direction)));
  if (bend.lengthSquared() < 1e-8) {
    bend =
      previousBend?.clone() ??
      (Math.abs(direction.y) < 0.9 ? Vector3.Down() : Vector3.Right());
    bend.subtractInPlace(direction.scale(Vector3.Dot(bend, direction)));
  }
  if (bend.lengthSquared() < 1e-8)
    bend = Vector3.Cross(direction, Vector3.Forward());
  bend.normalize();
  if (previousBend && Vector3.Dot(bend, previousBend) < 0) bend.negateInPlace();
  const along = (a * a - b * b + distance * distance) / (2 * distance),
    height = Math.sqrt(Math.max(0, a * a - along * along));
  return {
    elbow: origin.add(direction.scale(along)).add(bend.scale(height)),
    end: origin.add(direction.scale(distance)),
    bend,
    error: Math.abs(requested - distance),
  };
}
export function aimRotation(yaw: number, pitch: number) {
  return Quaternion.RotationYawPitchRoll(-yaw, pitch, 0);
}
export interface OrientedBox {
  name: string;
  center: Vector3;
  half: Vector3;
  axes: readonly Vector3[];
}
export function transformedBox(
  name: string,
  center: Vector3,
  half: Vector3,
  m: Matrix,
): OrientedBox {
  const axes = [Vector3.Right(), Vector3.Up(), Vector3.Forward()].map((v) =>
    Vector3.TransformNormal(v, m),
  );
  return {
    name,
    center: Vector3.TransformCoordinates(center, m),
    half: new Vector3(
      half.x * axes[0].length(),
      half.y * axes[1].length(),
      half.z * axes[2].length(),
    ),
    axes: axes.map((a) => a.normalize()),
  };
}
/** 15-axis separating-axis test; positive return is overlap depth, zero means clear. */
export function boxPenetration(
  a: OrientedBox,
  b: OrientedBox,
  margin = 0,
): number {
  const dx = b.center.x - a.center.x,
    dy = b.center.y - a.center.y,
    dz = b.center.z - a.center.z;
  let depth = Infinity;
  // This runs repeatedly during each pose correction. Keep the same axis order,
  // normalization and degenerate-axis threshold without allocating scratch vectors
  // or half-extent arrays for every projection. Inputs remain caller-owned.
  const test = (x: number, y: number, z: number) => {
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length < 1e-7) return true;
    const inverse = 1 / length,
      nx = x * inverse,
      ny = y * inverse,
      nz = z * inverse;
    const aa = a.axes,
      ba = b.axes;
    const ar =
      Math.abs(nx * aa[0].x + ny * aa[0].y + nz * aa[0].z) * a.half.x +
      Math.abs(nx * aa[1].x + ny * aa[1].y + nz * aa[1].z) * a.half.y +
      Math.abs(nx * aa[2].x + ny * aa[2].y + nz * aa[2].z) * a.half.z;
    const br =
      Math.abs(nx * ba[0].x + ny * ba[0].y + nz * ba[0].z) * b.half.x +
      Math.abs(nx * ba[1].x + ny * ba[1].y + nz * ba[1].z) * b.half.y +
      Math.abs(nx * ba[2].x + ny * ba[2].y + nz * ba[2].z) * b.half.z;
    const overlap = ar + br + margin - Math.abs(dx * nx + dy * ny + dz * nz);
    depth = Math.min(depth, overlap);
    return overlap > 0;
  };
  for (const axis of a.axes) if (!test(axis.x, axis.y, axis.z)) return 0;
  for (const axis of b.axes) if (!test(axis.x, axis.y, axis.z)) return 0;
  for (const x of a.axes)
    for (const y of b.axes)
      if (
        !test(
          x.y * y.z - x.z * y.y,
          x.z * y.x - x.x * y.z,
          x.x * y.y - x.y * y.x,
        )
      )
        return 0;
  return depth;
}
export function rayBoxDistance(
  origin: Vector3,
  direction: Vector3,
  box: OrientedBox,
  maxDistance: number,
): number | undefined {
  const delta = origin.subtract(box.center);
  let near = 0,
    far = maxDistance;
  for (let i = 0; i < 3; i++) {
    const o = Vector3.Dot(delta, box.axes[i]),
      d = Vector3.Dot(direction, box.axes[i]),
      h = box.half.asArray()[i];
    if (Math.abs(d) < 1e-8) {
      if (Math.abs(o) > h) return;
      continue;
    }
    const x = (-h - o) / d,
      y = (h - o) / d;
    near = Math.max(near, Math.min(x, y));
    far = Math.min(far, Math.max(x, y));
    if (near > far) return;
  }
  return near;
}
