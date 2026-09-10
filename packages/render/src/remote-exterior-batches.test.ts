import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { batchOpaqueExterior } from "./remote-exterior-batches";
import { cloneOpaqueRemoteGlass } from "./remote-exterior-glass";
function triangle(scene: Scene) {
  const mesh = new Mesh("native-triangle", scene),
    data = new VertexData();
  data.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  data.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  data.indices = [0, 1, 2];
  data.uvs = [0, 0, 1, 0, 0, 1];
  data.tangents = [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1];
  data.applyToMesh(mesh);
  return mesh;
}
describe("exact native exterior batching", () => {
  it("bakes repeated and mirrored primitives into one draw without changing source geometry, UVs or material", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      source = triangle(scene);
    const material = new PBRMaterial("paint", scene);
    source.material = material;
    const original = source.getVerticesData("position")!.slice();
    const b = batchOpaqueExterior(scene, [
      { source, matrix: Matrix.Translation(3, 0, 0), placementIds: ["right"] },
      {
        source,
        matrix: Matrix.Scaling(-1, 1, 1).multiply(Matrix.Translation(-3, 0, 0)),
        placementIds: ["left"],
      },
    ]);
    expect(b.metrics.inputSubMeshes).toBe(2);
    expect(b.metrics.outputSubMeshes).toBe(1);
    expect(b.batches[0].material).toBe(material);
    expect(source.getVerticesData("position")).toEqual(original);
    expect(b.batches[0].getTotalIndices()).toBe(source.getTotalIndices() * 2);
    expect(b.batches[0].getVerticesData("uv")).toEqual([
      0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    ]);
    expect(b.primitives[0].placementIds).toEqual(["left", "right"]);
    const positions = b.batches[0].getVerticesData("position")!,
      indices = b.batches[0].getIndices()!;
    for (let i = 0; i < indices.length; i += 3) {
      const a = Vector3.FromArray(positions, indices[i] * 3),
        c = Vector3.FromArray(positions, indices[i + 1] * 3),
        d = Vector3.FromArray(positions, indices[i + 2] * 3);
      expect(Vector3.Cross(c.subtract(a), d.subtract(a)).z).toBeGreaterThan(0);
    }
    const tangents = b.batches[0].getVerticesData("tangent")!;
    expect(tangents.slice(12, 16)).toEqual([-1, 0, 0, -1]);
    scene.dispose();
    engine.dispose();
  });
  it("keeps distinct material identities and alpha-blended primitives separate", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      a = triangle(scene),
      b = triangle(scene),
      glass = triangle(scene);
    a.material = new PBRMaterial("same-label", scene);
    b.material = new PBRMaterial("same-label", scene);
    const transparent = new PBRMaterial("unclassified-alpha-paint", scene);
    transparent.alpha = 0.3;
    glass.material = transparent;
    const result = batchOpaqueExterior(
      scene,
      [a, b, glass].map((source, i) => ({
        source,
        matrix: Matrix.Translation(i, 0, 0),
        placementIds: [String(i)],
      })),
    );
    expect(result.metrics.opaqueBatches).toBe(2);
    expect(result.metrics.separatePrimitives).toBe(1);
    expect(result.primitives[2].source).toBe(glass);
    expect(glass.material).toBe(transparent);
    scene.dispose();
    engine.dispose();
  });
  it("uses inverse-transpose normals for native nonuniform scale", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine),
      source = triangle(scene);
    source.material = new PBRMaterial("paint", scene);
    source.setVerticesData("normal", [1, 1, 0, 1, 1, 0, 1, 1, 0]);
    const result = batchOpaqueExterior(scene, [
      { source, matrix: Matrix.Scaling(2, 0.5, 1), placementIds: ["scaled"] },
    ]);
    const normal = result.batches[0].getVerticesData("normal")!;
    expect(normal[0]).toBeCloseTo(1 / Math.sqrt(17));
    expect(normal[1]).toBeCloseTo(4 / Math.sqrt(17));
    scene.dispose();
    engine.dispose();
  });
});
it("remote glass is an opaque isolated clone retaining tint/specular while local refraction and alpha remain unchanged", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    local = new PBRMaterial("Blue laminated glazing", scene);
  local.alpha = 0.25;
  local.albedoColor = new Color3(0.012, 0.065, 0.14);
  local.metallic = 0.12;
  local.roughness = 0.18;
  local.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  local.subSurface.isRefractionEnabled = true;
  local.subSurface.refractionIntensity = 0.8;
  const opaque = cloneOpaqueRemoteGlass(local)!;
  expect(opaque).not.toBe(local);
  expect(opaque.alpha).toBe(1);
  expect(opaque.needAlphaBlending()).toBe(false);
  expect(opaque.albedoColor.asArray()).toEqual(local.albedoColor.asArray());
  expect(opaque.metallic).toBe(0.12);
  expect(opaque.roughness).toBe(0.18);
  expect(opaque.subSurface.isRefractionEnabled).toBe(false);
  expect(opaque.subSurface.refractionIntensity).toBe(0);
  expect(local.alpha).toBe(0.25);
  expect(local.subSurface.isRefractionEnabled).toBe(true);
  expect(local.subSurface.refractionIntensity).toBe(0.8);
  expect(
    cloneOpaqueRemoteGlass(new PBRMaterial("opaque armor", scene)),
  ).toBeUndefined();
  const source = triangle(scene);
  source.material = opaque;
  expect(
    batchOpaqueExterior(scene, [
      { source, matrix: Matrix.Identity(), placementIds: ["window"] },
    ]).metrics.separatePrimitives,
  ).toBe(0);
  opaque.dispose(false, false);
  expect(scene.materials).not.toContain(opaque);
  expect(scene.materials).toContain(local);
  expect(local.alpha).toBe(0.25);
  expect(local.subSurface.refractionIntensity).toBe(0.8);
  scene.dispose();
  engine.dispose();
});
