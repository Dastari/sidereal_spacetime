import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeHybridMoonReference } from "./hybrid_moon_reference_composition_r001";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const ids = [
  "temperate-moon-1",
  "temperate-moon-2",
  "ocean-moon-1",
  "ocean-moon-2",
];
for (const id of ids) {
  const kit = JSON.parse(
    readFileSync(
      `output/playwright/planet-reference-20260914/${id}-r001/kit.json`,
      "utf8",
    ),
  ) as NativePlanetKit;
  it("retains complete native regional surfaces UVs normals and identities at every LOD", () => {
    const a = composeHybridMoonReference(kit, 38, 0),
      b = composeHybridMoonReference(kit, 38, 2);
    for (let m = 0; m < a.length; m++) {
      for (const field of ["positions", "normals", "uvs", "indices"] as const)
        expect(
          Buffer.from(a[m][field].buffer).equals(
            Buffer.from(b[m][field].buffer),
          ),
        ).toBe(true);
      expect(a[m].ranges).toEqual(b[m].ranges);
      expect(a[m].uvs.length).toBe((a[m].positions.length / 3) * 2);
    }
    expect(
      a
        .flatMap((b) => b.ranges)
        .every((r) => r.partId.startsWith(`planets--${id}/`)),
    ).toBe(true);
    expect(a.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
      210000,
    );
  });
  it("NullEngine sees embedded deep crater floor before the cleared native substrate", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      const meshes = composeHybridMoonReference(kit, 38, 0, true).map(
        (b, i) => {
          const mesh = new Mesh(`rocky-${i}`, scene);
          mesh.metadata = {
            role: "planet",
            materialRole: i,
            triangleRanges: b.ranges,
          };
          mesh.material = new PBRMaterial(`rocky-role-${i}`, scene);
          const data = new VertexData();
          data.positions = b.positions;
          data.normals = b.normals;
          data.uvs = b.uvs;
          data.indices = b.indices;
          data.applyToMesh(mesh);
          mesh.computeWorldMatrix(true);
          return mesh;
        },
      );
      const n = new Vector3(0.452, 0.388, 0.794).normalize(),
        ray = new Ray(n.scale(2), n.negate(), 3),
        hits = meshes
          .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(hits[0].mesh.metadata.materialRole).toBe(2);
      expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(0.97);
      const ground = hits.find((v) => v.mesh.metadata.materialRole === 0)!;
      expect(ground.hit.distance - hits[0].hit.distance).toBeGreaterThan(0.003);
      const east = Vector3.Cross(Vector3.Up(), n).normalize(),
        north = Vector3.Cross(n, east),
        pd = n
          .add(east.scale(1.22 * 0.32))
          .add(north.scale(0.07 * 0.32))
          .normalize(),
        pr = new Ray(pd.scale(2), pd.negate(), 3),
        ph = meshes
          .map((mesh) => ({ mesh, hit: pr.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(ph[0].mesh.metadata.materialRole).toBe(2);
      expect(ph[0].hit.pickedPoint!.length()).toBeLessThan(1);
      const pg = ph.find((v) => v.mesh.metadata.materialRole === 0)!;
      expect(pg.hit.distance - ph[0].hit.distance).toBeGreaterThan(0.003);
      const sd = n
          .add(east.scale(-1.74 * 0.32))
          .add(north.scale(-0.42 * 0.32))
          .normalize(),
        sr = new Ray(sd.scale(2), sd.negate(), 3),
        sh = meshes
          .map((mesh) => ({ mesh, hit: sr.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(sh[0].mesh.metadata.materialRole).toBe(2);
      expect(sh[0].hit.pickedPoint!.length()).toBeGreaterThan(1);
      expect(sh[0].hit.pickedPoint!.length()).toBeLessThan(1 + 0.17 * 0.32);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
  it("rejects missing authored optical attributes", () => {
    expect(() =>
      composeHybridMoonReference(
        {
          ...kit,
          variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
        },
        38,
        0,
      ),
    ).toThrow("Missing native rocky normals or UVs");
  });
}
it("keeps the large crater floor exposed in all48 seeded regional placements", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    for (const id of ids) {
      const kit = JSON.parse(
        readFileSync(
          `output/playwright/planet-reference-20260914/${id}-r001/kit.json`,
          "utf8",
        ),
      );
      const meshes = composeHybridMoonReference(kit, 38, 0).map((b, i) => {
        const mesh = new Mesh(`${id}-${i}`, scene);
        mesh.metadata = {
          role: "planet",
          materialRole: i,
          triangleRanges: b.ranges,
        };
        mesh.material = new PBRMaterial("moon-role", scene);
        const data = new VertexData();
        Object.assign(data, b);
        data.applyToMesh(mesh);
        mesh.computeWorldMatrix(true);
        return mesh;
      });
      let state = (38 ^ kit.compositionRecipe.layoutSeed) >>> 0;
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const phase = (state / 4294967296) * Math.PI * 2;
      for (let i = 0; i < 12; i++) {
        const y = 1 - (2 * (i + 0.5)) / 12,
          angle = phase + i * 2.39996323,
          r = Math.sqrt(1 - y * y),
          n = new Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r),
          ray = new Ray(n.scale(2), n.negate(), 3),
          hits = meshes
            .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
            .filter((v) => v.hit.hit && v.hit.pickedPoint)
            .sort((a, b) => a.hit.distance - b.hit.distance);
        expect(hits[0].mesh.metadata.materialRole, `${id}/crust-${i}`).toBe(2);
      }
      for (const mesh of meshes) {
        mesh.material?.dispose();
        mesh.dispose();
      }
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it("preserves native foundation geometry and cavity pigment while adding only upper regional cover", () => {
  const original = JSON.parse(
    readFileSync(
      "output/playwright/planet-reference-20260914/rocky-r010/kit.json",
      "utf8",
    ),
  ) as NativePlanetKit;
  for (const id of ids) {
    const kit = JSON.parse(
      readFileSync(
        `output/playwright/planet-reference-20260914/${id}-r001/kit.json`,
        "utf8",
      ),
    ) as NativePlanetKit;
    for (const name of ["battered-region-a", "battered-region-b"]) {
      const base = original.variants.find((v) => v.name === name)!,
        v = kit.variants.find((v) => v.name === name)!;
      expect(v.positions.slice(0, base.positions.length)).toEqual(
        base.positions,
      );
      let green = 0;
      for (let t = 0; t < base.triangleMaterials.length; t++) {
        if (base.triangleMaterials[t] === 2)
          expect(v.triangleMaterials[t]).toBe(2);
        if (v.triangleMaterials[t] === 6 || v.triangleMaterials[t] === 7)
          green++;
      }
      expect(green).toBeGreaterThan(10);
    }
  }
});
