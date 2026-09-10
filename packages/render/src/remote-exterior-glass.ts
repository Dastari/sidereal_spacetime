import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";

/** Remote stock windows are a closed exterior representation. Keep the native
 * tint/specular/normal maps, but never look through into a missing/private cabin.
 * The caller caches and owns the clone; local glass is never mutated. */
export function cloneOpaqueRemoteGlass(
  material: Material,
): PBRMaterial | undefined {
  if (
    !(material instanceof PBRMaterial) ||
    (!/\b(?:glass|glazing)\b/i.test(material.name) &&
      !material.subSurface.isRefractionEnabled)
  )
    return undefined;
  const opaque = material.clone(`${material.name}--remote-opaque`);
  opaque.alpha = 1;
  opaque.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
  opaque.useAlphaFromAlbedoTexture = false;
  opaque.subSurface.isRefractionEnabled = false;
  opaque.subSurface.refractionIntensity = 0;
  opaque.subSurface.linkRefractionWithTransparency = false;
  opaque.subSurface.isTranslucencyEnabled = false;
  opaque.subSurface.translucencyIntensity = 0;
  return opaque;
}
