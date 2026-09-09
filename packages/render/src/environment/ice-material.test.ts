import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  createIceMaterial,
  iceOpticalResponse,
  ICE_FINISH,
} from "./ice-material";

describe("bounded exposed ice optics", () => {
  it("keeps deep thick cavities dark and makes thin grazing edges brighter", () => {
    expect(iceOpticalResponse(1, 0, 0, 1).scatter).toBe(0);
    expect(iceOpticalResponse(0, 1, 0, 1).scatter).toBeGreaterThan(
      iceOpticalResponse(0, 1, 1, 1).scatter,
    );
    expect(iceOpticalResponse(0.4, 0, 0.5, 1).scatter).toBeGreaterThan(
      iceOpticalResponse(1, 0, 0.5, 1).scatter,
    );
    for (const depth of [-1, 0, 0.25, 0.5, 1, 2])
      for (const thin of [0, 0.5, 1])
        for (const view of [0, 0.5, 1])
          for (const light of [-1, 0, 1]) {
            const result = iceOpticalResponse(depth, thin, view, light);
            expect(result.scatter).toBeGreaterThanOrEqual(0);
            expect(result.scatter).toBeLessThanOrEqual(0.24);
          }
  });
  it("retains opaque PBR shadowing with no extra light or shell", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const material = createIceMaterial(scene, "ice");
    expect(material.alpha).toBe(1);
    expect(material.needAlphaBlending()).toBe(false);
    expect(material.metallic).toBe(0);
    expect(material.roughness).toBe(ICE_FINISH.roughness);
    expect(material.subSurface.isRefractionEnabled).toBe(false);
    expect(material.indexOfRefraction).toBe(1.31);
    expect(scene.lights).toHaveLength(0);
    expect(scene.meshes).toHaveLength(0);
    material.dispose();
    scene.dispose();
    engine.dispose();
  });
});
