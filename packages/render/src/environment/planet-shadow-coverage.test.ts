import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { planetShadowCoverage } from "./planet-shadow-coverage";
import { createPlanetShadows } from "./planet-shadows";

test("active ring bounds fit scaled parents, cache between updates and retain body bias", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 0, -10), scene);
  const parent = new TransformNode("parent", scene);
  parent.scaling.setAll(2);
  parent.position.set(10, 20, 30);
  const root = new TransformNode("body", scene);
  root.parent = parent;
  const ring = CreateBox(
    "ring bounds",
    { width: 3.76, height: 0.02, depth: 3.76 },
    scene,
  );
  ring.parent = root;
  ring.material = new PBRMaterial("dust", scene);
  ring.material.alpha = 0.5;
  ring.metadata = { role: "planet" };
  const pending = CreateBox("pending enormous level", { size: 100 }, scene);
  pending.parent = root;
  pending.material = ring.material;
  pending.metadata = { role: "planet" };
  pending.setEnabled(false);
  const minimum = 2;
  const expected = planetShadowCoverage(root, [ring], minimum);
  expect(expected).toBeGreaterThan(3.76);
  expect(planetShadowCoverage(root, [], minimum)).toBe(minimum);
  const primary = new DirectionalLight("sun", new Vector3(-1, -1, 0), scene);
  const manager = createPlanetShadows(scene);
  manager.setPrimaryLight(primary);
  const update = () =>
    manager.update([{ node: root, radius: minimum, lod: 0 }]);
  const bounds = vi.spyOn(ring, "getBoundingInfo");
  try {
    update();
    const key = scene.getLightByName("planet-hero-key") as DirectionalLight;
    const generator = key.getShadowGenerator() as ShadowGenerator;
    expect(key.shadowFrustumSize).toBeCloseTo(expected * 2.05);
    expect(key.shadowMinZ).toBeCloseTo(expected);
    expect(key.shadowMaxZ).toBeCloseTo(expected * 7);
    expect(
      Vector3.Distance(key.position, root.getAbsolutePosition()),
    ).toBeCloseTo(expected * 4);
    expect(generator.normalBias).toBeCloseTo(minimum * 0.0008);
    expect(generator.transparencyShadow).toBe(true);
    expect(generator.enableSoftTransparentShadow).toBe(true);
    bounds.mockClear();
    update();
    expect(bounds).not.toHaveBeenCalled();
    parent.scaling.setAll(3);
    update();
    expect(key.shadowFrustumSize).toBeCloseTo(expected * 1.5 * 2.05);
    expect(bounds).toHaveBeenCalled();
  } finally {
    bounds.mockRestore();
    manager.dispose();
    scene.dispose();
    engine.dispose();
  }
});
