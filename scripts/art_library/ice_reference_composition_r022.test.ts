import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeIceReference } from "./ice_reference_composition_r022";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/ice-r022/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("retains shaft and gorge native surfaces and optical channels identically across LODs", () => {
  const a = composeIceReference(kit, 38, 0),
    b = composeIceReference(kit, 38, 2);
  for (let m = 0; m < a.length; m++) {
    for (const field of ["positions", "normals", "uvs", "indices"] as const)
      expect(
        Buffer.from(a[m][field].buffer).equals(Buffer.from(b[m][field].buffer)),
      ).toBe(true);
    expect(a[m].ranges).toEqual(b[m].ranges);
    expect(a[m].uvs.length).toBe((a[m].positions.length / 3) * 2);
  }
  const ids = new Set(a.flatMap((b) => b.ranges.map((r) => r.partId)));
  expect(ids.size).toBe(13);
  expect(a.reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(145000);
});
it("NullEngine clears each distinct native floor through variant-specific substrate indexing", () => {
  for (const mode of [true, "gorge"] as const) {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    try {
      const meshes = composeIceReference(kit, 38, 0, mode).map((b, i) => {
        const mesh = new Mesh(`ice-${i}`, scene);
        mesh.metadata = {
          role: "planet",
          materialRole: i,
          triangleRanges: b.ranges,
        };
        mesh.material = new PBRMaterial(`ice-role-${i}`, scene);
        const data = new VertexData();
        data.positions = b.positions;
        data.normals = b.normals;
        data.uvs = b.uvs;
        data.indices = b.indices;
        data.applyToMesh(mesh);
        mesh.computeWorldMatrix(true);
        return mesh;
      });
      const n = new Vector3(0.452, 0.388, 0.794).normalize(),
        ray = new Ray(n.scale(2), n.negate(), 3),
        hits = meshes
          .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
          .filter((v) => v.hit.hit && v.hit.pickedPoint)
          .sort((a, b) => a.hit.distance - b.hit.distance);
      expect(hits[0].mesh.metadata.materialRole).toBe(4);
      expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(0.9);
      const ground = hits.find((v) => v.mesh.metadata.materialRole === 0)!;
      expect(ground.hit.distance - hits[0].hit.distance).toBeGreaterThan(0.005);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
});
it("retains the original deep shaft floor with bounded compact blue columns", () => {
  const shaft = kit.variants.find((v) => v.name === "snow-cut-region")!;
  let high = -Infinity;
  for (let i = 2; i < shaft.positions.length; i += 3)
    high = Math.max(high, shaft.positions[i]);
  expect(high).toBeLessThan(0.72);
  expect(high).toBeGreaterThan(0.5);
  expect(() =>
    composeIceReference(
      {
        ...kit,
        variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
      },
      38,
      0,
    ),
  ).toThrow("Missing authored ice normals or UVs");
});
it("preserves corrected Ice21 material exports and authored ground while replacing regional morphology", () => {
  const old = JSON.parse(
    readFileSync(
      "output/playwright/planet-reference-20260914/ice-r021/kit.json",
      "utf8",
    ),
  ) as NativePlanetKit;
  expect(kit.materials).toEqual(old.materials);
  for (const name of [
    "ground-sphere",
    "ground-sphere-medium",
    "ground-sphere-low",
  ])
    expect(kit.variants.find((v) => v.name === name)).toEqual(
      old.variants.find((v) => v.name === name),
    );
  for (let role = 0; role < 5; role++)
    for (const channel of ["albedo", "orm"])
      expect(
        readFileSync(
          `output/playwright/planet-reference-20260914/ice-r022/ice-${role}-${channel}.png`,
        ),
      ).toEqual(
        readFileSync(
          `output/playwright/planet-reference-20260914/ice-r021/ice-${role}-${channel}.png`,
        ),
      );
  const area = (source: NativePlanetKit) => {
    const v = source.variants.find((v) => v.name === "snow-cut-region")!;
    let total = 0;
    for (let i = 0; i < v.indices.length; i += 3) {
      if (![2, 3].includes(v.triangleMaterials[i / 3])) continue;
      const p = [0, 1, 2].map((k) =>
        Vector3.FromArray(v.positions, v.indices[i + k] * 3),
      );
      if (p.reduce((n, v) => n + v.z, 0) <= 0) continue;
      total +=
        Vector3.Cross(p[1].subtract(p[0]), p[2].subtract(p[0])).length() / 2;
    }
    return total;
  };
  expect(area(kit)).toBeGreaterThan(area(old) * 1.25);
});
