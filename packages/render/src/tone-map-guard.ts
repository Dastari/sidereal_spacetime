import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/ShadersInclude/imageProcessingFunctions";
import "@babylonjs/core/ShadersWGSL/ShadersInclude/imageProcessingFunctions";

/** Babylon 9.25's KHR PBR Neutral tone mapping subtracts an offset derived from
 * the smallest channel. With a non power-of-two exposure a GPU may fuse that
 * multiply into the subtraction, so the smallest channel of a nearly black
 * pixel lands a rounding error below zero. The gamma `pow` of that is NaN,
 * which NVIDIA clamps to full intensity: pure red or green speckle on surfaces
 * lit only by a faint lamp. Clamp the tone-mapped colour before it is encoded. */
export const TONE_MAP_GUARDS = [
  {
    store: ShaderStore.IncludesShadersStore,
    from: "result.rgb=PBRNeutralToneMapping(result.rgb);",
    to: "result.rgb=max(PBRNeutralToneMapping(result.rgb),vec3(0.));",
  },
  {
    store: ShaderStore.IncludesShadersStoreWGSL,
    from: "rgb=PBRNeutralToneMapping(rgb);",
    to: "rgb=max(PBRNeutralToneMapping(rgb),vec3f(0.0));",
  },
] as const;

/** Idempotent. Returns false when the pinned shader text no longer matches. */
export function guardNeutralToneMapping() {
  let guarded = true;
  for (const { store, from, to } of TONE_MAP_GUARDS) {
    const source = store.imageProcessingFunctions;
    if (source?.includes(to)) continue;
    if (!source?.includes(from)) {
      guarded = false;
      continue;
    }
    store.imageProcessingFunctions = source.replace(from, to);
  }
  return guarded;
}
