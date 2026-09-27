import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeSolidMoonReference } from "./solid_moon_reference_composition_r001";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
for (const name of ["gas-giant-moon-1", "gas-giant-moon-3"]) {
  const read = (revision: string) =>
      JSON.parse(
        readFileSync(
          `output/playwright/planet-reference-20260914/${name}-${revision}/kit.json`,
          "utf8",
        ),
      ) as NativePlanetKit,
    prior = read("r001"),
    next = read("r002");
  it(
    name +
      " preserves every authored vertex/normal/UV and changes only sparse native material assignments",
    () => {
      expect(next.materials.slice(0, 6)).toEqual(prior.materials);
      expect(next.materials).toHaveLength(8);
      let changed = 0,
        total = 0;
      for (let i = 0; i < prior.variants.length; i++) {
        const a = prior.variants[i],
          b = next.variants[i];
        for (const key of [
          "name",
          "positions",
          "normals",
          "uvs",
          "indices",
        ] as const)
          expect(JSON.stringify(b[key]) === JSON.stringify(a[key])).toBe(true);
        for (let t = 0; t < a.triangleMaterials.length; t++) {
          total++;
          if (a.triangleMaterials[t] !== b.triangleMaterials[t]) {
            changed++;
            expect([6, 7]).toContain(b.triangleMaterials[t]);
            expect([0, 1, 5]).toContain(a.triangleMaterials[t]);
          }
        }
      }
      expect(changed).toBeGreaterThan(0);
      expect(changed / total).toBeLessThan(0.03);
      for (const role of next.materials.slice(6))
        expect(
          (role as { emissiveStrength?: number }).emissiveStrength ?? 0,
        ).toBe(0);
    },
  );
  it(
    name +
      " retains mineral placement and all macro geometry across all LOD levels",
    () => {
      const levels = ([0, 1, 2] as const).map((lod) =>
        composeSolidMoonReference(next, 38, lod),
      );
      for (const level of levels.slice(1))
        for (let i = 0; i < level.length; i++) {
          for (const key of ["positions", "normals", "uvs", "indices"] as const)
            expect(
              Buffer.from(level[i][key].buffer).equals(
                Buffer.from(levels[0][i][key].buffer),
              ),
            ).toBe(true);
          expect(level[i].ranges).toEqual(levels[0][i].ranges);
        }
      expect(levels[0][6].indices.length).toBeGreaterThan(0);
      expect(levels[0][7].indices.length).toBeGreaterThan(0);
    },
  );
}
