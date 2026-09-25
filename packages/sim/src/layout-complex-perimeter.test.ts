import { describe, expect, it } from "vitest";
import type { Point } from "@sidereal/content/ship-layout";
import { planComplexPerimeter } from "./layout-complex-perimeter";
const transform = (p: Point[], q: number, mirror: boolean): Point[] => {
  const out = p.map(([x, yy]) => {
    const y = mirror ? -yy : yy;
    return [
      [x, y],
      [-y, x],
      [-x, -y],
      [y, -x],
    ][q].map((v) => v + 160) as Point;
  });
  return mirror ? out.reverse() : out;
};
describe("native complex perimeter", () => {
  const fixtures: Point[][] = [
    [
      [0, 0],
      [128, 0],
      [128, 32],
      [64, 64],
      [64, 128],
      [32, 128],
      [0, 64],
    ],
    [
      [0, 0],
      [128, 0],
      [128, 64],
      [64, 128],
      [0, 128],
    ],
    [
      [0, 0],
      [192, 0],
      [192, 64],
      [128, 96],
      [128, 160],
      [0, 160],
    ],
    [
      [0, 0],
      [192, 0],
      [192, 128],
      [128, 128],
      [64, 64],
      [0, 64],
    ],
    [
      [0, 0],
      [192, 0],
      [192, 160],
      [128, 160],
      [128, 96],
      [64, 128],
      [0, 128],
    ],
    [
      [0, 0],
      [128, 0],
      [128, 128],
      [64, 128],
      [64, 64],
      [0, 64],
    ],
  ];
  it("assembles concave diagonal joins with exact native spans at every rotation, mirror and wall height", () => {
    for (const p of fixtures)
      for (const q of [0, 1, 2, 3])
        for (const mirror of [false, true])
          for (const height of [1, 2, 3, 4] as const) {
            const result = planComplexPerimeter(
              transform(p, q, mirror),
              height,
            );
            expect(
              result.issues,
              JSON.stringify({ p, q, mirror, height }),
            ).toEqual([]);
            expect(result.ok).toBe(true);
            expect(result.placements.length).toBeGreaterThan(p.length);
            expect(result.polygons.length).toBe(result.placements.length);
          }
  });
  it("merges collinear provenance splits without changing native placements", () => {
    expect(
      planComplexPerimeter(
        [
          [0, 0],
          [64, 0],
          [128, 0],
          [128, 128],
          [0, 128],
        ],
        4,
      ),
    ).toEqual(
      planComplexPerimeter(
        [
          [0, 0],
          [128, 0],
          [128, 128],
          [0, 128],
        ],
        4,
      ),
    );
  });
  it("rejects unqualified directions, short edges, holes, self-crossing and pinched floors", () => {
    const rejected: Point[][] = [
      [
        [0, 0],
        [96, 32],
        [0, 128],
      ],
      [
        [0, 0],
        [8, 0],
        [8, 8],
        [0, 8],
      ],
      [
        [0, 0],
        [0, 128],
        [128, 128],
        [128, 0],
      ],
      [
        [0, 0],
        [128, 128],
        [0, 128],
        [128, 0],
      ],
      [
        [0, 0],
        [128, 0],
        [128, 128],
        [68, 128],
        [68, 16],
        [60, 16],
        [60, 128],
        [0, 128],
      ],
    ];
    for (const p of rejected) {
      const r = planComplexPerimeter(p, 4);
      expect(r.ok, JSON.stringify(p)).toBe(false);
      expect(r.placements).toEqual([]);
    }
  });
});
