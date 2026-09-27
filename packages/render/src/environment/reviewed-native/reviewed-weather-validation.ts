import {
  MODERN_NATIVE_PLANET_LIMITS,
  validateModernNativeMaterial,
  validateModernNativePayloadBytes,
  type ModernNativeMaterial,
} from "../modern-native-planet-schema";
import type { ReviewedComposerInput } from "./reviewed-composer-input";
export type ReviewedWeatherKit = ReviewedComposerInput & {
  readonly layout: string;
  readonly materials: readonly ModernNativeMaterial[];
};
/** Cloud r002 intentionally has geometry-only channels; toxic fog requires native UV/normals. */
export function validateReviewedWeather(
  value: unknown,
  bytes: number,
): ReviewedWeatherKit {
  validateModernNativePayloadBytes(bytes);
  const kit = value as ReviewedWeatherKit;
  if (
    !kit ||
    kit.schema !== "sidereal.native-planet-kit.v1" ||
    !["cloud-banks", "toxic-fog-banks"].includes(kit.layout)
  )
    throw new Error("Invalid reviewed weather layout");
  if (
    !Array.isArray(kit.materials) ||
    !kit.materials.length ||
    kit.materials.length > MODERN_NATIVE_PLANET_LIMITS.materials
  )
    throw new Error("Invalid weather materials");
  kit.materials.forEach(validateModernNativeMaterial);
  if (
    !Array.isArray(kit.variants) ||
    !kit.variants.length ||
    kit.variants.length > MODERN_NATIVE_PLANET_LIMITS.variants
  )
    throw new Error("Invalid weather variants");
  let vertices = 0,
    triangles = 0;
  const names = new Set<string>();
  for (const v of kit.variants) {
    if (!v || typeof v.name !== "string" || names.has(v.name))
      throw new Error("Invalid weather variant identity");
    names.add(v.name);
    const {
      positions: p,
      indices: i,
      triangleMaterials: m,
      normals: n,
      uvs: u,
    } = v;
    if (
      !Array.isArray(p) ||
      !p.length ||
      p.length % 3 ||
      !Array.isArray(i) ||
      !i.length ||
      i.length % 3 ||
      !Array.isArray(m) ||
      m.length !== i.length / 3
    )
      throw new Error("Invalid weather geometry");
    vertices += p.length / 3;
    triangles += i.length / 3;
    if (
      vertices > MODERN_NATIVE_PLANET_LIMITS.vertices ||
      triangles > MODERN_NATIVE_PLANET_LIMITS.triangles
    )
      throw new Error("Weather geometry budget");
    if (
      p.some((x) => !Number.isFinite(x)) ||
      i.some((x) => !Number.isSafeInteger(x) || x < 0 || x >= p.length / 3) ||
      m.some(
        (x) => !Number.isSafeInteger(x) || x < 0 || x >= kit.materials.length,
      )
    )
      throw new Error("Invalid weather attributes");
    if (
      (n !== undefined &&
        (!Array.isArray(n) ||
          n.length !== p.length ||
          n.some((x) => !Number.isFinite(x)))) ||
      (u !== undefined &&
        (!Array.isArray(u) ||
          u.length !== (p.length / 3) * 2 ||
          u.some((x) => !Number.isFinite(x))))
    )
      throw new Error("Invalid weather optical attributes");
    if (n)
      for (let j = 0; j < n.length; j += 3)
        if (n[j] === 0 && n[j + 1] === 0 && n[j + 2] === 0)
          throw new Error("Zero weather normal");
    if (kit.layout === "toxic-fog-banks" && (!n || !u))
      throw new Error("Fog requires authored optical attributes");
  }
  return kit;
}
