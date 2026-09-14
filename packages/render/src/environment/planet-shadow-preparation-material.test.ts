import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRMaterialDefines } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { createOpaquePlanetPreparationMaterial } from "./planet-shadow-preparation-material";

test("opaque preparation retains native PBR/plugins and texture identity with independent image processing", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    source = new PBRMaterial("native", scene);
  const texture = new Texture(null, scene);
  source.albedoTexture = texture;
  source.clearCoat.isEnabled = true;
  source.clearCoat.intensity = 0.42;
  source.clearCoat.roughness = 0.27;
  source.clearCoat.texture = texture;
  source.subSurface.isTranslucencyEnabled = true;
  source.subSurface.translucencyIntensity = 0.37;
  source.imageProcessingConfiguration.toneMappingEnabled = true;
  source.imageProcessingConfiguration.exposure = 1.7;
  const originalConfig = source.imageProcessingConfiguration,
    originalTextures = [...scene.textures],
    dispose = vi.spyOn(texture, "dispose");
  const prepared = createOpaquePlanetPreparationMaterial(source);
  try {
    expect(prepared.material).not.toBe(source);
    expect(prepared.material.imageProcessingConfiguration).not.toBe(
      originalConfig,
    );
    expect(prepared.material.albedoTexture).toBe(texture);
    expect(prepared.material.clearCoat.texture).toBe(texture);
    expect(prepared.material.clearCoat.intensity).toBe(0.42);
    expect(prepared.material.clearCoat.roughness).toBe(0.27);
    expect(prepared.material.subSurface.translucencyIntensity).toBe(0.37);
    expect(source.imageProcessingConfiguration).toBe(originalConfig);
    expect(originalConfig.applyByPostProcess).toBe(false);
    expect(scene.imageProcessingConfiguration).toBe(originalConfig);
    const base = new PBRMaterialDefines(),
      rtt = new PBRMaterialDefines(),
      expected = new PBRMaterialDefines();
    originalConfig.prepareDefines(base);
    prepared.material.imageProcessingConfiguration.prepareDefines(rtt);
    const targetConfig = originalConfig.clone();
    targetConfig.applyByPostProcess = true;
    targetConfig.prepareDefines(expected);
    expect(rtt.toString()).toBe(expected.toString());
    expect(base.toString()).not.toBe(rtt.toString());
    expect(rtt.toString()).toContain("#define IMAGEPROCESSINGPOSTPROCESS");
  } finally {
    prepared.dispose();
    expect(dispose).not.toHaveBeenCalled();
    expect(scene.textures).toEqual(originalTextures);
    expect(source.albedoTexture).toBe(texture);
    scene.dispose();
    engine.dispose();
  }
});

test("failed plugin cloning removes the partially allocated private material", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    source = new PBRMaterial("native", scene);
  const before = [...scene.materials];
  const copy = vi.spyOn(source.clearCoat, "copyTo").mockImplementation(() => {
    throw new Error("plugin clone failed");
  });
  try {
    expect(() => createOpaquePlanetPreparationMaterial(source)).toThrow(
      "plugin clone failed",
    );
    expect(scene.materials.map((m) => m.uniqueId)).toEqual(
      before.map((m) => m.uniqueId),
    );
  } finally {
    copy.mockRestore();
    scene.dispose();
    engine.dispose();
  }
});
