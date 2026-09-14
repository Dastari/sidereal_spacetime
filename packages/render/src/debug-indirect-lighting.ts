import type { Scene } from "@babylonjs/core/scene";
import type { Light } from "@babylonjs/core/Lights/light";
import type { Color3 } from "@babylonjs/core/Maths/math.color";

/** Reversible IBL/ambient/hemisphere override. Direct lights and emissive or
 * baked surface textures are independent and are deliberately not rewritten.
 */
export function createIndirectLightingOverride(scene: Scene) {
  let environment: number | undefined;
  let ambient: Color3 | undefined;
  const hemispheres = new Map<Light, number>();
  function restore() {
    if (environment !== undefined) scene.environmentIntensity = environment;
    if (ambient) scene.ambientColor.copyFrom(ambient);
    environment = undefined;
    ambient = undefined;
    for (const [light, intensity] of hemispheres)
      if (!light.isDisposed()) light.intensity = intensity;
    hemispheres.clear();
  }
  return {
    restore,
    apply(enabled: boolean) {
      if (enabled) {
        restore();
        return;
      }
      if (environment === undefined) environment = scene.environmentIntensity;
      if (!ambient && scene.ambientColor) ambient = scene.ambientColor.clone();
      scene.environmentIntensity = 0;
      scene.ambientColor?.set(0, 0, 0);
      for (const light of scene.lights ?? [])
        if (light.getTypeID() === 3 && !light.isDisposed()) {
          if (!hemispheres.has(light)) hemispheres.set(light, light.intensity);
          light.intensity = 0;
        }
    },
    dispose: restore,
  };
}
