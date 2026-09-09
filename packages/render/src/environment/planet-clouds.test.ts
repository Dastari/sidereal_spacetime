import { expect, test } from "vitest";
import { buildPlanetClouds } from "./planet-clouds";
test("weather is deterministic, bounded at all details and zero coverage is empty", () => {
  const options = { seed: 348112, coverage: 0.45, detail: 96 as const };
  const a = buildPlanetClouds(options);
  expect(a).toEqual(buildPlanetClouds(options));
  expect(a).not.toEqual(buildPlanetClouds({ ...options, seed: 123 }));
  expect(buildPlanetClouds({ ...options, coverage: 0 }).faces).toBe(0);
  for (const detail of [24, 48, 96] as const) {
    const mesh = buildPlanetClouds({ ...options, coverage: 1, detail });
    expect(mesh.faces).toBeGreaterThan(0);
    expect(mesh.indices.length / 3).toBeLessThanOrEqual(108000);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.colors.length).toBe((mesh.positions.length / 3) * 4);
  }
});
test("weather has bounded radial volume and beveled cells", () => {
  const geometry = buildPlanetClouds({ seed: 42, coverage: 1, detail: 96 });
  let min = Infinity,
    max = 0;
  for (let i = 0; i < geometry.positions.length; i += 3) {
    const r = Math.hypot(...geometry.positions.slice(i, i + 3));
    min = Math.min(min, r);
    max = Math.max(max, r);
  }
  expect(min).toBeGreaterThan(1.05);
  expect(max).toBeLessThan(1.22);
  expect(max - min).toBeGreaterThan(0.07);
  expect(geometry.faces % 26).toBe(0);
});
test("cloud winding matches outward normals and tint is usable for smoke", () => {
  const geometry = buildPlanetClouds({
    seed: 3,
    coverage: 0.3,
    detail: 24,
    tint: [0.4, 0.3, 0.2],
  });
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const ids = geometry.indices.slice(i, i + 3),
      [a, b, c] = ids.map((id) => geometry.positions.slice(id * 3, id * 3 + 3));
    const ab = b.map((x, j) => x - a[j]),
      ac = c.map((x, j) => x - a[j]);
    const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ],
      n = geometry.normals.slice(ids[0] * 3, ids[0] * 3 + 3);
    expect(cross.reduce((sum, v, j) => sum + v * n[j], 0)).toBeGreaterThan(0);
  }
  expect(geometry.colors[0]).toBeLessThanOrEqual(0.4);
  expect(geometry.colors[1]).toBeLessThanOrEqual(0.3);
  expect(() =>
    buildPlanetClouds({ seed: 0, coverage: 2, detail: 96 }),
  ).toThrow();
});

test("weather evolves volume deterministically without rotating its carrier", () => {
  const options = { seed: 42, coverage: 0.8, detail: 48 as const };
  const initial = buildPlanetClouds(options);
  const evolved = buildPlanetClouds({ ...options, phase: 400 });
  expect(evolved).toEqual(buildPlanetClouds({ ...options, phase: 400 }));
  expect(evolved.positions).not.toEqual(initial.positions);
  const radii = (positions: number[]) => {
    let min = Infinity,
      max = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    return [min, max];
  };
  // Rigid shell rotation preserves radial bounds; actual weather changes them.
  expect(radii(evolved.positions)).not.toEqual(radii(initial.positions));
  const next = buildPlanetClouds({ ...options, phase: 8 });
  radii(next.positions).forEach((r, i) =>
    expect(Math.abs(r - radii(initial.positions)[i])).toBeLessThan(0.004),
  );
  // A tiny time step preserves topology and perturbs surviving cells smoothly.
  const near = buildPlanetClouds({ ...options, phase: 0.00001 });
  expect(near.indices).toEqual(initial.indices);
  let displacement = 0;
  near.positions.forEach((v, i) => {
    displacement = Math.max(displacement, Math.abs(v - initial.positions[i]));
  });
  expect(displacement).toBeGreaterThan(0);
  expect(displacement).toBeLessThan(0.000001);
  expect(() => buildPlanetClouds({ ...options, phase: Infinity })).toThrow();
});

test("full weather coverage remains bounded through its evolution", () => {
  for (const phase of [0, 120, 400, 900, 3600]) {
    const mesh = buildPlanetClouds({
      seed: 17,
      coverage: 1,
      detail: 96,
      phase,
    });
    expect(mesh.indices.length / 3).toBeLessThanOrEqual(90288);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(
      mesh.indices.every((i) => i >= 0 && i < mesh.positions.length / 3),
    ).toBe(true);
  }
});
