import { describe, expect, it } from "vitest";
import { planeOverlayFrame } from "./plane-overlay-transform";

/** Apply a column-major CSS matrix3d to a plane point (z = 0). */
function homography(m: readonly number[], x: number, y: number) {
  const X = m[0] * x + m[4] * y + m[12],
    Y = m[1] * x + m[5] * y + m[13],
    W = m[3] * x + m[7] * y + m[15];
  return [X / W, Y / W];
}
function parseMatrix(text: string) {
  return text
    .replace(/^matrix3?d?\(|\)$/g, "")
    .split(/[\s,]+/)
    .map(Number);
}
/** Compose the frame's SVG affine and CSS perspective exactly like the browser. */
function composed(
  frame: ReturnType<typeof planeOverlayFrame>,
  x: number,
  y: number,
) {
  const [a, b, c, d, e, f] = parseMatrix(frame.group);
  const ax = a * x + c * y + e,
    ay = b * x + d * y + f;
  if (!frame.css) return [ax, ay];
  const m = parseMatrix(frame.css);
  const X = m[0] * ax + m[4] * ay + m[12],
    Y = m[1] * ax + m[5] * ay + m[13],
    W = m[3] * ax + m[7] * ay + m[15];
  return [X / W, Y / W];
}

// A perspective plane matrix captured from the live editor (3D projection).
const perspective = [
  40.0836, 2.10275, 0, -0.000326, -5.52971, 37.087, 0, -0.0057513, 0, 0, 1, 0,
  5536.14, 5892.74, 0, 9.11687,
];
// Orthographic top view: no perspective row.
const orthographic = [4.4, 0, 0, 0, 0, -4.4, 0, 0, 0, 0, 1, 0, 300, 500, 0, 1];

describe("plane overlay transform split", () => {
  it("reproduces the original homography for in-view plane points", () => {
    const frame = planeOverlayFrame(perspective, 1129, 870);
    expect(frame.visible).toBe(true);
    expect(frame.css).toMatch(/^matrix3d\(/);
    for (const [x, y] of [
      [0, 0],
      [64, 0],
      [0, -64],
      [-128, 96],
      [200, -300],
    ]) {
      const [ex, ey] = homography(perspective, x, y);
      const [cx, cy] = composed(frame, x, y);
      expect(cx).toBeCloseTo(ex, 3);
      expect(cy).toBeCloseTo(ey, 3);
    }
  });
  it("keeps the element box near the viewport instead of the zoomed plane", () => {
    const frame = planeOverlayFrame(perspective, 1129, 870);
    expect(frame.box.w).toBeLessThan(1129 * 16);
    expect(frame.box.h).toBeLessThan(870 * 16);
    expect(frame.clip).toMatch(/^polygon\(/);
    expect(frame.origin).toBe(
      `${-Math.round(frame.box.x * 100) / 100}px ${-Math.round(frame.box.y * 100) / 100}px`,
    );
  });
  it("uses a plain SVG affine and no CSS transform for orthographic views", () => {
    const frame = planeOverlayFrame(orthographic, 800, 600);
    expect(frame.css).toBe("");
    expect(frame.clip).toBe("");
    expect(frame.box).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    const [ex, ey] = homography(orthographic, 32, -32);
    const [cx, cy] = composed(frame, 32, -32);
    expect(cx).toBeCloseTo(ex, 6);
    expect(cy).toBeCloseTo(ey, 6);
  });
  it("hides degenerate or non-finite projections", () => {
    expect(planeOverlayFrame([], 800, 600).visible).toBe(false);
    expect(
      planeOverlayFrame(
        perspective.map((v, i) => (i === 15 ? 0 : v)),
        800,
        600,
      ).visible,
    ).toBe(false);
    expect(planeOverlayFrame(orthographic, 0, 600).visible).toBe(false);
  });
});
