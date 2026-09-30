import { describe, expect, it } from "vitest";
import {
  sampleShipVisualLayers,
  visualCellKey,
  removeShipVisualCells,
} from "@sidereal/sim/ship-visual-compiler";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import { meshSampledStructure } from "./sampled-structure";

describe("sampled exposed surfaces", () => {
  it("preserves separately qualified diagonal sides and shoulders, while new cuts and original end caps stay hard", () => {
    const sideNormal: [number, number, number] = [
      Math.SQRT1_2,
      Math.SQRT1_2,
      0,
    ];
    const shoulder: [number, number, number] = [
      1 / Math.sqrt(6),
      1 / Math.sqrt(6),
      2 / Math.sqrt(6),
    ];
    const layers: ShipVisualLayer[] = [];
    for (let x = 0; x < 7; x++)
      for (let y = 0; y < 7 - x; y++) {
        const exposed = x + y === 6 && x > 0 && y > 0;
        layers.push({
          id: `column:${x}:${y}`,
          role: "core",
          slot: "secondary",
          bounds: [x, y, 0, x + 1, y + 1, 2 + Math.floor((6 - x - y) / 2)],
          normalChart: "shoulder",
          normalHint: shoulder,
          ...(exposed
            ? {
                normalSide: {
                  id: "original-diagonal",
                  normal: sideNormal,
                  faces: 10,
                },
              }
            : {}),
        });
      }
    const intact = sampleShipVisualLayers(layers);
    const ordinary = sampleShipVisualLayers(
      layers.map(({ normalSide, normalChart, normalHint, ...l }) => l),
    );
    expect([...intact.keys()]).toEqual([...ordinary.keys()]);
    const inspect = (cells: typeof intact) =>
      meshSampledStructure(cells, { ambientOcclusion: true }).flatMap((g) => {
        const rows: { centre: number[]; normal: number[]; color: number[] }[] =
          [];
        for (let i = 0; i < g.indices.length; i += 3) {
          const vs = Array.from(g.indices.slice(i, i + 3));
          rows.push({
            centre: [0, 1, 2].map(
              (a) => vs.reduce((n, v) => n + g.positions[v * 3 + a], 0) / 3,
            ),
            normal: Array.from(g.normals.slice(vs[0] * 3, vs[0] * 3 + 3)),
            color: Array.from(g.colors!.slice(vs[0] * 4, vs[0] * 4 + 4)),
          });
        }
        return rows;
      });
    const faces = inspect(intact);
    const sides = faces.filter(
      (f) => f.normal[2] === 0 && f.normal[0] > 0.6 && f.normal[1] > 0.6,
    );
    expect(sides.length).toBeGreaterThan(0);
    for (const f of sides) {
      expect(f.normal).toEqual(sideNormal.map(Math.fround));
      expect(f.color).toEqual([1, 1, 1, 1]);
    }
    expect(
      faces.some((f) =>
        f.normal.every((n, a) => n === Math.fround(shoulder[a])),
      ),
    ).toBe(true);
    const ends = faces.filter((f) => f.centre[0] === 0);
    expect(ends.length).toBeGreaterThan(0);
    for (const f of ends) expect(f.normal).toEqual([-1, 0, 0]);
    const damaged = removeShipVisualCells(
      intact,
      new Set([visualCellKey(4, 2, 0)]),
    );
    const cuts = inspect(damaged).filter(
      (f) =>
        f.centre[0] === 4 / 16 &&
        f.centre[1] > 2 / 16 &&
        f.centre[1] < 3 / 16 &&
        f.centre[2] < 1 / 16,
    );
    expect(cuts.length).toBeGreaterThan(0);
    for (const f of cuts) expect(f.normal).toEqual([1, 0, 0]);
    expect(cuts.some((f) => f.color[0] < 1)).toBe(true);
    expect(
      meshSampledStructure(sampleShipVisualLayers(layers), {
        ambientOcclusion: true,
      }),
    ).toEqual(meshSampledStructure(intact, { ambientOcclusion: true }));
  });

  it("greedily merges a solid prism to six quads and retains global UV phase", () => {
    const cells = sampleShipVisualLayers([
      {
        id: "floor",
        role: "core",
        slot: "dark",
        bounds: [-16, 0, 0, 16, 16, 2],
      },
    ]);
    const [g] = meshSampledStructure(cells);
    expect(g.triangles).toBe(12);
    expect(
      Math.max(...Array.from(g.positions).filter((_, i) => i % 3 === 2)),
    ).toBe(0.125);
    expect(
      Math.min(...Array.from(g.positions).filter((_, i) => i % 3 === 1)),
    ).toBe(0);
    expect(g.uvs.length).toBe((g.positions.length / 3) * 2);
    expect(Math.min(...g.uvs)).toBeLessThan(0);
    for (let i = 0; i < g.indices.length; i += 3) {
      const [a, b, c] = Array.from(g.indices.slice(i, i + 3)),
        p = g.positions;
      const u = [
          p[b * 3] - p[a * 3],
          p[b * 3 + 1] - p[a * 3 + 1],
          p[b * 3 + 2] - p[a * 3 + 2],
        ],
        v = [
          p[c * 3] - p[a * 3],
          p[c * 3 + 1] - p[a * 3 + 1],
          p[c * 3 + 2] - p[a * 3 + 2],
        ];
      const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      expect(
        n[0] * g.normals[a * 3] +
          n[1] * g.normals[a * 3 + 1] +
          n[2] * g.normals[a * 3 + 2],
      ).toBeGreaterThan(0);
    }
  });
  it("reveals cut surfaces and restores deterministic mesh and coordinates", () => {
    const layers = [
      {
        id: "core",
        role: "core" as const,
        slot: "dark" as const,
        bounds: [0, 0, 0, 4, 4, 4] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
      },
    ];
    const base = sampleShipVisualLayers(layers),
      before = meshSampledStructure(base);
    const damaged = removeShipVisualCells(
      base,
      new Set([visualCellKey(0, 0, 0)]),
    );
    expect(meshSampledStructure(damaged)[0].triangles).toBeGreaterThan(
      before[0].triangles,
    );
    expect(meshSampledStructure(sampleShipVisualLayers(layers))).toEqual(
      before,
    );
  });
  it("shades shallow intact roof treads and risers while keeping removed-cell cuts and patch edges hard", () => {
    const normal: [number, number, number] = [
      -0.25 / Math.hypot(0.25, 1),
      0,
      1 / Math.hypot(0.25, 1),
    ];
    const layers: ShipVisualLayer[] = [
      { id: "backing", role: "core", slot: "dark", bounds: [0, 0, 0, 8, 2, 1] },
    ];
    for (let x = 0; x < 8; x++) {
      const height = Math.floor(x * 0.25) + 2;
      layers.push({
        id: `roof:${x}`,
        role: "plate",
        slot: "primary",
        bounds: [x, 0, 1, x + 1, 2, height],
        normalHint: normal,
        normalChart: "intact-plane",
        // A deliberately overlapping descriptor proves the upper chart wins on
        // its intact riser, rather than losing the positive-Z chamfer normal.
        ...(x === 4
          ? {
              normalSide: {
                id: "riser-side",
                normal: [-1, 0, 0] as [number, number, number],
                faces: 1,
              },
            }
          : {}),
      });
    }
    const intact = sampleShipVisualLayers(layers);
    expect(
      intact.get(visualCellKey(4, 0, 2))!.normalFaces! &
        intact.get(visualCellKey(4, 0, 2))!.normalSideFaces!,
    ).toBe(1);
    const withoutCharts = sampleShipVisualLayers(
      layers.map(({ normalHint, normalChart, ...l }) => l),
    );
    expect([...intact.keys()]).toEqual([...withoutCharts.keys()]);
    // A pre-existing hint without chart qualification retains the old axis/dot behavior.
    const legacyHints = sampleShipVisualLayers(
      layers.map(({ normalChart, ...l }) => l),
    );
    for (const g of meshSampledStructure(legacyHints))
      for (let i = 0; i < g.normals.length; i += 3)
        expect(
          Array.from(g.normals.slice(i, i + 3)).filter((n) => Math.abs(n) === 1)
            .length,
        ).toBe(1);

    const normalsAt = (cells: typeof intact, match: (p: number[]) => boolean) =>
      meshSampledStructure(cells).flatMap((g) => {
        const rows: number[][] = [];
        for (let i = 0; i < g.indices.length; i += 3) {
          const vs = Array.from(g.indices.slice(i, i + 3));
          const centre = [0, 1, 2].map(
            (a) => vs.reduce((sum, v) => sum + g.positions[v * 3 + a], 0) / 3,
          );
          if (match(centre))
            rows.push(Array.from(g.normals.slice(vs[0] * 3, vs[0] * 3 + 3)));
        }
        return rows;
      });
    // The shallow analytic X component is below the old .3 gate, but owns its intact riser.
    const risers = normalsAt(intact, (p) => p[0] === 4 / 16 && p[2] > 2 / 16);
    expect(risers.length).toBeGreaterThan(0);
    for (const n of risers) expect(n).toEqual(normal.map(Math.fround));
    const boundary = normalsAt(intact, (p) => p[1] === 0 && p[2] > 1 / 16);
    expect(boundary.length).toBeGreaterThan(0);
    for (const n of boundary) expect(n).toEqual([0, -1, 0]);
    const removedSide = removeShipVisualCells(
      intact,
      new Set([visualCellKey(5, 0, 2)]),
    );
    const cuts = normalsAt(
      removedSide,
      (p) => p[0] === 5 / 16 && p[1] < 1 / 16 && p[2] > 2 / 16,
    );
    expect(cuts.length).toBeGreaterThan(0);
    for (const n of cuts) expect(n).toEqual([1, 0, 0]);
    const removedTop = removeShipVisualCells(
      intact,
      new Set([visualCellKey(4, 0, 2)]),
    );
    const tops = normalsAt(
      removedTop,
      (p) => p[0] > 4 / 16 && p[0] < 5 / 16 && p[1] < 1 / 16 && p[2] === 2 / 16,
    );
    expect(tops.length).toBeGreaterThan(0);
    for (const n of tops) expect(n).toEqual([0, 0, 1]);
    expect(meshSampledStructure(sampleShipVisualLayers(layers))).toEqual(
      meshSampledStructure(intact),
    );
  });
});
