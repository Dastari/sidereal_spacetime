import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { Color3 } from "@babylonjs/core/Maths/math.color";

export { createGlowOccluders } from "./glow-occluders";

/** Shared ship halo profile for public play and prefab review. Material emission stays intact. */
export const SHIP_GLOW_PROFILE = {
  intensity: 0.18,
  blurKernelSize: 16,
  mainTextureFixedSize: 512,
} as const;

export function applyShipGlowProfile(glow: GlowLayer): void {
  glow.intensity = SHIP_GLOW_PROFILE.intensity;
  // Large amber radiator surfaces get less halo than the compact cyan interfaces.
  glow.customEmissiveColorSelector = (mesh, _sub, material, result) => {
    const source = material as typeof material & {
      emissiveColor?: Color3;
      emissiveIntensity?: number;
    };
    const color = source.emissiveColor;
    if (!color) return result.set(0, 0, 0, 0);
    const gain =
      (source.emissiveIntensity ?? 1) *
      (/emit_b|radiator/.test(`${material.name} ${mesh.name}`) ? 0.3 : 0.85);
    result.set(color.r * gain, color.g * gain, color.b * gain, material.alpha);
  };
}
