import type { Scene } from "@babylonjs/core/scene";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { authoredHaloColor } from "./authored-asset-lighting";
import type { Color3 } from "@babylonjs/core/Maths/math.color";

export { createGlowOccluders } from "./glow-occluders";

/** Shared ship halo profile for public play and prefab review. Material emission stays intact. */
export const SHIP_GLOW_PROFILE = {
  intensity: 0.18,
  blurKernelSize: 16,
  mainTextureFixedSize: 512,
} as const;

/** Eligible authored assets in any context; keep one target/pass and an explicit capability fallback. */
export function authoredGlowTargetOptions(scene: Scene, eligible: boolean) {
  const caps = scene.getEngine().getCaps();
  const assetHalo =
    eligible &&
    caps.textureHalfFloatRender &&
    caps.textureHalfFloatLinearFiltering;
  return {
    assetHalo,
    ...(assetHalo ? { mainTextureType: Constants.TEXTURETYPE_HALF_FLOAT } : {}),
  };
}

export function applyShipGlowProfile(
  glow: GlowLayer,
  options: { assetHalo?: boolean } = {},
): void {
  glow.intensity = SHIP_GLOW_PROFILE.intensity;
  // Large amber radiator surfaces get less halo than the compact cyan interfaces.
  glow.customEmissiveColorSelector = (mesh, _sub, material, result) => {
    const source = material as typeof material & {
      emissiveColor?: Color3;
      emissiveIntensity?: number;
      metadata?: { authoredAssetEmission?: unknown };
    };
    const color = source.emissiveColor;
    if (!color) return result.set(0, 0, 0, 0);
    if (options.assetHalo && source.metadata?.authoredAssetEmission) {
      const [r, g, b] = authoredHaloColor(color, source.emissiveIntensity ?? 1);
      return result.set(r, g, b, material.alpha);
    }
    const gain =
      (source.emissiveIntensity ?? 1) *
      (/emit_b|radiator/.test(`${material.name} ${mesh.name}`) ? 0.3 : 0.85);
    // Descriptor HDR must not release the previous UNORM ceiling on unrelated fixtures.
    const channel = (n: number) => (options.assetHalo ? Math.min(1, n) : n);
    result.set(
      channel(color.r * gain),
      channel(color.g * gain),
      channel(color.b * gain),
      material.alpha,
    );
  };
}
