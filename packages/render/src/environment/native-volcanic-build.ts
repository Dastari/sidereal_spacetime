import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  createVolcanicField,
  nativeLavaRadiance,
  type VolcanicVector,
} from "./native-volcanic-field";
import { terrainContactOcclusion } from "./planet-contact-lighting";
import type {
  NativePlanetComposition,
  NativePlanetKit,
} from "./native-planet-composition";
import { composeNativeVolcanic } from "./native-volcanic-composition";
import type { PlanetRecipe } from "../../../content/src/environment";
import { planetEffects } from "../../../content/src/environment";
import { buildPlanetClouds } from "./planet-clouds";
import { packPlanetGeometry } from "./planet-build";
const unit = (v: VolcanicVector): VolcanicVector => {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length) as VolcanicVector;
};
/** Exact existing volcanic field, palette and contact/radiance calculations. */
export function prepareNativeVolcanicGeometry(
  geometry: NativePlanetComposition,
  seed: number,
  emission: number,
) {
  const field = createVolcanicField(seed);
  const pixels = new Uint8Array(512 * 256 * 4),
    stops = [
      [0.0025, "ffffcb", 0.9],
      [0.005, "ffd43b", 0.045],
      [0.017, "ff7900", 0.065],
      [0.045, "f32900", 0.035],
    ] as const;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 512; x++) {
      const longitude = ((x + 0.5) / 512 - 0.5) * Math.PI * 2,
        latitude = ((y + 0.5) / 256) * Math.PI,
        n: VolcanicVector = [
          Math.cos(longitude) * Math.sin(latitude),
          Math.cos(latitude),
          Math.sin(longitude) * Math.sin(latitude),
        ],
        width =
          0.72 +
          0.2 * Math.sin(n[0] * 51 + n[1] * 33 + n[2] * 29 + seed) +
          0.08 * Math.cos(n[0] * 37 - n[2] * 43),
        d = field.distance(n) / width,
        stop = stops.find(
          ([limit], index) =>
            d < limit &&
            (index !== 0 ||
              Math.sin(n[0] * 47 + n[1] * 37 + n[2] * 53 + seed) > 0.92),
        ),
        i = (y * 512 + x) * 4;
      if (stop) {
        const c = Color3.FromHexString("#" + stop[1])
          .toLinearSpace()
          .scale(stop[2]);
        pixels[i] = c.r * 255;
        pixels[i + 1] = c.g * 255;
        pixels[i + 2] = c.b * 255;
      }
      pixels[i + 3] = 255;
    }

  let litVertices = 0,
    minimumAO = 1,
    maximumRadiance = 0;
  const batches = geometry.batches.map((batch, index) => {
    const colors: number[] = [],
      radiance: number[] = [],
      uvs: number[] = [];
    for (let i = 0; i < batch.positions.length; i += 3) {
      const p = batch.positions.slice(i, i + 3) as VolcanicVector,
        n = unit(p),
        normal = batch.normals.slice(i, i + 3) as VolcanicVector,
        r = Math.hypot(...p);
      uvs.push(
        0.5 + Math.atan2(p[2], p[0]) / (2 * Math.PI),
        Math.acos(Math.max(-1, Math.min(1, p[1] / r))) / Math.PI,
      );
      if (index < 3) {
        const neighbors = [
          [-0.04, 0, 0],
          [0.04, 0, 0],
          [0, 0, -0.04],
          [0, 0, 0.04],
        ].map((offset) =>
          field.height(unit(n.map((v, j) => v + offset[j]) as VolcanicVector)),
        );
        const ao = terrainContactOcclusion(r, neighbors, 0.09),
          light = nativeLavaRadiance(p, normal, field, emission);
        colors.push(ao, ao, ao, 1);
        radiance.push(...light);
        minimumAO = Math.min(minimumAO, ao);
        maximumRadiance = Math.max(maximumRadiance, light[0]);
        if (light[0] > 0.015) litVertices++;
      } else {
        colors.push(1, 1, 1, 1);
        radiance.push(0, 0, 0);
      }
    }
    // Native vertices are triangle-local; unwrap seam-crossing triangles into repeat U.
    for (let i = 0; i < uvs.length; i += 6)
      if (
        Math.max(uvs[i], uvs[i + 2], uvs[i + 4]) -
          Math.min(uvs[i], uvs[i + 2], uvs[i + 4]) >
        0.5
      )
        for (const k of [i, i + 2, i + 4]) if (uvs[k] < 0.5) uvs[k] += 1;

    return {
      positions: Float32Array.from(batch.positions),
      normals: Float32Array.from(batch.normals),
      indices: Uint32Array.from(batch.indices),
      colors: Float32Array.from(colors),
      radiance: Float32Array.from(radiance),
      uvs: Float32Array.from(uvs),
    };
  });
  return { batches, pixels, litVertices, minimumAO, maximumRadiance };
}
export function buildNativeVolcanicData(
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
    Math.min(1, 0.55 + (recipe.terrain - 0.65) * 0.2),
  );
  const geometry = composeNativeVolcanic(
    kit,
    recipe.seed,
    coverage,
    ([20, 12, 8] as const)[nativeLod],
    recipe.mountains,
  );
  const prepared = prepareNativeVolcanicGeometry(
    geometry,
    recipe.seed,
    recipe.emission,
  );
  const smokeCoverage = planetEffects(recipe).smoke;
  const smoke =
    nativeLod < 2 && smokeCoverage > 0
      ? packPlanetGeometry(
          buildPlanetClouds({
            seed: recipe.seed + 909,
            coverage: smokeCoverage,
            radius: 1.145,
            detail: 48,
            tint:
              recipe.style === "toxic" ? [0.44, 0.6, 0.15] : [0.24, 0.2, 0.22],
          }),
        )
      : undefined;
  return {
    kind: "native-volcanic" as const,
    ...prepared,
    geometry: {
      ...geometry,
      batches: geometry.batches.map(() => ({
        positions: [],
        normals: [],
        indices: [],
      })),
    },
    nativeLod,
    smoke,
    buildMs: performance.now() - start,
  };
}
export type NativeVolcanicBuildData = ReturnType<
  typeof buildNativeVolcanicData
>;
