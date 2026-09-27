import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { composeIceReference } from "./ice_reference_composition_r016";
import type { NativePlanetKit } from "../../packages/render/src/environment/native-planet-composition";
const kit = JSON.parse(
  readFileSync(
    "output/playwright/planet-reference-20260914/ice-r016/kit.json",
    "utf8",
  ),
) as NativePlanetKit;
it("retains native shaft geometry, corner attributes and placement identities across all LODs", () => {
  const levels = ([0, 1, 2] as const).map((lod) =>
    composeIceReference(kit, 38, lod),
  );
  const same = (a: Float32Array | Uint32Array, b: Float32Array | Uint32Array) =>
    Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(
      Buffer.from(b.buffer, b.byteOffset, b.byteLength),
    );
  for (let k = 0; k < levels[0].length; k++) {
    const a = levels[0][k],
      b = levels[2][k];
    expect(same(a.positions, b.positions)).toBe(true);
    expect(same(a.normals, b.normals)).toBe(true);
    expect(same(a.uvs, b.uvs)).toBe(true);
    expect(same(a.indices, b.indices)).toBe(true);
    expect(a.ranges).toEqual(b.ranges);
  }
  expect(levels[0].reduce((n, b) => n + b.indices.length / 3, 0)).toBeLessThan(
    90000,
  );
  for (const b of levels[0]) {
    let valid = true;
    for (const p of b.positions) if (!Number.isFinite(p)) valid = false;
    for (let i = 0; i < b.normals.length; i += 3)
      if (
        Math.abs(
          Math.hypot(b.normals[i], b.normals[i + 1], b.normals[i + 2]) - 1,
        ) > 1e-5
      )
        valid = false;
    expect(valid).toBe(true);
    expect(b.uvs.length).toBe((b.positions.length / 3) * 2);
  }
});
it("preserves exact authored UV seams by native material and refuses missing optical attributes", () => {
  const composed = composeIceReference(kit, 38, 0, true),
    native = kit.variants.find(
      (v) => v.name === "snow-shaft-region-a",
    )! as NativePlanetKit["variants"][number] & { uvs: number[] };
  for (let m = 0; m < kit.materials.length; m++) {
    const range = composed[m].ranges.find(
      (r) => r.partId === "region-diagnostic",
    );
    if (!range) continue;
    const expected: number[] = [];
    for (let t = 0; t < native.triangleMaterials.length; t++)
      if (native.triangleMaterials[t] === m)
        for (let j = 0; j < 3; j++) {
          const i = native.indices[t * 3 + j];
          expected.push(...native.uvs.slice(i * 2, i * 2 + 2));
        }
    expect(
      composed[m].uvs.slice(
        range.firstTriangle * 6,
        (range.firstTriangle + range.triangleCount) * 6,
      ),
    ).toEqual(Float32Array.from(expected));
  }
  expect(() =>
    composeIceReference(
      {
        ...kit,
        variants: kit.variants.map((v) => ({ ...v, normals: undefined })),
      },
      38,
      0,
      true,
    ),
  ).toThrow("Missing authored ice normals or UVs");
});
it("NullEngine uploads normals/UVs and ray-picks the deep shaft floor before the cleared substrate", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    const level = composeIceReference(kit, 38, 0, true),
      meshes = level.map((b, i) => {
        const mesh = new Mesh(`ice-diagnostic-${i}`, scene);
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
    for (const mesh of meshes) {
      expect(mesh.isVerticesDataPresent(VertexBuffer.NormalKind)).toBe(true);
      expect(mesh.isVerticesDataPresent(VertexBuffer.UVKind)).toBe(true);
    }
    const n = new Vector3(0.452, 0.388, 0.794).normalize(),
      ray = new Ray(n.scale(2), n.scale(-1), 3);
    const hits = meshes
      .map((mesh) => ({ mesh, hit: ray.intersectsMesh(mesh, false) }))
      .filter((v) => v.hit.hit)
      .sort((a, b) => a.hit.distance - b.hit.distance);
    expect(hits[0].mesh.metadata.materialRole).toBe(4);
    const ground = hits.find((v) => v.mesh.metadata.materialRole === 0)!;
    expect(ground.hit.distance - hits[0].hit.distance).toBeGreaterThan(0.015);
    expect(hits[0].hit.pickedPoint!.length()).toBeLessThan(0.85);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
