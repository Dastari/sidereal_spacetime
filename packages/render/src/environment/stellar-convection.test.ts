import { it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
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
