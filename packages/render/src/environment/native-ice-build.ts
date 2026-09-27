import type { PlanetRecipe } from "@sidereal/content/environment";
import type { NativePlanetKit } from "./native-planet-composition";
import { composeNativeGlacialInterior } from "./native-glacial-interior";
/** Preserve authored surfaces and optical attributes; prepare transferable buffers off-thread. */
export function buildNativeIceData(
  kit: NativePlanetKit,
  recipe: PlanetRecipe,
  lod: 0 | 1 | 2,
) {
  const start = performance.now(),
    nativeLod = Math.max(
      lod,
      recipe.resolution < 48 ? 2 : recipe.resolution < 64 ? 1 : 0,
    ) as 0 | 1 | 2;
  const coverage = Math.max(
    0,
    Math.min(
      1,
      0.55 + (recipe.terrain - 0.65) * 0.22 + (recipe.seaLevel - 0.475) * 0.2,
    ),
  );
  const geometry = composeNativeGlacialInterior(
    kit,
    recipe.seed,
    coverage,
    ([16, 10, 6] as const)[nativeLod],
    recipe.mountains,
  );
  const batches = geometry.batches.map((batch) => {
    const optics: number[] = [];
    for (let i = 0; i < batch.positions.length; i += 3) {
      const r = Math.hypot(...batch.positions.slice(i, i + 3));
      optics.push(
        Math.max(0, Math.min(0.65, (1 - r) / 0.4)),
        Math.max(0.15, Math.min(1, (r - 0.82) / 0.32)),
      );
    }
    return {
      positions: Float32Array.from(batch.positions),
      normals: Float32Array.from(batch.normals),
      indices: Uint32Array.from(batch.indices),
      optics: Float32Array.from(optics),
    };
  });
  return {
    kind: "native-ice" as const,
    batches,
    nativeLod,
    triangles: geometry.triangles,
    buildMs: performance.now() - start,
  };
}
export type NativeIceBuildData = ReturnType<typeof buildNativeIceData>;
