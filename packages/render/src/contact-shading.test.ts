import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  CONTACT_SHADING,
  CONTACT_SHADING_STORAGE_KEY,
  contactShadingCompatible,
  contactShadingRequested,
  createContactShading,
} from "./contact-shading";

const store = (value: string | null) => ({ getItem: () => value });

describe("contact shading preference", () => {
  it("defaults on and honours the stored and URL switches", () => {
    expect(contactShadingRequested(undefined)).toBe(true);
    expect(contactShadingRequested(store(null))).toBe(true);
    expect(contactShadingRequested(store("off"))).toBe(false);
    expect(contactShadingRequested(store("off"), "?ao=1")).toBe(true);
    expect(contactShadingRequested(store(null), "?x=1&ao=0")).toBe(false);
    expect(CONTACT_SHADING_STORAGE_KEY).toMatch(/contactShading/);
  });

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
    expect(scene.prePassRenderer).toBeFalsy();
    shading.dispose();
    scene.dispose();
    engine.dispose();
  });
});
