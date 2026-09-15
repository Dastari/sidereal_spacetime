import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeDesertReference } from "./planet_reference_composition";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/desert-r014/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("keeps macro placement identities across native LODs with deterministic finite bounded geometry", () => {
  const levels = ([0, 1, 2] as const).map((lod) =>
    composeDesertReference(kit, 38, lod),
  );
  const heroes = (level: (typeof levels)[number]) => [
    ...new Set(
      level
        .flatMap((b) => b.ranges.map((r) => r.partId))
        .filter((id) => id.startsWith("region-")),
    ),
  ];
  expect(heroes(levels[0])).toHaveLength(12);
  expect(heroes(levels[0])).toEqual(heroes(levels[2]));
  for (let m = 0; m < levels[0].length; m++) {
    const macro = (b: (typeof levels)[0][number]) =>
      b.ranges
        .filter((r) => r.partId.startsWith("region-"))
        .map((r) => ({
          id: r.partId,
          positions: Array.from(
            b.positions.slice(
              r.firstTriangle * 9,
              (r.firstTriangle + r.triangleCount) * 9,
            ),
          ),
          normals: Array.from(
            b.normals.slice(
              r.firstTriangle * 9,
              (r.firstTriangle + r.triangleCount) * 9,
            ),
          ),
          uvs: Array.from(
            b.uvs.slice(
              r.firstTriangle * 6,
              (r.firstTriangle + r.triangleCount) * 6,
            ),
          ),
        }));
    expect(macro(levels[0][m])).toEqual(macro(levels[2][m]));
  }
  for (const level of levels) {
    expect(level.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      190000,
    );
    for (const batch of level) {
      expect(
        [...batch.positions, ...batch.normals].every(Number.isFinite),
      ).toBe(true);
      expect(batch.ranges.reduce((n, r) => n + r.triangleCount, 0)).toBe(
        batch.indices.length / 3,
      );
    }
  }
  expect(composeDesertReference(kit, 38, 2)).toEqual(levels[2]);
  expect(composeDesertReference(kit, 17, 2)[0].positions).not.toEqual(
    levels[2][0].positions,
  );
}, 30000);
