/**
 * Frame math for prefab ship rendering. Pure: no Babylon objects, so tests run without a GPU.
 *
 * Frames (all right-handed, metres):
 * - prefab frame: +X fore, +Y port, +Z up (grammar data, dresser output).
 * - ship-local game frame (`PrefabShipView.root`): game +X starboard, game +Y fore, origin at
 *   `prefabOrigin(doc)`. Rendered as Babylon (X = game x, Y = up, Z = -game y), so prefab
 *   (px, py, pz) -> Babylon (-(py - oy), pz, -(px - ox)).
 * - kit piece / glTF frame: prototype (x, y, z) is glTF (x, z, -y) (Y-up). Face pieces: +X along
 *   the face, +Y outward; placements rotate about +Z by `rotDeg` and translate to (x, y, z).
 * - component frame: +X starboard, +Y forward, +Z up (quarterTurns 0 = +Y fore); GLB (x, z, -y).
 *   quarterTurns turns the component counter-clockwise about +Z in the prefab frame.
 *
 * Matrices use Babylon's row-vector layout (`Matrix.m`): elements 0..2 are the image of the
 * first basis vector, 4..6 the second, 8..10 the third, 12..14 the translation.
 */

export type Vec3 = readonly [number, number, number];
/** 16 numbers, Babylon `Matrix.m` layout. */
export type Mat4 = number[];

/** Build a Babylon-layout matrix from the images of the three basis vectors and a translation. */
export function basisMatrix(ex: Vec3, ey: Vec3, ez: Vec3, t: Vec3 = [0, 0, 0]): Mat4 {
  return [ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], 0, ez[0], ez[1], ez[2], 0, t[0], t[1], t[2], 1];
}

/** Transform a point by a Babylon-layout matrix (row vector convention). */
export function transformPoint(m: Mat4, p: Vec3): [number, number, number] {
  return [
    p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
    p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
    p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14],
  ];
}

/** Transform a direction (no translation). */
export function transformDirection(m: Mat4, d: Vec3): [number, number, number] {
  return [d[0] * m[0] + d[1] * m[4] + d[2] * m[8], d[0] * m[1] + d[1] * m[5] + d[2] * m[9], d[0] * m[2] + d[1] * m[6] + d[2] * m[10]];
}

/** Apply `a` first, then `b` (row vectors: result = a * b). */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = s;
    }
  return out;
}

/** Determinant of the 3x3 rotation part (1 for proper rotations, -1 for mirrors). */
export function det3(m: Mat4): number {
  return m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
}

/** Prefab frame -> ship-local Babylon frame (`root` space). */
export function prefabFrameMatrix(origin: readonly [number, number]): Mat4 {
  const [ox, oy] = origin;
  // fore (+X) -> Babylon -Z, port (+Y) -> Babylon -X, up (+Z) -> Babylon +Y.
  return basisMatrix([0, 0, -1], [-1, 0, 0], [0, 1, 0], [oy, 0, ox]);
}

/** Prefab point -> ship-local Babylon point. */
export function prefabToShipLocal(p: Vec3, origin: readonly [number, number]): [number, number, number] {
  return [-(p[1] - origin[1]), p[2], -(p[0] - origin[0])];
}

/** Ship-local Babylon point -> ship-local game frame (x starboard, y fore, z up). */
export function shipLocalToGame(p: Vec3): [number, number, number] {
  return [p[0], -p[2], p[1]];
}

/** glTF (Y-up) piece/component coordinates -> Z-up authoring coordinates: (x, y, z) -> (x, -z, y). */
export const GLTF_TO_ZUP: Mat4 = basisMatrix([1, 0, 0], [0, 0, 1], [0, -1, 0]);

/** Rotation by `deg` counter-clockwise about +Z, then translation. */
export function rotZTranslate(deg: number, t: Vec3): Mat4 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const q = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  return basisMatrix([q(c), q(s), 0], [q(-s), q(c), 0], [0, 0, 1], t);
}

/**
 * Kit placement instance matrix: glTF piece coordinates -> prefab frame. Rotation is about the
 * piece origin (the placement point), matching the dresser and the Python prototype.
 */
export function kitInstanceMatrix(x: number, y: number, z: number, rotDeg: number): Mat4 {
  return multiply(GLTF_TO_ZUP, rotZTranslate(rotDeg, [x, y, z]));
}

/** Component frame at quarterTurns 0 -> prefab axes: +Y forward -> +X fore, +X starboard -> -Y. */
export const COMPONENT_TO_PREFAB: Mat4 = basisMatrix([0, -1, 0], [1, 0, 0], [0, 0, 1]);

/** Component frame -> prefab frame for a mount placement (anchor metres, anchorZ metres). */
export function componentMatrix(anchor: readonly [number, number], anchorZ: number, quarterTurns: number): Mat4 {
  return multiply(COMPONENT_TO_PREFAB, rotZTranslate(90 * quarterTurns, [anchor[0], anchor[1], anchorZ]));
}

export type MountFrame = "top" | "face" | "interior";
export type MountSocket = "top" | "face" | "rear" | "edge" | "interior" | "bottom";

/**
 * Authored-frame -> socket-frame rotation, a local copy of `shipMountRotation` in
 * packages/content/src/ship-components.ts (not exported by @sidereal/content yet).
 * top on face/rear/edge: (x, y, z) -> (y, -z, -x); face on top: (x, y, z) -> (x, z, -y);
 * top on bottom: roll 180 about +Y; face on bottom: (x, y, z) -> (x, -z, y).
 */
export function mountRotation(frame: MountFrame, socket: MountSocket): Mat4 {
  if (frame === "top" && socket === "bottom") return basisMatrix([-1, 0, 0], [0, 1, 0], [0, 0, -1]);
  if (frame === "top" && (socket === "face" || socket === "rear" || socket === "edge")) return basisMatrix([0, 0, -1], [1, 0, 0], [0, -1, 0]);
  if (frame === "face" && socket === "top") return basisMatrix([1, 0, 0], [0, 0, -1], [0, 1, 0]);
  if (frame === "face" && socket === "bottom") return basisMatrix([1, 0, 0], [0, 0, 1], [0, -1, 0]);
  return basisMatrix([1, 0, 0], [0, 1, 0], [0, 0, 1]);
}

/** Authored frame implied by a component's first accepted socket (mirrors `shipMountFrameOf`). */
export function frameOfSocket(socket: MountSocket | undefined): MountFrame {
  return socket === "top" || socket === "bottom" ? "top" : socket === "interior" ? "interior" : "face";
}
