import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { Scene } from "@babylonjs/core/scene";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { glslPluginHost } from "../glsl-plugin-host";
/** Bounded local visibility/facing irradiance reflected by receiving basalt albedo.
 * The calibrated gain preserves near-vent response without treating rock as an emitter. */
export class NativeLavaSpillPlugin extends MaterialPluginBase {
  age = 0;
  enabled = true;
  constructor(material: PBRMaterial) {
    super(glslPluginHost(material), "NativeLavaSpill", 180, {}, true, true);
  }
  override getClassName() {
    return "NativeLavaSpill";
  }
  override getAttributes(attributes: string[]) {
    attributes.push("nativeLavaRadiance");
  }
  override getUniforms() {
    return {
      ubo: [{ name: "nativeLavaPulse", size: 1, type: "float" }],
      fragment: "uniform float nativeLavaPulse;",
    };
  }
  override bindForSubMesh(buffer: UniformBuffer) {
    buffer.updateFloat(
      "nativeLavaPulse",
      this.enabled ? 0.9 + 0.1 * Math.sin(this.age * 0.6) : 0,
    );
  }
  override getCustomCode(type: string): Record<string, string> | null {
    if (type === "vertex")
      return {
        CUSTOM_VERTEX_DEFINITIONS:
          "attribute vec3 nativeLavaRadiance; varying vec3 vNativeLavaRadiance;",
        CUSTOM_VERTEX_MAIN_END: "vNativeLavaRadiance=nativeLavaRadiance;",
      };
    if (type === "fragment")
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "varying vec3 vNativeLavaRadiance;",
        CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:
          "finalDiffuse+=max(vec3(0.0),vNativeLavaRadiance)*nativeLavaPulse*surfaceAlbedo*3.0;",
      };
    return null;
  }
}
export function createNativeBasaltMaterial(scene: Scene, name: string) {
  const material = new PBRMaterial(name, scene, true);
  material.metallic = 0.18;
  material.roughness = 0.34;
  material.directIntensity = 1.45;
  material.environmentIntensity = 0.85;
  material.specularIntensity = 1.1;
  material.maxSimultaneousLights = 4;
  material.clearCoat.isEnabled = true;
  material.clearCoat.intensity = 0.12;
  material.clearCoat.roughness = 0.27;
  return { material, spill: new NativeLavaSpillPlugin(material) };
}
