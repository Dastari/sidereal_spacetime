import { composeRockyReference as previousComposition } from "./rocky_reference_composition_r006";
import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeRockyReference } from "./rocky_reference_composition_r007";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/rocky-r006/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
const levels = ([0, 1, 2] as const).map((lod) =>
  composeRockyReference(kit, 24, lod),
);
it("retains exact major crater geometry, material roles and placement identity at each LOD", () => {
  const heroes = (level: (typeof levels)[number]) =>
    level.map((batch) =>
      batch.ranges
        .filter((r) => r.partId.startsWith("region-"))
        .map((r) => ({
          id: r.partId,
          positions: batch.positions.slice(
            r.firstTriangle * 9,
            (r.firstTriangle + r.triangleCount) * 9,
          ),
        })),
    );
  expect(heroes(levels[0])).toEqual(heroes(levels[2]));
  expect(
    new Set(
      levels[0].flatMap((b) =>
        b.ranges
          .filter((r) => r.partId.startsWith("region-"))
          .map((r) => r.partId),
      ),
    ).size,
  ).toBe(8);
  expect(composeRockyReference(kit, 24, 2)).toEqual(levels[2]);
  expect(composeRockyReference(kit, 25, 2)).not.toEqual(levels[2]);
});
it("preserves finite CCW native triangles, unit normals and exact complete placement ranges within budget", () => {
  for (const level of levels) {
    expect(level.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      100000,
    );
    for (const b of level) {
      expect([...b.positions, ...b.normals].every(Number.isFinite)).toBe(true);
      expect(b.ranges.reduce((n, r) => n + r.triangleCount, 0)).toBe(
        b.indices.length / 3,
      );
      let end = 0;
      for (const r of b.ranges) {
        expect(r.firstTriangle).toBe(end);
        end += r.triangleCount;
      }
      for (let i = 0; i < b.positions.length; i += 9) {
        const p = b.positions,
          n = b.normals,
          a = [p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]],
          c = [p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]],
          cross = [
            a[1] * c[2] - a[2] * c[1],
            a[2] * c[0] - a[0] * c[2],
            a[0] * c[1] - a[1] * c[0],
          ];
        expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 5);
        expect(
          cross[0] * n[i] + cross[1] * n[i + 1] + cross[2] * n[i + 2],
        ).toBeGreaterThan(0);
      }
    }
  }
});
it("excavates the native substrate and lowers crater floors beneath the general surface", () => {
  const ground = levels[0][0].ranges.find((r) => r.partId === "ground")!;
  const p = levels[0][0].positions.slice(
    ground.firstTriangle * 9,
    (ground.firstTriangle + ground.triangleCount) * 9,
  );
  let minimum = 1;
  for (let i = 0; i < p.length; i += 3)
    minimum = Math.min(minimum, Math.hypot(p[i], p[i + 1], p[i + 2]));
  expect(minimum).toBeLessThan(0.97);
  const dark = levels[0][2];
  let below = 0;
  for (const r of dark.ranges.filter((r) => r.partId.startsWith("region-"))) {
    const v = dark.positions.slice(
      r.firstTriangle * 9,
      (r.firstTriangle + r.triangleCount) * 9,
    );
    for (let i = 0; i < v.length; i += 3)
      if (Math.hypot(v[i], v[i + 1], v[i + 2]) < 0.98) below++;
  }
  expect(below).toBeGreaterThan(100);
  expect(() => composeRockyReference({ ...kit, variants: [] }, 1, 0)).toThrow(
    "Missing rocky native variant",
  );
});

it("clears the single diagnostic bowl floor with the actual triangulated substrate", () => {
  const level = composeRockyReference(kit, 38, 0, true),
    nn = [0.452, 0.388, 0.794],
    length = Math.hypot(...nn),
    d = nn.map((x) => x / length);
  const hits = (batch: (typeof level)[number], id: string) => {
    let outer = 0;
    const cross = (a: number[], b: number[]) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    const dot = (a: number[], b: number[]) =>
      a.reduce((sum, x, i) => sum + x * b[i], 0);
    for (const r of batch.ranges.filter((r) => r.partId === id))
      for (
        let i = r.firstTriangle * 9;
        i < (r.firstTriangle + r.triangleCount) * 9;
        i += 9
      ) {
        const p = Array.from(batch.positions.slice(i, i + 9)),
          a = p.slice(0, 3),
          e1 = p.slice(3, 6).map((x, k) => x - a[k]),
          e2 = p.slice(6, 9).map((x, k) => x - a[k]);
        const h = cross(d, e2),
          det = dot(e1, h);
        if (Math.abs(det) < 1e-8) continue;
        const s = a.map((x) => -x),
          u = dot(s, h) / det,
          q = cross(s, e1),
          v = dot(d, q) / det,
          t = dot(e2, q) / det;
        if (u >= -1e-5 && v >= -1e-5 && u + v <= 1.00001 && t > outer)
          outer = t;
      }
    return outer;
  };
  const ground = hits(level[0], "ground"),
    floor = hits(level[2], "region-diagnostic");
  expect(ground).toBeGreaterThan(0.86);
  expect(floor).toBeGreaterThan(ground + 0.003);
  expect(floor).toBeLessThan(0.97);
  expect(new Set(level.flatMap((b) => b.ranges.map((r) => r.partId)))).toEqual(
    new Set(["ground", "region-diagnostic"]),
  );
});

it("changes only transformed normals, preserving prior positions, indices and placement ranges", () => {
  for (const lod of [0, 1, 2] as const) {
    const previous = previousComposition(kit, 38, lod),
      next = composeRockyReference(kit, 38, lod);
    for (let i = 0; i < next.length; i++) {
      const a = next[i],
        b = previous[i];
      expect(
        Buffer.from(
          a.positions.buffer,
          a.positions.byteOffset,
          a.positions.byteLength,
        ).equals(
          Buffer.from(
            b.positions.buffer,
            b.positions.byteOffset,
            b.positions.byteLength,
          ),
        ),
      ).toBe(true);
      expect(
        Buffer.from(
          a.indices.buffer,
          a.indices.byteOffset,
          a.indices.byteLength,
        ).equals(
          Buffer.from(
            b.indices.buffer,
            b.indices.byteOffset,
            b.indices.byteLength,
          ),
        ),
      ).toBe(true);
      expect(a.ranges).toEqual(b.ranges);
    }
    expect(
      next.some((b, i) =>
        b.normals.some((v, j) => Math.abs(v - previous[i].normals[j]) > 1e-5),
      ),
    ).toBe(true);
    let valid = true;
    for (const b of next)
      for (let i = 0; i < b.normals.length; i += 3) {
        const length = Math.hypot(
          b.normals[i],
          b.normals[i + 1],
          b.normals[i + 2],
        );
        if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-5)
          valid = false;
      }
    expect(valid).toBe(true);
  }
});
