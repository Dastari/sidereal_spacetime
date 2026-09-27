import {
  planetEffects,
  type PlanetRecipe,
} from "@sidereal/content/environment";
import {
  buildLayeredTerrain,
  terrainResolution,
  type SurfaceGeometry,
} from "./planet-terrain";
import { buildPlanetTrees } from "./planet-decorations";
import { buildPlanetCrystals } from "./planet-crystals";
import { buildPlanetClouds } from "./planet-clouds";
import { sampleOceanGlints } from "./planet-glint-samples";
export interface PackedPlanetGeometry {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  iceOptics?: Float32Array;
  prepared: true;
}
export function packPlanetGeometry(
  g: Pick<SurfaceGeometry, "positions" | "normals" | "colors" | "indices"> & {
    iceOptics?: number[];
  },
): PackedPlanetGeometry {
  return {
    prepared: true,
    positions: Float32Array.from(g.positions),
    normals: Float32Array.from(g.normals),
    colors: Float32Array.from(g.colors, (v, i) =>
      i % 4 === 3 ? v : v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    ),
    indices: Uint32Array.from(
      g.indices,
      (_, i) => g.indices[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i],
    ),
    iceOptics: g.iceOptics ? Float32Array.from(g.iceOptics) : undefined,
  };
}
export function buildPlanetData(recipe: PlanetRecipe, lod: 0 | 1 | 2) {
  const start = performance.now();
  const requested =
    lod === 0
      ? Math.min(96, Math.max(12, recipe.resolution))
      : Math.min(lod === 1 ? 32 : 16, recipe.resolution);
  const n = terrainResolution(recipe, requested),
    generated = buildLayeredTerrain(recipe, n);
  const glints =
    lod === 0 ? sampleOceanGlints(generated.water, recipe.seed) : [];
  const forest =
    lod < 2 && generated.trees.length
      ? buildPlanetTrees(
          generated.trees.filter((_, i) => i % (lod === 0 ? 6 : 2) === 0),
          { scale: lod === 0 ? 4 : 1, puffy: lod === 0 },
        )
      : undefined;
  const crystals =
    lod < 2 && generated.crystals.length
      ? buildPlanetCrystals(generated.crystals)
      : undefined;
  const clouds =
    lod < 2 && recipe.cloudCoverage > 0
      ? buildPlanetClouds({
          seed: recipe.seed,
          coverage: recipe.cloudCoverage,
          tint: recipe.style === "toxic" ? [0.62, 0.85, 0.18] : undefined,
          radius: 1.08,
          detail: lod === 0 ? 96 : 48,
        })
      : undefined;
  const coverage = planetEffects(recipe).smoke;
  const smoke =
    lod < 2 && coverage > 0
      ? buildPlanetClouds({
          seed: recipe.seed + 909,
          coverage,
          radius: 1.145,
          detail: 48,
          tint:
            recipe.style === "toxic" ? [0.44, 0.6, 0.15] : [0.24, 0.2, 0.22],
        })
      : undefined;
  const geometry: Record<string, PackedPlanetGeometry> = {};
  for (const key of ["terrain", "water", "ice", "lava", "spill"] as const) {
    geometry[key] = packPlanetGeometry(generated[key]);
    if (key === "spill")
      geometry[key].colors = Float32Array.from(generated[key].colors);
    // Metadata/placements remain small; large arrays cross the worker boundary only as transferables.
    generated[key] = {
      ...generated[key],
      positions: [],
      normals: [],
      colors: [],
      indices: [],
      iceOptics: undefined,
    };
  }
  if (forest) geometry.forest = packPlanetGeometry(forest);
  if (crystals) geometry.crystals = packPlanetGeometry(crystals);
  if (clouds) geometry.clouds = packPlanetGeometry(clouds);
  if (smoke) geometry.smoke = packPlanetGeometry(smoke);
  return {
    generated,
    geometry,
    glints,
    requested,
    resolution: n,
    forestCount: forest?.treeCount ?? 0,
    crystalCount: crystals?.crystalCount ?? 0,
    cloudFaces: clouds?.faces ?? 0,
    buildMs: performance.now() - start,
  };
}
export type PlanetBuildData = ReturnType<typeof buildPlanetData>;

export function buildPlanetWeather(
  recipe: PlanetRecipe,
  lod: 0 | 1 | 2,
  phase: number,
) {
  const start = performance.now();
  const g = buildPlanetClouds({
    seed: recipe.seed,
    coverage: recipe.cloudCoverage,
    tint: recipe.style === "toxic" ? [0.62, 0.85, 0.18] : undefined,
    radius: 1.08,
    detail: lod === 0 ? 96 : 48,
    phase,
  });
  return {
    geometry: packPlanetGeometry(g),
    faces: g.faces,
    phase,
    buildMs: performance.now() - start,
  };
}
export type PlanetWeatherData = ReturnType<typeof buildPlanetWeather>;
