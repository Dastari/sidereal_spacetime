import { MaterialPluginEvent } from "@babylonjs/core/Materials/materialPluginEvent";
import { Material } from "@babylonjs/core/Materials/material";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";

/** Babylon 9.25 declares previousWorld for PREPASS_VELOCITY_LINEAR in WGSL,
 * but PrepareAttributesForInstances only lists it for PREPASS_VELOCITY.
 * Supply the missing bindings without replacing the authored material/shader. */
class TemporalInstanceAttributes extends MaterialPluginBase {
  constructor(material: StandardMaterial | PBRBaseMaterial) {
    super(material, "TemporalInstanceAttributes", 210, {}, true, true);
  }
  override isCompatible(language: ShaderLanguage) {
    return language === ShaderLanguage.WGSL || language === ShaderLanguage.GLSL;
  }
  override getAttributes(attributes: string[], scene: Scene) {
    if (!scene.needsPreviousWorldMatrices || !attributes.includes("world0"))
      return;
    for (let i = 0; i < 4; i++) {
      const name = `previousWorld${i}`;
      if (!attributes.includes(name)) attributes.push(name);
    }
  }
}
export function prepareTemporalInstanceAttributes(
  scene: Scene,
  materials: Iterable<Material> = scene.materials,
) {
  for (const material of materials) {
    if (!(
      material instanceof StandardMaterial ||
      material instanceof PBRBaseMaterial
    ))
      continue;
    if (!material.pluginManager?.getPlugin("TemporalInstanceAttributes"))
      new TemporalInstanceAttributes(material);
  }
}

export function createTemporalInstanceAttributes(scene: Scene) {
  prepareTemporalInstanceAttributes(scene);
  // Scene's added-material notification is asynchronous; this event runs before
  // a newly constructed material can compile its first instanced effect.
  const observer = Material.OnEventObservable.add((material) => {
    if (material.getScene() === scene)
      prepareTemporalInstanceAttributes(scene, [material]);
  }, MaterialPluginEvent.Created);
  return {
    dispose() {
      Material.OnEventObservable.remove(observer);
    },
  };
}
