import { it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StellarConvection, stellarEjectaState } from "./stellar-convection";
it("adds animated radiance without changing native PBR channels", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new PBRMaterial("native", scene);
  material.roughness = 0.61;
  material.metallic = 0.12;
  const albedo = material.albedoColor.clone();
  try {
    const effect = new StellarConvection(material);
    effect.time = 4;
    let time = 0;
    effect.bindForSubMesh({
      updateFloat: (_n: string, v: number) => (time = v),
    } as never);
    expect(time).toBe(4);
    expect(material.roughness).toBe(0.61);
    expect(material.metallic).toBe(0.12);
    expect(material.albedoColor.equals(albedo)).toBe(true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it("ejects independently phased parcels with continuous invisible recycle endpoints", () => {
  expect(stellarEjectaState(0, 0).size).toBe(0);
  expect(stellarEjectaState(2.4, 0).distance).toBeGreaterThan(1.2);
  expect(stellarEjectaState(4.8 - 1e-5, 0).size).toBeLessThan(1e-8);
  expect(stellarEjectaState(1, 0.4)).not.toEqual(stellarEjectaState(1, 0.8));
});

it("keeps native tile geometry and shared PBR state stable while both shader stages receive animation time", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const mesh = new Mesh("native-tile", scene),
      material = new PBRMaterial("tile", scene);
    const data = VertexData.CreateBox({ size: 1 });
    data.applyToMesh(mesh);
    mesh.metadata = { role: "environment", partId: "test:photosphere" };
    mesh.material = material;
    const effect = new StellarConvection(material, true);
    scene.activeCamera = new FreeCamera("camera", new Vector3(0, 0, -4), scene);
    await material.forceCompilationAsync(mesh);
    scene.render();
    expect(material.getEffect()?.vertexSourceCode).toContain("float lift");
    expect(material.getEffect()?.vertexSourceCode).toContain(
      "positionUpdated+=",
    );
    const geometry = mesh.geometry,
      positions = mesh.getVerticesData("position")!.slice(),
      indices = mesh.getIndices()!.slice();
    const attributes: string[] = [];
    effect.getAttributes(attributes);
    expect(attributes).toContain("uv");
    const uniformTimes: number[] = [];
    for (const time of [0, 2, 7, 15, 25]) {
      effect.time = time;
      effect.bindForSubMesh({
        updateFloat: (_name: string, value: number) => uniformTimes.push(value),
      } as never);
    }
    expect(uniformTimes).toEqual([0, 2, 7, 15, 25]);
    expect(effect.getUniforms().vertex).toContain("stellarTime");
    expect(effect.getUniforms().fragment).toContain("stellarTime");
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.getVerticesData("position")).toEqual(positions);
    expect(mesh.getIndices()).toEqual(indices);
    expect(scene.materials.filter((m) => m === material)).toHaveLength(1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
