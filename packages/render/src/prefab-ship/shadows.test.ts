import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createPrefabShadowBinding } from "./shadows";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { createConstructionLighting } from "../construction-instance";

it("binds actual opaque replacement geometry across views and releases only owned casters", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("star", Vector3.Down(), scene);
  const generator = new ShadowGenerator(16, light);
  const solid = new PBRMaterial("housing", scene);
  const glass = new PBRMaterial("window", scene);
  glass.alpha = 0.3;
  glass.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  const box = (name: string, material = solid) => {
    const mesh = CreateBox(name, {}, scene);
    mesh.material = material;
    return mesh;
  };
  const unrelated = box("crew");
  unrelated.receiveShadows = true;
  generator.addShadowCaster(unrelated);
  const hull = box("hull"),
    flight = box("flight"),
    door = box("door");
  flight.setEnabled(false);
  const window = box("glass", glass),
    plume = box("plume");
  plume.metadata = { role: "effect" };
  const binding = createPrefabShadowBinding(generator);
  const list = () => generator.getShadowMap()!.renderList!;
  try {
    binding.sync([hull, flight, door, window, plume]);
    binding.sync([hull, flight, door, window, plume]);
    expect(list().map((mesh) => mesh.name)).toEqual([
      "crew",
      "hull",
      "flight",
      "door",
    ]);
    expect([hull, flight, door].every((mesh) => mesh.receiveShadows)).toBe(
      true,
    );
    expect(window.receiveShadows).toBe(false);
    expect(plume.receiveShadows).toBe(false);
    expect(flight.isEnabled()).toBe(false);
    hull.setEnabled(false);
    flight.setEnabled(true);
    binding.sync([hull, flight, door]);
    expect(list().map((mesh) => mesh.name)).toEqual([
      "crew",
      "hull",
      "flight",
      "door",
    ]);
    const replacement = box("replacement");
    binding.sync([replacement, door]);
    expect(list().map((mesh) => mesh.name)).toEqual([
      "crew",
      "door",
      "replacement",
    ]);
    expect(hull.receiveShadows).toBe(false);
    expect(flight.receiveShadows).toBe(false);
    replacement.dispose();
    expect(list().map((mesh) => mesh.name)).toEqual(["crew", "door"]);
    binding.dispose();
    binding.dispose();
    expect(list().map((mesh) => mesh.name)).toEqual(["crew"]);
    expect(door.receiveShadows).toBe(false);
    expect(unrelated.receiveShadows).toBe(true);
    binding.sync([unrelated]);
    binding.dispose();
    expect(list().map((mesh) => mesh.name)).toEqual(["crew"]);
    expect(unrelated.receiveShadows).toBe(true);
  } finally {
    binding.dispose();
    scene.dispose();
    engine.dispose();
  }
});

it("keeps ship shadow depth finite and independent of distant-space camera clipping", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 6, -10), scene);
  scene.activeCamera = camera;
  camera.maxZ = 1600;
  const hull = CreateBox("hull", { size: 2 }, scene);
  hull.computeWorldMatrix(true);
  const lighting = createConstructionLighting(scene, [hull]);
  try {
    const matrix = lighting.shadowGenerator.getTransformMatrix();
    expect([...matrix.m].every(Number.isFinite)).toBe(true);
    const min = lighting.primaryLight.shadowMinZ!;
    const max = lighting.primaryLight.shadowMaxZ!;
    expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
    expect(max - min).toBeGreaterThan(0);
    expect(max - min).toBeLessThan(10);
    camera.maxZ = 1_000_000;
    lighting.shadowGenerator.getTransformMatrix();
    expect(lighting.primaryLight.shadowMinZ).toBe(min);
    expect(lighting.primaryLight.shadowMaxZ).toBe(max);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
