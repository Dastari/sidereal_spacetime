export interface Viewport {
  width: number;
  height: number;
}
export function diskVisible(
  x: number,
  y: number,
  radius: number,
  view: Viewport,
  margin = 24,
) {
  return (
    Math.hypot(
      x - Math.max(-margin, Math.min(view.width + margin, x)),
      y - Math.max(-margin, Math.min(view.height + margin, y)),
    ) <= radius
  );
}
/** Only produce the arc inside the viewport. Huge dashed SVG circles otherwise
 * tessellate their entire circumference, even when their boundary is invisible. */
export function visibleCirclePath(
  cx: number,
  cy: number,
  radius: number,
  view: Viewport,
): string {
  if (
    ![cx, cy, radius, view.width, view.height].every(Number.isFinite) ||
    radius <= 0
  )
    return "";
  const left = -2,
    top = -2,
    right = view.width + 2,
    bottom = view.height + 2;
  const nearest = Math.hypot(
    cx - Math.max(left, Math.min(right, cx)),
    cy - Math.max(top, Math.min(bottom, cy)),
  );
  const farthest = Math.hypot(
    Math.max(Math.abs(cx - left), Math.abs(cx - right)),
    Math.max(Math.abs(cy - top), Math.abs(cy - bottom)),
  );
  if (radius < nearest || radius > farthest) return "";
  const tau = Math.PI * 2,
    angles = [0, tau];
  for (const x of [left, right]) {
    const v = (x - cx) / radius;
    if (Math.abs(v) <= 1) {
      const a = Math.acos(v);
      angles.push(a, tau - a);
    }
  }
  for (const y of [top, bottom]) {
    const v = (y - cy) / radius;
    if (Math.abs(v) <= 1) {
      const a = Math.asin(v);
      angles.push((a + tau) % tau, (Math.PI - a + tau) % tau);
    }
  }
  angles.sort((a, b) => a - b);
  const inside = (a: number) => {
    const x = cx + radius * Math.cos(a),
      y = cy + radius * Math.sin(a);
    return x >= left && x <= right && y >= top && y <= bottom;
  };
  const paths: string[] = [];
  for (let i = 1; i < angles.length; i++) {
    const a = angles[i - 1],
      b = angles[i];
    if (b - a < Number.EPSILON || !inside((a + b) / 2)) continue;
    const steps = Math.min(256, Math.max(2, Math.ceil(((b - a) * radius) / 6)));
    for (let n = 0; n <= steps; n++) {
      const theta = a + ((b - a) * n) / steps;
      paths.push(
        `${n ? "L" : "M"}${(cx + radius * Math.cos(theta)).toFixed(3)} ${(cy + radius * Math.sin(theta)).toFixed(3)}`,
      );
    }
  }
  return paths.join(" ");
}
export function showOrbit(radius: number, moon: boolean) {
  return radius >= (moon ? 48 : 12);
}
export const hundredth = (value: number) => Math.round(value * 100) / 100;
