import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";

export const ICE_FINISH = Object.freeze({
  roughness: 0.21,
  ior: 1.31,
  coat: 0.22,
  coatRoughness: 0.12,
});
const clamp = (v: number) =>
  Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
/** Bounded presentation approximation, not physical transmission or volumetric SSS.
 * Deep crevasses stay dark; only thin edges and shallow illuminated cuts scatter.
 */
export function iceOpticalResponse(
  depth: number,
  thinness: number,
  normalView: number,
  normalLight: number,
) {
  const d = clamp(depth),
    t = clamp(thinness),
    facing = clamp(normalView);
  const rim = Math.pow(1 - facing, 4) * t;
  const back = Math.pow(clamp(-normalLight), 2) * t;
  const cavity = 4 * d * Math.pow(1 - d, 2);
  const sunGate = 0.18 + 0.82 * clamp(normalLight * 0.5 + 0.5);
  return {
    albedoRetention: 1 - 0.78 * d,
    scatter: Math.min(
      0.24,
      (rim * 0.13 + back * 0.08 + cavity * 0.045) * sunGate,
    ),
    rim,
  };
}

class IceOpticsPlugin extends MaterialPluginBase {
  private readonly towardLight = new Vector3(0.6, 1, -0.45).normalize();
  constructor(material: PBRMaterial) {
    super(material, "AstraIceOptics", 180, {}, true, true);
  }
  override getClassName() {
    return "AstraIceOptics";
  }
  override getAttributes(attributes: string[]) {
    attributes.push("iceOptics");
  }
  override getUniforms() {
    return {
      ubo: [{ name: "iceLightDirection", size: 3, type: "vec3" }],
      fragment: "uniform vec3 iceLightDirection;",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer, scene: Scene) {
    const source = ["planet-hero-key", "exterior-key", "preview-sun"]
      .map((name) => scene.getLightByName(name))
      .find((light) => light?.isEnabled()) as DirectionalLight | undefined;
    if (source?.direction) {
      this.towardLight.copyFrom(source.direction).scaleInPlace(-1).normalize();
    }
    buffer.updateVector3("iceLightDirection", this.towardLight);
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS:
          "attribute vec2 iceOptics; varying vec2 vIceOptics;",
        CUSTOM_VERTEX_MAIN_END: "vIceOptics = clamp(iceOptics, 0.0, 1.0);",
      };
    if (type === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "varying vec2 vIceOptics;",
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        float iceDepth = clamp(vIceOptics.x, 0.0, 1.0);
        surfaceAlbedo *= mix(vec3(1.0), vec3(0.13,0.26,0.44), iceDepth * 0.90);
      `,
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        float iceThin = clamp(vIceOptics.y, 0.0, 1.0);
        float iceNV = clamp(dot(normalW, viewDirectionW), 0.0, 1.0);
        float iceNL = dot(normalW, normalize(iceLightDirection));
        float iceRim = pow(1.0 - iceNV, 4.0) * iceThin;
        float iceBack = pow(max(0.0, -iceNL), 2.0) * iceThin;
        float iceCavity = 4.0 * iceDepth * pow(1.0 - iceDepth, 2.0);
        float iceSunGate = 0.18 + 0.82 * clamp(iceNL * 0.5 + 0.5, 0.0, 1.0);
        float iceScatter = min(0.24, (iceRim * 0.13 + iceBack * 0.08 + iceCavity * 0.045) * iceSunGate);
        finalEmissive += vec3(0.025,0.48,0.95) * iceScatter;
      `,
      };
    return null;
  }
}

/** Requires per-vertex iceOptics=(cavity depth01, thin edge01).
 * Uses the existing PBR direct light/shadow path and adds no lights or geometry.
 */
export function createIceMaterial(scene: Scene, name: string): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = Color3.White();
  material.metallic = 0;
  material.roughness = ICE_FINISH.roughness;
  material.indexOfRefraction = ICE_FINISH.ior;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = ICE_FINISH.coat;
  material.clearCoat.roughness = ICE_FINISH.coatRoughness;
  material.clearCoat.indexOfRefraction = ICE_FINISH.ior;
  material.directIntensity = 1.45;
  material.environmentIntensity = 0.9;
  material.maxSimultaneousLights = 4;
  material.forceIrradianceInFragment = true;
  material.enableSpecularAntiAliasing = true;
  material.metadata = {
    role: "exposed-water-ice",
    optics: "bounded opaque rim/backlight/depth approximation",
    attribute: "iceOptics",
  };
  new IceOpticsPlugin(material);
  return material;
}
