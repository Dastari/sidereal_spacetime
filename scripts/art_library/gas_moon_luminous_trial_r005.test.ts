import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeSolidMoonReference } from "./solid_moon_reference_composition_r001";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { referenceMaterial } from "./planet_reference_materials";
type OpticalKit = Omit<NativePlanetKit, "variants"> & {
  variants: (NativePlanetKit["variants"][number] & {
    normals: number[];
    uvs: number[];
  })[];
};
for (const name of ["gas-giant-moon-1", "gas-giant-moon-3"]) {
  const read = (revision: string) =>
      JSON.parse(
        readFileSync(
          `output/playwright/planet-reference-20260914/${name}-${revision}/kit.json`,
          "utf8",
        ),
      ) as OpticalKit,
    prior = read("r004"),
    next = read("r005");
  it(
    name +
      " preserves geometry and original materials while bounding new native mineral coverage",
    () => {
      expect(next.materials.slice(0, 6)).toEqual(prior.materials.slice(0, 6));
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
            expect([0, 1, 5, 6, 7]).toContain(a.triangleMaterials[t]);
          }
        }
      }
      expect(changed).toBeGreaterThan(0);
      expect(changed / total).toBeLessThan(0.04);
      for (const material of prior.materials)
        for (const field of [
          "baseColorTexture",
          "metallicRoughnessTexture",
        ] as const) {
          const file = (material as any)[field];
          if (file)
            expect(
              readFileSync(
                `output/playwright/planet-reference-20260914/${name}-r005/${file}`,
              ).equals(
                readFileSync(
                  `output/playwright/planet-reference-20260914/${name}-r004/${file}`,
                ),
              ),
            ).toBe(true);
        }
    },
  );
  it(
    name +
      " preserves placement identity and complete native attributes at allLODs",
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
  it(
    name +
      " imports bounded authored emission through native PBR with correct coat fields",
    () => {
      const engine = new NullEngine(),
        scene = new Scene(engine);
      try {
        const materials = next.materials.map((role) =>
          referenceMaterial(scene, role),
        );
        for (let i = 0; i < 6; i++)
          expect(materials[i].emissiveColor.asArray()).toEqual([0, 0, 0]);
        for (const i of [6, 7]) {
          const role = next.materials[i] as any;
          expect(role.emissiveStrength).toBeGreaterThan(0);
          expect(role.emissiveStrength).toBeLessThanOrEqual(1.1);
          expect(
            materials[i].emissiveColor
              .asArray()
              .map((c) => c * materials[i].emissiveIntensity),
          ).toEqual(
            role.emissiveColor.map((c: number) => c * role.emissiveStrength),
          );
          expect(materials[i].clearCoat.intensity).toBe(1);
          expect(materials[i].clearCoat.roughness).toBe(0.08);
          expect(materials[i].indexOfRefraction).toBe(2.2);
          expect(role.clearcoat).toBeUndefined();
          expect(role.clearcoatRoughness).toBeUndefined();
        }
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );
}
