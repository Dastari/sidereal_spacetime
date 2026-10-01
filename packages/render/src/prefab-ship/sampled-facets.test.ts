import { describe, it, expect } from "vitest";
import {
  compileShipVisual,
  sampleShipVisualLayers,
  removeShipVisualCells,
  visualCellKey,
} from "@sidereal/sim/ship-visual-compiler";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import { meshSampledStructure } from "./sampled-structure";
import { sampledFacetBoundary } from "./sampled-facets";

const fixture = () => {
  const layers: ShipVisualLayer[] = [];
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4 - x; y++)
      layers.push({
        id: `c:${x}:${y}`,
        role: "core",
        slot: "secondary",
        support: "hull",
        bounds: [x, y, 0, x + 1, y + 1, 3],
        ...(x + y === 3
          ? {
              facet: {
                id: "side",
                a: [1, 1, 0] as [number, number, number],
                d: 4,
              },
            }
          : {}),
      });
  return sampleShipVisualLayers(layers);
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
function closed(cells: ReturnType<typeof fixture>) {
  const edges = new Map<string, number>();
  for (const g of meshSampledStructure(cells))
    for (let t = 0; t < g.indices.length; t += 3) {
      const p = Array.from(g.indices.slice(t, t + 3), (i) =>
        Array.from(g.positions.slice(i * 3, i * 3 + 3), (v) => v * 16),
      );
      const a = p[1].map((n, i) => n - p[0][i]),
        b = p[2].map((n, i) => n - p[0][i]);
      const n = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
      expect(Math.hypot(...n)).toBeGreaterThan(0);
      expect(
        n.reduce((s, v, i) => s + v * g.normals[g.indices[t] * 3 + i], 0),
      ).toBeGreaterThan(0);
      for (const v of p) expect(v.every(Number.isInteger)).toBe(true);
      for (let i = 0; i < 3; i++) {
        const a = p[i],
          b = p[(i + 1) % 3],
          d = b.map((n, j) => n - a[j]);
        const count = d.reduce((n, v) => gcd(n, Math.abs(v)), 0);
        for (let s = 0; s < count; s++) {
          const A = a.map((n, j) => n + (d[j] * s) / count).join(","),
            B = a.map((n, j) => n + (d[j] * (s + 1)) / count).join(",");
          const key = [A, B].sort().join("|");
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
    }
  expect([...edges.values()].every((n) => n === 2)).toBe(true);
}
describe("supported manufactured facet union", () => {
  it("seals the raw-neighbor complements and merges only fully supported signed45 cells", () => {
    const cells = fixture();
    closed(cells);
    const faces = sampledFacetBoundary(cells).polygons;
    const planes = faces.filter((f) => f.plane);
    expect(planes).toHaveLength(1);
    expect(planes[0].points).toHaveLength(4);
    for (const p of planes[0].points) expect(p[0] + p[1]).toBe(4);
    expect(Math.max(...planes[0].points.map((p) => p[2]))).toBe(3);
    expect(faces.some((f) => !f.plane && f.points.length === 3)).toBe(true);
  });
  it("rebuilds hard closed damage contours locally without a sheet across the removed cell and repairs exactly", () => {
    const cells = fixture(),
      before = meshSampledStructure(cells);
    for (const key of [
      visualCellKey(1, 2, 1),
      visualCellKey(0, 3, 0),
      visualCellKey(2, 1, 2),
    ]) {
      const cut = removeShipVisualCells(cells, new Set([key]));
      closed(cut);
      const f = sampledFacetBoundary(cut).polygons;
      expect(
        f.some(
          (p) =>
            !p.plane &&
            p.points.every((v) => v[2] === Number(key.split(",")[2])),
        ),
      ).toBe(true);
      const repaired = new Map(cut);
      repaired.set(key, cells.get(key)!);
      expect(meshSampledStructure(repaired)).toEqual(before);
    }
  });
  it("keeps translated positive/negative XY/XZ/YZ facets on integer vertices within one cell", () => {
    for (const inactive of [0, 1, 2])
      for (const s of [-1, 1])
        for (const t of [-1, 1]) {
          const a: [number, number, number] = [0, 0, 0],
            axes = [0, 1, 2].filter((i) => i !== inactive);
          a[axes[0]] = s;
          a[axes[1]] = t;
          const origin = [-7, 9, -13],
            d = a.reduce((n, v, i) => n + v * (origin[i] + 0.5), 0);
          const cells = sampleShipVisualLayers([
            {
              id: "single",
              role: "core",
              slot: "secondary",
              bounds: [
                ...origin,
                ...origin.map((n) => n + 1),
              ] as ShipVisualLayer["bounds"],
              facet: { id: "single", a, d },
            },
          ]);
          closed(cells);
          for (const face of sampledFacetBoundary(cells).polygons)
            for (const p of face.points) {
              expect(p.every(Number.isInteger)).toBe(true);
              expect(
                p.every((n, i) => n >= origin[i] && n <= origin[i] + 1),
              ).toBe(true);
              expect(
                a.reduce((n, v, i) => n + v * p[i], 0),
              ).toBeLessThanOrEqual(d);
            }
        }
  });
  it("rejects incompatible planes even across an edge/corner without a raw guard", () => {
    const cells = fixture(),
      c = cells.get(visualCellKey(1, 2, 0))!;
    c.facet = { id: "other", a: [1, 1, 0], d: 4 };
    expect(() => sampledFacetBoundary(cells)).toThrow(/Chebyshev/);
  });
  it("preserves original neighbor chart/optical shading while complements and fresh cuts stay hard", () => {
    const original = fixture();
    const layers: ShipVisualLayer[] = [...original.values()].map((c) => ({
      id: visualCellKey(c.x, c.y, c.z),
      role: c.role,
      slot: c.slot,
      support: c.family,
      bounds: [c.x, c.y, c.z, c.x + 1, c.y + 1, c.z + 1],
      ...(c.facet ? { facet: c.facet } : {}),
      ...(c.x === 1 && c.y === 1
        ? {
            normalChart: "raw-slope",
            normalHint: [0, Math.SQRT1_2, Math.SQRT1_2] as [
              number,
              number,
              number,
            ],
          }
        : {}),
    }));
    layers.push({
      id: "raw-cap",
      role: "core",
      slot: "secondary",
      support: "hull",
      bounds: [1, 2, 3, 2, 3, 4],
      normalChart: "raw-slope",
      normalHint: [0, Math.SQRT1_2, Math.SQRT1_2],
    });
    const intact = sampleShipVisualLayers(layers);
    const inspect = (cells: typeof intact) =>
      meshSampledStructure(cells, { ambientOcclusion: true }).flatMap((g) =>
        Array.from({ length: g.indices.length / 3 }, (_, t) => {
          const ids = Array.from(g.indices.slice(t * 3, t * 3 + 3));
          return {
            centre: [0, 1, 2].map((a) =>
              ids.reduce((n, i) => n + (g.positions[i * 3 + a] * 16) / 3, 0),
            ),
            normal: Array.from(g.normals.slice(ids[0] * 3, ids[0] * 3 + 3)),
            colors: ids.flatMap((i) =>
              Array.from(g.colors!.slice(i * 4, i * 4 + 4)),
            ),
          };
        }),
      );
    const faces = inspect(intact),
      top = faces.filter(
        (f) =>
          f.centre[2] === 3 &&
          f.centre[0] > 1 &&
          f.centre[0] < 2 &&
          f.centre[1] > 1 &&
          f.centre[1] < 2,
      );
    expect(top.length).toBeGreaterThan(0);
    for (const f of top) {
      expect(f.normal).toEqual([
        0,
        Math.fround(Math.SQRT1_2),
        Math.fround(Math.SQRT1_2),
      ]);
      expect(f.colors.every((v) => v === 1)).toBe(true);
    }
    const complement = faces.filter(
      (f) =>
        f.centre[2] === 3 &&
        f.centre[0] > 1 &&
        f.centre[0] < 2 &&
        f.centre[1] > 2 &&
        f.centre[1] < 3,
    );
    expect(complement.length).toBeGreaterThan(0);
    for (const f of complement) expect(f.normal).toEqual([0, 0, -1]);
    const damaged = removeShipVisualCells(
      intact,
      new Set([visualCellKey(1, 1, 2)]),
    );
    const cuts = inspect(damaged).filter(
      (f) =>
        f.centre[2] === 2 &&
        f.centre[0] > 1 &&
        f.centre[0] < 2 &&
        f.centre[1] > 1 &&
        f.centre[1] < 2,
    );
    expect(cuts.length).toBeGreaterThan(0);
    for (const f of cuts) expect(f.normal).toEqual([0, 0, 1]);
    const optical = sampleShipVisualLayers(
      layers.map((l) =>
        l.bounds[0] === 1 && l.bounds[1] === 1
          ? {
              ...l,
              slot: "glass",
              normalChart: undefined,
              normalHint: undefined,
            }
          : l,
      ),
    );
    const opticalTop = inspect(optical).filter(
      (f) =>
        f.centre[2] === 3 &&
        f.centre[0] > 1 &&
        f.centre[0] < 2 &&
        f.centre[1] > 1 &&
        f.centre[1] < 2,
    );
    for (const f of opticalTop)
      expect(f.colors.every((v) => v === 1)).toBe(true);
  });
});

describe("actual common outer signed45 finish exposure", () => {
  it("emits the first visible primary armor/lip plane across upper, body and lower height ranges", () => {
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const doc = PREFAB_SHIPS.find((s) => s.id === id)!;
      const result = compileShipVisual(
        doc,
        defaultPrefabComponentCatalog(),
        "deck",
        "federation",
        undefined,
        "r002",
      );
      const faces = sampledFacetBoundary(result.cells).polygons;
      const allFaces: { slot: string; points: number[][]; normal: number[] }[] =
        [];
      for (const g of meshSampledStructure(result.cells))
        for (let t = 0; t < g.indices.length; t += 3) {
          const points = [...g.indices.slice(t, t + 3)].map((i) =>
            [...g.positions.slice(i * 3, i * 3 + 3)].map((v) => v * 16),
          );
          const a = points[1].map((v, i) => v - points[0][i]),
            b = points[2].map((v, i) => v - points[0][i]);
          const n = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ];
          const length = Math.hypot(...n);
          allFaces.push({
            slot: g.slot,
            points,
            normal: n.map((v) => v / length),
          });
        }
      const primary = faces.filter(
        (f) => f.plane && f.cell.slot === "primary" && f.cell.facet!.a[2] === 0,
      );
      expect(primary.length, id).toBeGreaterThan(10);
      const seen = new Set<string>();
      for (const f of primary) {
        const minZ = Math.min(...f.points.map((p) => p[2])),
          maxZ = Math.max(...f.points.map((p) => p[2]));
        const key = `${f.cell.family}:${f.cell.facet!.d}:${minZ}:${maxZ}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const centre = f.points[0].map((_, i) =>
          f.points.reduce((n, p) => n + p[i] / f.points.length, 0),
        );
        const origin = centre.map((v, i) => v + f.normal[i] * 8);
        const direction = f.normal.map((v) => -v);
        let nearest = Infinity;
        let first: (typeof allFaces)[number] | undefined;
        for (const other of allFaces) {
          const denominator = other.normal.reduce(
            (n, v, i) => n + v * direction[i],
            0,
          );
          if (Math.abs(denominator) < 1e-8) continue;
          const t =
            other.normal.reduce(
              (n, v, i) => n + v * (other.points[0][i] - origin[i]),
              0,
            ) / denominator;
          if (t < -1e-8 || t >= nearest) continue;
          const point = origin.map((v, i) => v + direction[i] * t);
          const inside = other.points.every((p, i) => {
            const q = other.points[(i + 1) % other.points.length];
            const a = q.map((v, j) => v - p[j]),
              b = point.map((v, j) => v - p[j]);
            const cross = [
              a[1] * b[2] - a[2] * b[1],
              a[2] * b[0] - a[0] * b[2],
              a[0] * b[1] - a[1] * b[0],
            ];
            return (
              cross.reduce((n, v, j) => n + v * other.normal[j], 0) >= -1e-8
            );
          });
          if (inside) {
            nearest = t;
            first = other;
          }
        }
        expect(first?.slot, `${id}:${key}`).toBe("primary");
        expect(nearest, `${id}:${key}`).toBeCloseTo(8, 8);
        for (let axis = 0; axis < 3; axis++)
          expect(first?.normal[axis]).toBeCloseTo(f.normal[axis], 8);
        const hit = origin.map((v, i) => v + direction[i] * nearest);
        expect(
          f.cell.facet!.a.reduce((n, v, i) => n + v * hit[i], 0),
        ).toBeCloseTo(f.cell.facet!.d, 8);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  }, 20000);
});
