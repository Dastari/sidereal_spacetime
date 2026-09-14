/** Split a plane→screen homography into an affine part and a residual perspective.
 *
 * `layoutPlaneMatrix` yields a CSS `matrix3d` that maps floorplan units straight
 * to screen pixels. Applying that whole matrix to the SVG makes the browser
 * rasterize a layer scaled by the zoom factor (tens of thousands of pixels wide)
 * and re-clip it on every camera change, which shows up as whole-page flicker.
 *
 * Instead the affine part `A` becomes an SVG `matrix()` on the content group, so
 * the SVG draws at screen resolution inside a viewport-sized box, and only the
 * pure perspective residual `P` (identity linear part) stays on the element.
 * `P · A` equals the original homography, so every guide lands on the same pixel.
 */
export interface PlaneOverlayFrame {
  /** SVG `transform` for the content group, in wrap-relative CSS pixels. */
  group: string;
  /** CSS `transform` for the SVG element; empty when the projection is affine. */
  css: string;
  /** CSS `transform-origin` that makes `css` act in wrap coordinates. */
  origin: string;
  /** Element box in wrap-relative CSS pixels. */
  box: { x: number; y: number; w: number; h: number };
  /** `viewBox` matching `box`, so user units stay wrap pixels. */
  viewBox: string;
  /** clip-path polygon in element-local pixels; empty when unnecessary. */
  clip: string;
  visible: boolean;
}

const HIDDEN: PlaneOverlayFrame = {
  group: "",
  css: "",
  origin: "0px 0px",
  box: { x: 0, y: 0, w: 0, h: 0 },
  viewBox: "0 0 0 0",
  clip: "",
  visible: false,
};

/** Depth ratio beyond which plane content is dropped: it is drawn at less than
 * one eighth of the scale at the viewport origin, so nothing legible is lost. */
const MAX_DEPTH_RATIO = 8;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
// Perspective terms are tiny (1e-5); keep full significance or edges drift by pixels.
const num = (n: number) => String(Number(n.toPrecision(12)));

export function planeOverlayFrame(
  matrix: readonly number[],
  width: number,
  height: number,
): PlaneOverlayFrame {
  if (
    matrix.length !== 16 ||
    ![...matrix, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return HIDDEN;
  const w2 = matrix[15];
  if (Math.abs(w2) < 1e-9) return HIDDEN;
  // Column-major matrix3d: x' = m0 x + m4 y + m12, y' = m1 x + m5 y + m13,
  // w' = m3 x + m7 y + m15. Normalise so the affine origin has w = 1.
  const a = matrix[0] / w2,
    b = matrix[1] / w2,
    c = matrix[4] / w2,
    d = matrix[5] / w2,
    e = matrix[12] / w2,
    f = matrix[13] / w2,
    g = matrix[3] / w2,
    h = matrix[7] / w2;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return HIDDEN;
  // Residual perspective row (g h 1) · A⁻¹ so that P · A reproduces the homography.
  let p0 = (g * d - h * b) / det,
    p1 = (h * a - g * c) / det,
    p2 = (g * (c * f - d * e) + h * (b * e - a * f)) / det + 1;
  if (![p0, p1, p2].every(Number.isFinite) || Math.abs(p2) < 1e-9)
    return HIDDEN;
  const group = `matrix(${[a, b, c, d, e, f].map(num).join(" ")})`;
  const affine = Math.abs(p0) < 1e-9 && Math.abs(p1) < 1e-9;
  if (affine)
    return {
      group,
      css: "",
      origin: "0px 0px",
      box: { x: 0, y: 0, w: width, h: height },
      viewBox: `0 0 ${num(width)} ${num(height)}`,
      clip: "",
      visible: true,
    };
  // A homogeneous matrix and its negation project identically; keep p2 positive
  // so "in front of the camera" is the positive side of the denominator.
  const sign = p2 < 0 ? -1 : 1;
  p0 *= sign;
  p1 *= sign;
  p2 *= sign;
  // Screen (X, Y) maps back to affine space by t = p2 / (1 - p0 X - p1 Y).
  // Keep the part of the viewport whose depth ratio stays bounded.
  const inFront = (X: number, Y: number) => 1 - p0 * X - p1 * Y;
  let polygon: [number, number][] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  const next: [number, number][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i],
      q = polygon[(i + 1) % polygon.length],
      dp = inFront(p[0], p[1]) - 1 / MAX_DEPTH_RATIO,
      dq = inFront(q[0], q[1]) - 1 / MAX_DEPTH_RATIO;
    if (dp >= 0) next.push(p);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  polygon = next;
  if (polygon.length < 3) return HIDDEN;
  const source = polygon.map(([X, Y]) => {
    const t = p2 / inFront(X, Y);
    return [X * t, Y * t] as [number, number];
  });
  if (!source.every((p) => p.every(Number.isFinite))) return HIDDEN;
  const pad = 2;
  const minX = Math.min(...source.map((p) => p[0])) - pad,
    maxX = Math.max(...source.map((p) => p[0])) + pad,
    minY = Math.min(...source.map((p) => p[1])) - pad,
    maxY = Math.max(...source.map((p) => p[1])) + pad;
  const box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  if (box.w <= 0 || box.h <= 0) return HIDDEN;
  const s = sign;
  return {
    group,
    css: `matrix3d(${[s, 0, 0, s * p0, 0, s, 0, s * p1, 0, 0, s, 0, 0, 0, 0, s * p2].map(num).join(",")})`,
    origin: `${px(-box.x)} ${px(-box.y)}`,
    box,
    viewBox: `${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}`,
    clip: `polygon(${source
      .map(([x, y]) => `${px(x - box.x)} ${px(y - box.y)}`)
      .join(",")})`,
    visible: true,
  };
}

/** Apply a frame to an SVG element and its content group without React. */
export function applyPlaneOverlayFrame(
  element: SVGSVGElement | null,
  group: SVGGElement | null,
  frame: PlaneOverlayFrame,
) {
  if (!element) return;
  const style = element.style;
  if (!frame.visible) {
    if (style.visibility !== "hidden") style.visibility = "hidden";
    return;
  }
  const left = px(frame.box.x),
    top = px(frame.box.y),
    w = px(frame.box.w),
    h = px(frame.box.h);
  if (style.left !== left) style.left = left;
  if (style.top !== top) style.top = top;
  if (style.width !== w) style.width = w;
  if (style.height !== h) style.height = h;
  if (element.getAttribute("viewBox") !== frame.viewBox)
    element.setAttribute("viewBox", frame.viewBox);
  if (style.transformOrigin !== frame.origin)
    style.transformOrigin = frame.origin;
  if (style.transform !== frame.css) style.transform = frame.css;
  if (style.clipPath !== frame.clip) style.clipPath = frame.clip;
  if (group && group.getAttribute("transform") !== frame.group)
    group.setAttribute("transform", frame.group);
  if (style.visibility !== "visible") style.visibility = "visible";
}
