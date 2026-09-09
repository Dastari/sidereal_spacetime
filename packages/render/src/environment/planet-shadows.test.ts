import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createPlanetShadows } from "./planet-shadows";
test("hero shadow allocation is isolated, nearest-only and restores primary light exclusions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  const primary = new DirectionalLight(
    "primary",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  const ship = CreateBox("ship", {}, scene);
  primary.excludedMeshes = [ship];
  const candidates = [0, 50].map((x, i) => {
    const node = new TransformNode("body" + i, scene);
    node.position.x = x;
    const surface = CreateBox("surface" + i, {}, scene);
    surface.parent = node;
    surface.metadata = { style: i === 1 ? "ice" : "temperate" };
    surface.material = new PBRMaterial("pbr" + i, scene);
    return { node, radius: 1, lod: 0, surface };
  });
  const manager = createPlanetShadows(scene);
  manager.setPrimaryLight(primary);
  manager.update(candidates);
  const key = scene.getLightByName("planet-hero-key") as DirectionalLight;
  expect(key.includedOnlyMeshes).toHaveLength(1);
  expect(key.includedOnlyMeshes[0]).toBe(candidates[0].surface);
  expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
    ship.uniqueId,
    candidates[0].surface.uniqueId,
  ]);
  expect(key.getShadowGenerator()?.getShadowMap()?.getSize().width).toBe(1024);
  expect((key.getShadowGenerator() as ShadowGenerator).normalBias).toBeCloseTo(
    0.0008,
  );
  manager.update([{ ...candidates[1], lod: 0 }]);
  expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
    ship.uniqueId,
    candidates[1].surface.uniqueId,
  ]);
  expect(candidates[0].surface.receiveShadows).toBe(false);
  expect((key.getShadowGenerator() as ShadowGenerator).normalBias).toBeCloseTo(
    0.003,
  );
  manager.update([candidates[0]]);
  expect((key.getShadowGenerator() as ShadowGenerator).normalBias).toBeCloseTo(
    0.0008,
  );
  manager.update([
    { node: new TransformNode("gas-no-pbr", scene), radius: 1, lod: 0 },
  ]);
  expect(key.isEnabled()).toBe(false);
  expect(primary.excludedMeshes.map((m) => m.uniqueId)).toEqual([
    ship.uniqueId,
  ]);
  manager.dispose();
  scene.dispose();
  engine.dispose();
});
