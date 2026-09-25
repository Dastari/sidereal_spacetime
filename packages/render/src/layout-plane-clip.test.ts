import { expect, it } from "vitest";
import { layoutPlaneClip } from "./layout-plane-clip";
function assertClipped(m: number[]) {
  const p = layoutPlaneClip(m, 1000, 700);
  expect(p.length).toBeGreaterThanOrEqual(3);
  for (const [x, y] of p) {
    const w = m[3] * x + m[7] * y + m[15],
      sx = (m[0] * x + m[4] * y + m[12]) / w,
      sy = (m[1] * x + m[5] * y + m[13]) / w;
    expect(w).toBeGreaterThanOrEqual(0.001 - 1e-8);
    expect(sx).toBeGreaterThanOrEqual(-1e-6);
    expect(sx).toBeLessThanOrEqual(1000 + 1e-6);
    expect(sy).toBeGreaterThanOrEqual(-1e-6);
    expect(sy).toBeLessThanOrEqual(700 + 1e-6);
  }
  return p;
}
it("preserves exact visible source plane in affine view", () => {
  expect(
    assertClipped([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 500, 350, 0, 1]),
  ).toHaveLength(4);
});
it("clips a perspective plane crossing behind camera without mirrored overflow", () => {
  for (const slope of [-0.02, -0.001, 0.001, 0.02])
    assertClipped([
      2,
      0.5,
      0,
      0.003,
      -0.3,
      1.5,
      0,
      slope,
      0,
      0,
      1,
      0,
      500,
      350,
      0,
      1,
    ]);
});
it("hides invalid or completely rearward planes", () => {
  expect(
    layoutPlaneClip(
      [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1],
      1000,
      700,
    ),
  ).toEqual([]);
  expect(layoutPlaneClip([NaN], 1000, 700)).toEqual([]);
});
