import type { ReviewedWeatherKit } from "./reviewed-weather-validation";
import type { PlanetRecipe } from "../../../../content/src/environment";
import type { ReviewedComposerInput as NativePlanetKit } from "./reviewed-composer-input";
import type { ModernNativePlanetKit } from "../modern-native-planet-schema";
import { composeCrystalMoonReference as crystalParts } from "./crystal_moon_reference_composition_r008";
import { composeToxicMoonReference as toxicMoon } from "./toxic_moon_reference_composition_r001";
import { composeIceMoonReference as iceMoon } from "./ice_moon_reference_composition_r004";
import { composeVolcanicMoonReference as volcanicMoon } from "./volcanic_moon_reference_composition_r004";
import { composeHybridMoonReference as hybridMoon } from "./hybrid_moon_reference_composition_r001";
import { composeSolidMoonReference as solidMoon } from "./solid_moon_reference_composition_r001";
import { composeRockyMoonReference as rockyMoon } from "./rocky_moon_reference_composition_r001";
import { composeTemperateReference as temperate } from "./temperate_reference_composition_r003";
import { composeVolcanicReference as volcanic } from "./volcanic_reference_composition_r023";
import { composeGasReference as gas } from "./gas_reference_composition";
import { composeCrystalReference as crystal } from "./crystal_reference_composition_r013";
import { composeToxicReference as toxic } from "./toxic_reference_composition_r007";
import { composeOceanReference as ocean } from "./ocean_reference_composition_r007";
import { composeRockyReference as rocky } from "./rocky_reference_composition_r010";
import { composeDesertReference as desert } from "./planet_reference_composition";
import { composeIceReference as ice } from "./ice_reference_composition_r025";
import { composeNativeClouds } from "./native_cloud_composition_r002";
import { composeClearedToxicReferenceWeather } from "./toxic_fog_reference_clearance";
import { buildReferenceVolcanicSmoke } from "./reference_volcanic_smoke_build";
import { referenceShadowRadius } from "./reference_shadow_radius";

export type ReviewedBuildInput = {
  bodyId: string;
  seed: number;
  lod: 0 | 1 | 2;
  recipe: PlanetRecipe;
};
/** Inputs are validated once on worker registration; no kit is mutated here.
 * Readonly structural composer inputs preserve source buffers without cloning.
 */
export function composeReviewedPlanet(
  kit: ModernNativePlanetKit,
  weatherKit: ReviewedWeatherKit | undefined,
  input: ReviewedBuildInput,
) {
  const { seed, lod, recipe, bodyId } = input;
  if (
    !bodyId ||
    bodyId.length > 512 ||
    !Number.isSafeInteger(seed) ||
    !Number.isFinite(recipe.cloudCoverage) ||
    recipe.cloudCoverage < 0 ||
    recipe.cloudCoverage > 1 ||
    ![0, 1, 2].includes(lod)
  )
    throw new Error("Invalid reviewed build intent");
  const native: NativePlanetKit = kit;
  const batches = (() => {
    switch (String(kit.layout)) {
      case "desert-geology":
        return desert(native, seed, lod);
      case "rocky-crater-geology":
        return rocky(native, seed, lod);
      case "temperate-native-continents":
        return temperate(native, seed, lod);
      case "single-glacial-cut-diagnostic":
        return ice(native, seed, lod);
      case "volcanic-regional-geology":
        return volcanic(native, seed, lod);
      case "gas-bands-and-rings":
        return gas(native);
      case "crystal-geology":
        return crystal(native, seed, lod);
      case "connected-toxic-crust":
        return toxic(native, seed, lod);
      case "ocean-island-geology":
        return ocean(native, seed, lod);
      case "crystal-moon-native-body":
        return crystalParts(native, seed, lod);
      case "toxic-moon-craters":
        return toxicMoon(native, seed, lod);
      case "ice-moon-glacial":
        return iceMoon(native, seed, lod);
      case "volcanic-moon-craters":
        return volcanicMoon(native, seed, lod);
      case "hybrid-moon-craters":
        return hybridMoon(native, seed, lod);
      case "solid-moon-craters":
        return solidMoon(native, seed, lod);
      case "rocky-moon-craters":
        return rockyMoon(native, seed, lod);
      default:
        throw new Error("Unregistered reviewed composition layout");
    }
  })();
  const cloudNative: NativePlanetKit | undefined = weatherKit;
  const toxicFog =
    recipe.style === "toxic" &&
    String(weatherKit?.layout) === "toxic-fog-banks";
  const clouds =
    !toxicFog && cloudNative && recipe.cloudCoverage > 0
      ? composeNativeClouds(cloudNative, seed, recipe.cloudCoverage)[0]
      : undefined;
  const weather = toxicFog
    ? composeClearedToxicReferenceWeather(
        cloudNative!,
        seed,
        recipe.cloudCoverage,
        batches,
        [8],
      )
    : clouds
      ? {
          positions: Array.from(clouds.positions),
          normals: Array.from(clouds.normals),
          indices: Array.from(clouds.indices),
          colors: Array(clouds.positions.length / 3)
            .fill([1, 1, 1, 1])
            .flat() as number[],
          faces: clouds.indices.length / 3,
          ranges: clouds.ranges,
        }
      : undefined;
  const smoke = buildReferenceVolcanicSmoke({ ...recipe, seed }, lod);
  return {
    batches,
    shadowRadii: batches.map((b) => referenceShadowRadius(b.positions)),
    weatherShadowRadius: weather
      ? referenceShadowRadius(weather.positions)
      : undefined,
    weather,
    smoke,
  };
}
export type ReviewedBuildResult = ReturnType<typeof composeReviewedPlanet> & {
  buildMs: number;
};
