/** CSS projective map for the exact source XY plane used by the 3D camera.
 * SVG x=east lattice units, SVG y=-north; one metre is32 lattice units. */
export function layoutPlaneMatrix(
  m: ArrayLike<number>,
  origin: readonly number[],
  elevation: number,
  width: number,
  height: number,
): number[] {
  const base = (row: number) =>
    -origin[0] * m[row] +
    (elevation - origin[1]) * m[4 + row] -
    origin[2] * m[8 + row] +
    m[12 + row];
  const x = [m[0] / 32, m[8] / 32, base(0)];
  const y = [m[1] / 32, m[9] / 32, base(1)];
  const w = [m[3] / 32, m[11] / 32, base(3)];
  const sx = x.map((v, i) => (width * (v + w[i])) / 2);
  const sy = y.map((v, i) => (height * (w[i] - v)) / 2);
  return [
    sx[0],
    sy[0],
    0,
    w[0],
    sx[1],
    sy[1],
    0,
    w[1],
    0,
    0,
    1,
    0,
    sx[2],
    sy[2],
    0,
    w[2],
  ];
}

/** Camera tilt (radians from straight down) beyond which the floorplan overlay
 * is no longer drawn as an SVG raster. A tilted camera makes the plane
 * projection perspective, and a raster warped through a perspective smears at
 * grazing angles, so the scene draws the grid and hull boundary itself. */
export const PLAN_OVERLAY_TILT_LIMIT = 0.12;
