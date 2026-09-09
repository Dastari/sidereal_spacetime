import { expect, test } from "vitest";
import { buildPlanetCrystals } from "./planet-crystals";
import type { PlanetTreePlacement } from "./planet-decorations";
const placement: PlanetTreePlacement = {
  position: [0, 0, 0],
  normal: [1, 2, 3],
  seed: 9,
};
test("pointed clusters are deterministic, bounded and strength zero is empty", () => {
  const a = buildPlanetCrystals([placement]);
  expect(a).toEqual(buildPlanetCrystals([placement]));
  expect(a.crystalCount).toBeGreaterThanOrEqual(2);
  expect(a.crystalCount).toBeLessThanOrEqual(3);
  expect(a.indices.length / 3).toBe(a.crystalCount * 24);
  expect(buildPlanetCrystals([placement], 0).indices).toEqual([]);
  const max = buildPlanetCrystals(
    Array.from({ length: 400 }, (_, seed) => ({ ...placement, seed })),
  );
  expect(max.crystalCount).toBeLessThanOrEqual(1200);
  expect(max.indices.length / 3).toBeLessThan(30000);
  expect(() => buildPlanetCrystals(Array(401).fill(placement))).toThrow();
});
test("geometry follows radial up with small lateral footprint and pointed tips", () => {
  const g = buildPlanetCrystals([placement]),
    length = Math.hypot(...placement.normal),
    up = placement.normal.map((n) => n / length);
  let maxHeight = 0;
  for (let i = 0; i < g.positions.length; i += 3) {
    const p = g.positions.slice(i, i + 3),
      h = p.reduce((sum, n, k) => sum + n * up[k], 0);
    expect(h).toBeGreaterThanOrEqual(-1e-10);
    maxHeight = Math.max(maxHeight, h);
    expect(Math.hypot(...p.map((n, k) => n - h * up[k]))).toBeLessThan(0.045);
    expect(Math.hypot(...g.normals.slice(i, i + 3))).toBeCloseTo(1);
  }
  expect(maxHeight).toBeGreaterThanOrEqual(0.11);
  expect(maxHeight).toBeLessThanOrEqual(0.16);
  expect(g.positions.every(Number.isFinite)).toBe(true);
});
test("faceted prism winding agrees with outward normals and invalid values reject", () => {
  const g = buildPlanetCrystals([placement]);
  for (let i = 0; i < g.indices.length; i += 3) {
    const ids = g.indices.slice(i, i + 3),
      [a, b, c] = ids.map((id) => g.positions.slice(id * 3, id * 3 + 3)),
      ab = b.map((n, k) => n - a[k]),
      ac = c.map((n, k) => n - a[k]);
    const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ],
      normal = g.normals.slice(ids[0] * 3, ids[0] * 3 + 3);
    expect(cross.reduce((sum, n, k) => sum + n * normal[k], 0)).toBeGreaterThan(
      0,
    );
  }
  expect(() =>
    buildPlanetCrystals([{ ...placement, normal: [0, 0, 0] }]),
  ).toThrow();
  expect(() => buildPlanetCrystals([placement], NaN)).toThrow();
});
