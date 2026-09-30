import { describe, expect, it } from "vitest";
import {
  sampleShipVisualLayers,
  visualCellKey,
  removeShipVisualCells,
} from "@sidereal/sim/ship-visual-compiler";
import { meshSampledStructure } from "./sampled-structure";

describe("sampled exposed surfaces", () => {
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
});
