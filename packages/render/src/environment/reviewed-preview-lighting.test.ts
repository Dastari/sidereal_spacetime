import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { applyReviewedPreviewLighting } from "./reviewed-preview-lighting";

describe("Genesis celestial lighting", () => {
  it("restores planetary illumination after viewing a star without changing lighting switches", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const sun = new DirectionalLight("sun", Vector3.Down(), scene);
    const fill = new HemisphericLight("fill", Vector3.Up(), scene);
    try {
      scene.lightsEnabled = false;
      scene.shadowsEnabled = false;
      applyReviewedPreviewLighting(scene, sun, fill, true);
      expect([
        sun.intensity,
        fill.intensity,
        scene.environmentIntensity,
      ]).toEqual([0.8, 0, 0]);
      expect(sun.diffuse.asArray()).toEqual([1, 0.87, 0.61]);
      applyReviewedPreviewLighting(scene, sun, fill, false);
      expect([
        sun.intensity,
        fill.intensity,
        scene.environmentIntensity,
      ]).toEqual([2.1, 0.2, 0.28]);
      expect(sun.diffuse.asArray()).toEqual([0.93, 0.95, 1]);
      expect(scene.lightsEnabled).toBe(false);
      expect(scene.shadowsEnabled).toBe(false);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
