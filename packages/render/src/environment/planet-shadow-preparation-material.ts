import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SerializationHelper } from "@babylonjs/core/Misc/decorators.serialization";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

/** Controlled native PBR preparation clone: standard plugin fields are cloned by
 * Babylon, then decorated texture references are shared. Never bound to live meshes.
 */
export function createOpaquePlanetPreparationMaterial(source: PBRMaterial) {
  const scene = source.getScene();
  const before = new Set(scene.textures);
  const beforeMaterials = new Set(scene.materials);
  let material: PBRMaterial | undefined;
  const owned = new Set<BaseTexture>();
  function collect() {
    for (const texture of scene.textures)
      if (!before.has(texture)) owned.add(texture);
  }
  function dispose() {
    material?.dispose(false, false);
    for (const texture of owned) texture.dispose();
    owned.clear();
  }
  try {
    material = source.clone(source.name + "-opaque-preparation");
    // clone() preserves complete plugin configuration; Instanciate shares decorated
    // resources instead of allocating another texture copy. Shared values stay read-only.
    SerializationHelper.Instanciate(() => material!, source);
    for (const name of [
      "clearCoat",
      "iridescence",
      "anisotropy",
      "brdf",
      "sheen",
      "subSurface",
      "detailMap",
    ] as const) {
      SerializationHelper.Instanciate(() => material![name], source[name]);
    }
    material.imageProcessingConfiguration =
      source.imageProcessingConfiguration.clone();
    material.imageProcessingConfiguration.colorGradingTexture =
      source.imageProcessingConfiguration.colorGradingTexture;
    material.imageProcessingConfiguration.applyByPostProcess = true;
    collect();
    // Native built-in plugin texture fields now share the source; clone-owned
    // temporaries may be released without ever disposing a source/RTT texture.
    const used = new Set(material.getActiveTextures());
    for (const texture of owned)
      if (!used.has(texture)) {
        texture.dispose();
        owned.delete(texture);
      }
    return { material, dispose };
  } catch (error) {
    collect();
    // clone() can throw inside plugin.copyTo after registering its new material,
    // before returning it to this helper. Recover that synchronous owned allocation.
    for (const partial of [...scene.materials]) {
      if (!beforeMaterials.has(partial) && partial !== material)
        partial.dispose(false, false);
    }
    dispose();
    throw error;
  }
}
