import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeCrystalReference } from "./crystal_reference_composition_r002";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/crystal-r002/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
const rocky = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/rocky-r006/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("reuses exact native battered geology with an explicit crystal material mapping", () => {
  const map = [0, 2, 1, 0, 8, 2];
  for (const name of ["battered-region-a", "battered-region-b"]) {
    const old = rocky.variants.find((v) => v.name === name)!,
      next = kit.variants.find((v) => v.name === "crystal-" + name)!;
    expect(next.positions).toEqual(old.positions);
    expect(next.indices).toEqual(old.indices);
    expect(next.triangleMaterials).toEqual(
      old.triangleMaterials.map((r) => map[r]),
    );
  }
});
it("retains connected foundation, dominant and medium cluster geometry at all LODs", () => {
  const levels = ([0, 1, 2] as const).map((lod) =>
    composeCrystalReference(kit, 38, lod),
  );
  for (const level of levels) {
    let finite = true,
      triangles = 0;
    for (const b of level) {
      triangles += b.indices.length / 3;
      let end = 0;
      for (const r of b.ranges) {
        expect(r.firstTriangle).toBe(end);
        end += r.triangleCount;
      }
      expect(end).toBe(b.indices.length / 3);
      for (const value of b.positions)
        if (!Number.isFinite(value)) finite = false;
      for (let i = 0; i < b.normals.length; i += 3)
        if (
          Math.abs(
            Math.hypot(b.normals[i], b.normals[i + 1], b.normals[i + 2]) - 1,
          ) > 1e-5
        )
          finite = false;
    }
    expect(finite).toBe(true);
    expect(triangles).toBeLessThan(100000);
  }
  const ids = new Set(levels[0].flatMap((b) => b.ranges.map((r) => r.partId)));
  expect([...ids].filter((id) => id.startsWith("colossal"))).toHaveLength(4);
  expect([...ids].filter((id) => id.startsWith("medium"))).toHaveLength(20);
  for (let i = 0; i < levels[0].length; i++) {
    expect(
      Buffer.from(levels[0][i].positions.buffer).equals(
        Buffer.from(levels[2][i].positions.buffer),
      ),
    ).toBe(true);
    expect(levels[0][i].ranges).toEqual(levels[2][i].ranges);
  }
});
it("authors brighter broad core planes with dimmer edges instead of only emissive outlines", () => {
  const materials = kit.materials as (NativePlanetKit["materials"][number] & {
    emissiveStrength?: number;
    emissiveColor?: number[];
  })[];
  expect(materials[7].emissiveStrength).toBeGreaterThan(
    materials[6].emissiveStrength!,
  );
  expect(
    kit.variants.find((v) => v.name === "colossal-cluster")!.triangleMaterials,
  ).toContain(7);
  const hero = kit.variants.find((v) => v.name === "colossal-cluster")!;
  expect(
    Math.max(...hero.positions.filter((_, i) => i % 3 === 2)),
  ).toBeLessThan(1.7);
});
