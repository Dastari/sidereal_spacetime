import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CONTACT_SHADING,
  contactShadingCompatible,
  createContactShading,
} from "./contact-shading";

describe("contact shading preference", () => {
  it("only shares the scene target with non-temporal, non-supersampled antialiasing", () => {
    for (const mode of ["off", "msaa", "fxaa", "msaa-fxaa"])
      expect(contactShadingCompatible(mode)).toBe(true);
    for (const mode of ["taa", "ssaa"])
      expect(contactShadingCompatible(mode)).toBe(false);
  });

  it("is short-range and never darkens more than the base floor allows", () => {
    expect(CONTACT_SHADING.radius).toBeLessThanOrEqual(0.6);
    // Deepest possible darkening (every sample occluded) stays at or below half.
    expect(
      CONTACT_SHADING.totalStrength - CONTACT_SHADING.base,
    ).toBeLessThanOrEqual(0.5);
    expect(CONTACT_SHADING.ratio).toBeLessThanOrEqual(0.5);
  });

  it("stays inert when disabled", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new ArcRotateCamera("c", 0, 1, 10, Vector3.Zero(), scene);
    const shading = createContactShading(
      scene,
      camera,
      { snapshot: () => ({ effective: { mode: "msaa", samples: 4 } }) },
      false,
    );
    scene.render();
    expect(shading.active).toBe(false);
    expect(shading.enabled).toBe(false);
    expect(scene.prePassRenderer).toBeFalsy();
    // Live switch (F3 debug window): the wish is recorded; attachment follows on the next frame.
    shading.enabled = true;
    expect(shading.enabled).toBe(true);
    shading.enabled = false;
    scene.render();
    expect(shading.active).toBe(false);
    shading.dispose();
    scene.dispose();
    engine.dispose();
  });
});
