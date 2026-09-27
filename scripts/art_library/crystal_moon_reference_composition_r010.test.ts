import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeCrystalMoonReference } from "./crystal_moon_reference_composition_r008";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
for (const id of ["crystal-moon-1", "crystal-moon-2"]) {
  const path = `output/playwright/planet-reference-20260914/${id}-r010/`,
    kit = JSON.parse(readFileSync(path + "kit.json", "utf8"));
  it(`${id} retains exact native PBR and all attribute channels across LOD`, () => {
    const prior = JSON.parse(
      readFileSync(path.replace("r010", "r005") + "kit.json", "utf8"),
    );
    expect(kit.materials).toEqual(prior.materials);
    expect(kit.variants.map((v: any) => v.name)).toEqual([
      "connected-crystalline-body",
    ]);
    const a = composeCrystalMoonReference(kit, 38, 0);
    for (const lod of [1, 2] as const) {
      const b = composeCrystalMoonReference(kit, 38, lod);
      for (let i = 0; i < a.length; i++) {
        for (const key of ["positions", "normals", "uvs", "indices"] as const)
          expect(
            Buffer.from(a[i][key].buffer).equals(Buffer.from(b[i][key].buffer)),
          ).toBe(true);
        expect(a[i].ranges).toEqual(b[i].ranges);
      }
    }
    expect(a.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(5500);
    expect(a[7].indices.length).toBeGreaterThan(0);
  });
  it(`${id} preserves closed front-facing panels in distributed NullEngine surface rays`, () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      const meshes = composeCrystalMoonReference(kit, 38, 0)
        .filter((b) => b.indices.length)
        .map((b) => {
          const m = new Mesh("native-body", scene);
          m.metadata = { role: "planet", triangleRanges: b.ranges };
          m.material = new PBRMaterial("native-PBR", scene);
          const d = new VertexData();
          Object.assign(d, b);
          d.applyToMesh(m);
          m.computeWorldMatrix(true);
          return m;
        });
      for (let i = 0; i < 64; i++) {
        const y = 1 - (2 * (i + 0.5)) / 64,
          r = Math.sqrt(1 - y * y),
          n = new Vector3(
            r * Math.cos(i * 2.399963),
            y,
            r * Math.sin(i * 2.399963),
          ),
          ray = new Ray(n.scale(2), n.negate(), 3);
        const hits = meshes
          .map((m) =>
            ray.intersectsMesh(
              m,
              false,
              (a, b, c, ray) =>
                Vector3.Dot(
                  Vector3.Cross(b.subtract(a), c.subtract(a)),
                  ray.direction,
                ) < 0,
            ),
          )
          .filter((h) => h.hit && h.pickedPoint)
          .sort((a, b) => a.distance - b.distance);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].pickedPoint!.length()).toBeGreaterThan(
          id.endsWith("-2") ? 0.45 : 0.55,
        );
        expect(hits[0].pickedPoint!.length()).toBeLessThan(1.25);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
}

for (const id of ["crystal-moon-1", "crystal-moon-2"])
  it(`${id} replaces selected shells while retaining every unselected native triangle exactly`, () => {
    const path = `output/playwright/planet-reference-20260914/${id}-r010/`,
      kit = JSON.parse(readFileSync(path + "kit.json", "utf8")),
      priorPath = path.replace("r010", "r005"),
      prior = JSON.parse(readFileSync(priorPath + "kit.json", "utf8")),
      a = prior.variants[0],
      b = kit.variants[0],
      source = JSON.parse(
        readFileSync(priorPath + "orientation-validation.json", "utf8"),
      ),
      plan = JSON.parse(
        readFileSync(path + "native-fracture-plan.json", "utf8"),
      ),
      removed = new Set(plan.removedSourcePolygons);
    const retained = {
      positions: [] as number[],
      normals: [] as number[],
      uvs: [] as number[],
      triangleMaterials: [] as number[],
    };
    for (let t = 0; t < a.indices.length / 3; t++) {
      if (removed.has(source.sourcePolygonPerTriangle[t])) continue;
      for (let k = 0; k < 3; k++) {
        const i = a.indices[t * 3 + k];
        retained.positions.push(...a.positions.slice(i * 3, i * 3 + 3));
        retained.normals.push(...a.normals.slice(i * 3, i * 3 + 3));
        retained.uvs.push(...a.uvs.slice(i * 2, i * 2 + 2));
      }
      retained.triangleMaterials.push(a.triangleMaterials[t]);
    }
    for (const channel of [
      "positions",
      "normals",
      "uvs",
      "triangleMaterials",
    ] as const)
      expect(b[channel].slice(0, retained[channel].length)).toEqual(
        retained[channel],
      );
    const parts = kit.nativePartRanges;
    expect(parts[0].triangleCount).toBe(retained.triangleMaterials.length);
    expect(parts.reduce((n: number, p: any) => n + p.triangleCount, 0)).toBe(
      b.indices.length / 3,
    );
    expect(new Set(parts.map((p: any) => p.partId)).size).toBe(parts.length);
    for (const seed of [38, 117, 904]) {
      const levels = [0, 1, 2].map((l) =>
        composeCrystalMoonReference(kit, seed, l as 0 | 1 | 2),
      );
      for (const level of levels.slice(1)) expect(level).toEqual(levels[0]);
      expect(
        new Set(levels[0].flatMap((b) => b.ranges.map((r) => r.partId))),
      ).toEqual(new Set(parts.map((p: any) => p.partId)));
    }
  });
it("r010 carries broad regional low/high surfaces and recessed runs across multiple source districts", () => {
  for (const id of ["crystal-moon-1", "crystal-moon-2"]) {
    const plan = JSON.parse(
      readFileSync(
        `output/playwright/planet-reference-20260914/${id}-r010/native-fracture-plan.json`,
        "utf8",
      ),
    );
    expect(plan.regions.length).toBe(3);
    for (const region of [0, 1, 2])
      expect(
        new Set(
          plan.parts
            .filter((p: any) => p.region === region)
            .map((p: any) => p.sourcePanel),
        ).size,
      ).toBeGreaterThan(1);
    expect(plan.parts.some((p: any) => p.height < -0.05)).toBe(true);
    expect(plan.parts.some((p: any) => p.height > 0.05)).toBe(true);
  }
});

for (const id of ["crystal-moon-1", "crystal-moon-2"])
  it(`${id} changes only selected traced native polygon material assignments`, () => {
    const path = `output/playwright/planet-reference-20260914/${id}-r010/`,
      kit = JSON.parse(readFileSync(path + "kit.json", "utf8")),
      prior = JSON.parse(
        readFileSync(path.replace("r010", "r009") + "kit.json", "utf8"),
      ),
      a = prior.variants[0],
      b = kit.variants[0],
      changes = JSON.parse(
        readFileSync(path + "native-material-exposure.json", "utf8"),
      );
    for (const channel of ["positions", "normals", "uvs", "indices"])
      expect(b[channel]).toEqual(a[channel]);
    expect(kit.materials).toEqual(prior.materials);
    expect(
      kit.nativePartRanges.map((p: any) => [
        p.partId,
        p.firstTriangle,
        p.triangleCount,
      ]),
    ).toEqual(
      prior.nativePartRanges.map((p: any) => [
        p.partId,
        p.firstTriangle,
        p.triangleCount,
      ]),
    );
    expect(changes.length).toBe(id.endsWith("-1") ? 10 : 6);
    const changed = new Set<number>();
    for (const c of changes) {
      expect(c.area).toBeLessThan(0.085);
      expect(c.newMaterial).toBe(7);
      const part = kit.nativePartRanges.find((p: any) => p.partId === c.partId);
      expect(part).toBeDefined();
      for (const t of c.triangles) {
        expect(t).toBeGreaterThanOrEqual(part.firstTriangle);
        expect(t).toBeLessThan(part.firstTriangle + part.triangleCount);
        expect(a.triangleMaterials[t]).toBe(c.oldMaterial);
        changed.add(t);
      }
    }
    expect(changed.size).toBeLessThan(a.triangleMaterials.length * 0.01);
    for (let t = 0; t < a.triangleMaterials.length; t++)
      expect(b.triangleMaterials[t]).toBe(
        changed.has(t) ? 7 : a.triangleMaterials[t],
      );
    for (const m of kit.materials)
      for (const field of [
        "baseColorTexture",
        "emissiveTexture",
        "metallicRoughnessTexture",
      ])
        if (m[field])
          expect(
            readFileSync(path + m[field]).equals(
              readFileSync(path.replace("r010", "r009") + m[field]),
            ),
          ).toBe(true);
  });
