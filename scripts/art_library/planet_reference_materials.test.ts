import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { referenceMaterial } from "./planet_reference_materials";
it("preserves authored native PBR optical values without retinting", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const material = referenceMaterial(scene, {
      name: "crystal-edge",
      linearColor: [0.1, 0.2, 0.3],
      roughness: 0.17,
      metallic: 0.04,
      emissiveColor: [0.7, 0.1, 0.3],
      emissiveStrength: 0.7,
      ior: 1.48,
    });
    expect(material.albedoColor.asArray()).toEqual([0.1, 0.2, 0.3]);
    expect(material.roughness).toBe(0.17);
    expect(material.metallic).toBe(0.04);
    expect(material.emissiveColor.asArray()).toEqual([0.7, 0.1, 0.3]);
    expect(material.emissiveIntensity).toBe(0.7);
    expect(material.indexOfRefraction).toBe(1.48);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it("preserves authored ring transparency rather than turning dust into opaque plates", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const material = referenceMaterial(scene, {
      name: "dust",
      linearColor: [0.3, 0.1, 0.4],
      roughness: 0.9,
      alpha: 0.65,
      alphaMode: "BLEND",
      doubleSided: true,
      useTextureAlpha: true,
    });
    expect(material.alpha).toBe(0.65);
    expect(material.backFaceCulling).toBe(false);
    expect(material.useAlphaFromAlbedoTexture).toBe(true);
    expect(material.needAlphaBlending()).toBe(true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
it("preserves ice and water authored clearcoat without changing underlying albedo", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const ice = referenceMaterial(scene, {
        name: "ice",
        linearColor: [0.1, 0.4, 0.7],
        roughness: 0.3,
        ior: 1.31,
        clearcoatFactor: 0.42,
        clearcoatRoughnessFactor: 0.1,
      }),
      water = referenceMaterial(scene, {
        name: "water",
        linearColor: [0.01, 0.1, 0.3],
        roughness: 0.16,
        clearCoat: { intensity: 0.3, roughness: 0.1 },
      });
    expect(ice.clearCoat.isEnabled).toBe(true);
    expect(ice.clearCoat.intensity).toBe(0.42);
    expect(ice.clearCoat.roughness).toBe(0.1);
    expect(ice.indexOfRefraction).toBe(1.31);
    expect(water.clearCoat.intensity).toBe(0.3);
    expect(water.albedoColor.asArray()).toEqual([0.01, 0.1, 0.3]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

it("preserves glTF double-sided illumination as well as visibility", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const material = referenceMaterial(scene, {
    name: "ring",
    linearColor: [1, 1, 1],
    roughness: 0.86,
    doubleSided: true,
  });
  expect(material.backFaceCulling).toBe(false);
  expect(material.twoSidedLighting).toBe(true);
  scene.dispose();
  engine.dispose();
});
