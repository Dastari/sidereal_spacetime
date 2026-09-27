import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeCrystalMoonReference } from "./crystal_moon_reference_composition_r003";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
for (const id of ["crystal-moon-1", "crystal-moon-2"]) {
  const path = `output/playwright/planet-reference-20260914/${id}-r005/`,
    kit = JSON.parse(readFileSync(path + "kit.json", "utf8"));
  it(`${id} retains exact native PBR and all attribute channels across LOD`, () => {
    const prior = JSON.parse(
      readFileSync(path.replace("r005", "r004") + "kit.json", "utf8"),
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
    expect(a.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(5000);
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

it("r005 contains selective native lip notches while preserving broad quiet facets", () => {
  for (const id of ["crystal-moon-1", "crystal-moon-2"]) {
    const p = JSON.parse(
      readFileSync(
        `output/playwright/planet-reference-20260914/${id}-r005/native-panel-plan.json`,
        "utf8",
      ),
    );
    const chipped = p.filter((v: any) => v.chippedEdges.length > 0);
    expect(chipped.length).toBeGreaterThan(3);
    expect(chipped.length).toBeLessThan(p.length / 2);
  }
});

for (const id of ["crystal-moon-1", "crystal-moon-2"])
  it(`${id} preserves original surface triangles and repairs only signed orientation`, () => {
    const path = `output/playwright/planet-reference-20260914/${id}-r005/`,
      kit = JSON.parse(readFileSync(path + "kit.json", "utf8")),
      prior = JSON.parse(
        readFileSync(path.replace("r005", "r004") + "kit.json", "utf8"),
      );
    const a = prior.variants[0],
      b = kit.variants[0],
      report = JSON.parse(
        readFileSync(path + "orientation-validation.json", "utf8"),
      );
    expect(report.independentPanels).toBe(id.endsWith("-1") ? 86 : 26);
    expect(report.sourceWelded).toBe(false);
    expect(report.polygonsReversed).toBe(id.endsWith("-1") ? 636 : 200);
    expect(a.indices.length).toBe(b.indices.length);
    expect(a.triangleMaterials).toEqual(b.triangleMaterials);
    const flips = new Set(report.reversedSourcePolygons);
    for (let t = 0; t < a.indices.length / 3; t++) {
      const reversed = flips.has(report.sourcePolygonPerTriangle[t]),
        order = reversed ? [0, 2, 1] : [0, 1, 2];
      for (let k = 0; k < 3; k++) {
        const ai = a.indices[t * 3 + order[k]],
          bi = b.indices[t * 3 + k];
        for (let axis = 0; axis < 3; axis++) {
          expect(b.positions[bi * 3 + axis]).toBe(a.positions[ai * 3 + axis]);
          expect(b.normals[bi * 3 + axis]).toBe(
            a.normals[ai * 3 + axis] * (reversed ? -1 : 1),
          );
        }
        for (let axis = 0; axis < 2; axis++)
          expect(b.uvs[bi * 2 + axis]).toBe(a.uvs[ai * 2 + axis]);
      }
    }
    for (const panel of report.panels)
      expect(panel.positiveSignedVolume).toBeGreaterThan(0);
    for (const seed of [38, 117, 904]) {
      const levels = [0, 1, 2].map((l) =>
        composeCrystalMoonReference(kit, seed, l as 0 | 1 | 2),
      );
      for (const level of levels.slice(1)) expect(level).toEqual(levels[0]);
    }
  });
