import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createPlanetShadows } from "./planet-shadows";

test("manager serializes pending surfaces and prepares the actual restored-light order", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  const fill = new HemisphericLight("fill", Vector3.Up(), scene);
  const manager = createPlanetShadows(scene);
  manager.setPrimaryLight(sun);
  const material = new PBRMaterial("native", scene);
  const meshes = [0, 1].map((index) => {
    const mesh = CreateBox("native surface", {}, scene);
    mesh.material = material;
    mesh.metadata = { role: "planet", partId: "body:" + index };
    mesh.setEnabled(false);
    return mesh;
  });
  const calls: { id: string; lights: string[] }[] = [];
  const receiver = vi
    .spyOn(material, "forceCompilationAsync")
    .mockImplementation(async (mesh) => {
      calls.push({
        id: mesh.metadata.partId,
        lights: mesh.lightSources.map((light) => light.name),
      });
      expect(scene.lights).toHaveLength(3);
      expect(sun.excludedMeshes).toHaveLength(0);
      expect(mesh.isVisible).toBe(false);
    });
  const caster = vi
    .spyOn(ShadowGenerator.prototype, "forceCompilationAsync")
    .mockResolvedValue();
  try {
    await Promise.all(
      meshes.map((mesh) => manager.prepare(mesh, async () => {})),
    );
    expect(calls.map((call) => call.id)).toEqual([
      "body:0",
      "body:0",
      "body:0",
      "body:1",
      "body:1",
      "body:1",
    ]);
    expect(calls.slice(0, 3).map((call) => call.lights)).toEqual([
      [sun.name, fill.name],
      [fill.name, sun.name],
      [fill.name, "planet-preparation-key"],
    ]);
    expect(scene.meshes).toHaveLength(2);
    expect(meshes.every((mesh) => mesh.material === material)).toBe(true);
    manager.dispose();
    await expect(manager.prepare(meshes[0], async () => {})).rejects.toThrow(
      "invalidated",
    );
  } finally {
    receiver.mockRestore();
    caster.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});
