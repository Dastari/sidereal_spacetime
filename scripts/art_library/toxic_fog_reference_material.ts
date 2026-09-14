import type { Scene } from "@babylonjs/core/scene";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  referenceMaterial,
  type ReferenceMaterialRole,
} from "./planet_reference_materials";
export type WeatherTextureLoader = (
  file: string,
  role: ReferenceMaterialRole,
  linear: boolean,
  alpha: boolean,
  prefix: string,
) => Promise<Texture>;
/** Create once per body, share across retained LODs. Caller owns disposal and
 * its existing texture cache. No Toxic retint, translucency or intensity override. */
export async function createToxicReferenceWeatherMaterial(
  scene: Scene,
  role: ReferenceMaterialRole,
  loadTexture: WeatherTextureLoader,
) {
  if (!role.baseColorTexture || role.alphaMode !== "BLEND")
    throw new Error("Native Toxic fog requires authored BLEND density texture");
  const material = referenceMaterial(scene, role);
  try {
    material.albedoTexture = await loadTexture(
      role.baseColorTexture,
      role,
      role.textureColorSpace === "linear",
      true,
      "/planet-reference-weather-assets/",
    );
    return material;
  } catch (error) {
    material.dispose();
    throw error;
  }
}
