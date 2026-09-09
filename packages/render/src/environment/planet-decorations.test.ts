import { expect, test } from "vitest";
import {
  buildPlanetTrees,
  type PlanetTreePlacement,
} from "./planet-decorations";
const placement: PlanetTreePlacement = {
  position: [0, 1, 0],
  normal: [0, 1, 0],
  seed: 348112,
};
test("small forest geometry is deterministic and a single bounded batch", () => {
  const a = buildPlanetTrees([placement]);
  expect(a).toEqual(buildPlanetTrees([placement]));
  expect(a).not.toEqual(buildPlanetTrees([{ ...placement, seed: 12 }]));
  expect(a.treeCount).toBe(1);
  expect(a.positions.length / 3).toBe(96);
  expect(a.indices.length / 3).toBe(48);
  expect(a.colors.length).toBe((a.positions.length / 3) * 4);
  expect(buildPlanetTrees([]).indices).toEqual([]);
  expect(() => buildPlanetTrees(Array(2401).fill(placement))).toThrow(/budget/);
});
test("trunks and crowns follow any radial up with bounded height and no subterranean corners", () => {
  for (const normal of [
    [0, 1, 0],
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, -1],
    [1, 2, 3],
  ] as [number, number, number][]) {
    const length = Math.hypot(...normal),
      up = normal.map((n) => n / length);
    const geometry = buildPlanetTrees([
      { position: [0, 0, 0], normal, seed: 2 },
    ]);
    let maxHeight = 0;
    for (let i = 0; i < geometry.positions.length; i += 3) {
      const point = geometry.positions.slice(i, i + 3),
        height = point.reduce((sum, n, k) => sum + n * up[k], 0);
      expect(height).toBeGreaterThanOrEqual(-1e-10);
      maxHeight = Math.max(maxHeight, height);
      expect(Math.hypot(...point)).toBeLessThan(0.024);
      expect(Math.hypot(...geometry.normals.slice(i, i + 3))).toBeCloseTo(1);
    }
    expect(maxHeight).toBeGreaterThanOrEqual(0.0105);
    expect(maxHeight).toBeLessThanOrEqual(0.021);
  }
});
test("outward normal agrees with triangle winding and invalid placements are rejected", () => {
  const geometry = buildPlanetTrees([placement]);
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const [a, b, c] = geometry.indices
      .slice(i, i + 3)
      .map((index) => geometry.positions.slice(index * 3, index * 3 + 3));
    const ab = b.map((n, k) => n - a[k]),
      ac = c.map((n, k) => n - a[k]);
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const normal = geometry.normals.slice(
      geometry.indices[i] * 3,
      geometry.indices[i] * 3 + 3,
    );
    expect(cross.reduce((sum, n, k) => sum + n * normal[k], 0)).toBeGreaterThan(
      0,
    );
  }
  expect(() =>
    buildPlanetTrees([{ ...placement, normal: [0, 0, 0] }]),
  ).toThrow();
  expect(() => buildPlanetTrees([{ ...placement, seed: NaN }])).toThrow();
});
test("hero foliage enlarges in a bounded merged batch while distant defaults stay small", () => {
  const hero = buildPlanetTrees(Array.from({length:800},(_,i)=>({...placement,seed:i})), {scale:3.6,puffy:true});
  expect(hero.indices.length / 3).toBe(76800);
  expect(hero.treeCount).toBe(800);
  const one=buildPlanetTrees([placement],{scale:3.6,puffy:true});
  let height=0;
  for(let i=1;i<one.positions.length;i+=3) height=Math.max(height,one.positions[i]-1);
  expect(height).toBeGreaterThan(.037);
  expect(height).toBeLessThan(.077);
  expect(()=>buildPlanetTrees([placement],{scale:4.1})).toThrow();
});
