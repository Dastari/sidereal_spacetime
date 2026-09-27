/** Clip source SVG plane coordinates before perspective projection. Screen-edge
 * inequalities stay linear in homogeneous coordinates; no near-plane division.
 * The finite result prevents overflow-visible world guides painting behind camera.
 */
export function layoutPlaneClip(
  matrix: readonly number[],
  width: number,
  height: number,
): [number, number][] {
  if (
    matrix.length !== 16 ||
    ![...matrix, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return [];
  const x = [matrix[0], matrix[4], matrix[12]],
    y = [matrix[1], matrix[5], matrix[13]],
    w = [matrix[3], matrix[7], matrix[15]];
  const planes = [
    [w[0], w[1], w[2] - 0.001],
    x,
    w.map((v, i) => width * v - x[i]),
    y,
    w.map((v, i) => height * v - y[i]),
  ];
  let polygon: [number, number][] = [
    [-8192, -8192],
    [8192, -8192],
    [8192, 8192],
    [-8192, 8192],
  ];
  for (const [a, b, c] of planes) {
    const next: [number, number][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i],
        q = polygon[(i + 1) % polygon.length],
        dp = a * p[0] + b * p[1] + c,
        dq = a * q[0] + b * q[1] + c;
      if (dp >= 0) next.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    polygon = next;
    if (!polygon.length) break;
  }
  return polygon.every((p) => p.every(Number.isFinite)) ? polygon : [];
}
