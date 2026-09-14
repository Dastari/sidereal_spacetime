import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";

/** Manual clones of AssetContainer meshes retain their native material objects,
 * but cloning does not register those materials with the scene. Match Babylon's
 * instantiateModelsToScene convention so scene lighting/shadow/graphics changes
 * invalidate their shader defines. The asset container keeps disposal ownership;
 * prototype meshes stay outside the scene and no material is cloned/replaced.
 */
export function registerReferencedSceneMaterial(
  scene: Scene,
  material: Material | null,
) {
  const visited = new Set<Material>();
  function register(value: Material | null) {
    if (!value || visited.has(value)) return;
    visited.add(value);
    if (value instanceof MultiMaterial) {
      if (!scene.multiMaterials.includes(value)) scene.addMultiMaterial(value);
      for (const child of value.subMaterials) register(child);
    } else if (!scene.materials.includes(value)) scene.addMaterial(value);
  }
  register(material);
}
