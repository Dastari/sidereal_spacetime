/** O(6N²) layered cube-sphere terrain: no volumetric occupancy and no per-cell nodes. */
import {
  terrainContactOcclusion,
  adjacentLavaRadiance,
} from "./planet-contact-lighting";
import { noise, hash } from "./voxel-planets";
import {
  planetEffects,
  type PlanetRecipe,
} from "../../../content/src/environment";
import type { PlanetTreePlacement } from "./planet-decorations";
export type Vec = [number, number, number];
export interface SurfaceGeometry {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  faces: number;
  iceOptics?: number[];
}
export interface LayeredTerrain {
  terrain: SurfaceGeometry;
  lava: SurfaceGeometry;
  ice: SurfaceGeometry;
  spill: SurfaceGeometry;
  water: SurfaceGeometry;
  trees: PlanetTreePlacement[];
  crystals: PlanetTreePlacement[];
  resolution: number;
  samples: number;
}
export const MAX_TERRAIN_FACES = 110000;
const normalize = (p: Vec): Vec => {
  const r = Math.hypot(...p);
  return p.map((v) => v / r) as Vec;
};
const scale = (p: Vec, r: number): Vec => p.map((v) => v * r) as Vec;
const empty = (): SurfaceGeometry => ({
  positions: [],
  normals: [],
  colors: [],
  indices: [],
  faces: 0,
});
const rgb = (hex: string): Vec =>
  [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Vec;
function quad(
  g: SurfaceGeometry,
  p: Vec[],
  color: Vec,
  outward: Vec,
  optics: [number, number] = [0.35, 0.2],
) {
  const u = p[1].map((v, i) => v - p[0][i]),
    v = p[2].map((v, i) => v - p[0][i]);
  let normal: Vec = normalize([
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]);
  const flip = normal.reduce((a, b, i) => a + b * outward[i], 0) < 0;
  if (flip) normal = scale(normal, -1);
  const first = g.positions.length / 3;
  for (const point of p) {
    g.positions.push(...point);
    g.normals.push(...normal);
    g.colors.push(...color, 1);
    g.iceOptics?.push(...optics);
  }
  g.indices.push(
    ...(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]).map((i) => first + i),
  );
  g.faces++;
  if (g.faces > MAX_TERRAIN_FACES)
    throw new RangeError("Terrain exceeded 110000 quads; reduce detail");
}
function faceDirection(face: number, u: number, v: number): Vec {
  const axis = Math.floor(face / 2),
    p: Vec = [0, 0, 0];
  p[axis] = face % 2 ? 1 : -1;
  p[(axis + 1) % 3] = u;
  p[(axis + 2) % 3] = v;
  return normalize(p);
}
/** Exact adjacent cell center on a cube face, including edge axis changes. */
export function terrainNeighborDirection(
  face: number,
  u: number,
  v: number,
  edge: number,
  resolution: number,
): Vec {
  const step = 2 / resolution,
    du = [0, step, 0, -step][edge],
    dv = [-step, 0, step, 0][edge];
  if (Math.abs(u + du) < 1 && Math.abs(v + dv) < 1)
    return faceDirection(face, u + du, v + dv);
  const axis = Math.floor(face / 2),
    sign = face % 2 ? 1 : -1,
    p: Vec = [0, 0, 0];
  p[axis] = sign * (1 - step / 2);
  p[(axis + 1) % 3] = u;
  p[(axis + 2) % 3] = v;
  if (Math.abs(u + du) >= 1) p[(axis + 1) % 3] = Math.sign(u + du);
  else p[(axis + 2) % 3] = Math.sign(v + dv);
  return normalize(p);
}
export function surfaceSample(d: Vec, recipe: PlanetRecipe) {
  const n = (f: number, offset = 0) =>
    noise(d[0] * f + 3, d[1] * f + 7, d[2] * f + 1, recipe.seed + offset);
  const broad = n(2.8) * 0.58 + n(6.2, 23) * 0.29 + n(18, 11) * 0.13,
    detail = n(23, 49),
    mountain = n(6.5, 71);
  const water = ["temperate", "ocean"].includes(recipe.style),
    effects = planetEffects(recipe);
  const land = !water || broad > recipe.seaLevel;
  let height = water ? 0.952 + Math.floor(n(47, 319) * 3) * 0.0008 : 0.955;
  let color = water
    ? broad > recipe.seaLevel - 0.026
      ? 2
      : broad > recipe.seaLevel - 0.07
        ? 1
        : 0
    : 0;
  if (land) {
    const low = water
      ? Math.max(0, broad - recipe.seaLevel)
      : Math.max(0, broad - 0.34);
    // Continental shape and plateau height use independent fields: tall stone
    // shelves no longer form uniform concentric contour rings around every coast.
    const coastal = Math.min(1, low / 0.016);
    const ridge = 1 - Math.abs(mountain * 2 - 1);
    const elevation = water
      ? (0.045 +
          Math.floor(n(4.2, 431) * 4) * 0.03 * coastal +
          Math.floor(detail * 5) * 0.003 +
          Math.floor(Math.max(0, ridge - 0.72) * 18) *
            0.022 *
            recipe.mountains) *
        recipe.terrain
      : (0.018 +
          Math.floor(n(4.2, 431) * 4) * 0.027 +
          (n(8.5, 617) > 0.59 ? 0.17 + Math.floor(mountain * 3) * 0.04 : 0) *
            recipe.mountains +
          Math.floor(detail * 4) * 0.0015) *
        recipe.terrain;
    height += Math.min(0.185, elevation) + Math.floor(detail * 4) * 0.002;
    color = water
      ? low < 0.018
        ? 4
        : low < 0.065
          ? 5
          : 6
      : Math.min(8, Math.floor(broad * 7 + detail * 2));
    if (water && (height > 1.14 || Math.abs(d[1]) > 0.91)) color = 8;
    if (recipe.style === "desert")
      height +=
        Math.floor(Math.max(0, detail - 0.52) * 9) * 0.013 * recipe.mountains;
    if (recipe.style === "ice") {
      height +=
        Math.floor(Math.max(0, detail - 0.46) * 12) * 0.014 * recipe.mountains;
      color =
        Math.abs(broad - 0.5) < 0.04
          ? 1
          : Math.min(8, 4 + Math.floor(detail * 5));
    }
    if (recipe.style === "toxic") {
      height +=
        Math.floor(Math.max(0, detail - 0.5) * 10) * 0.015 * recipe.mountains;
      color =
        n(8.5, 617) > 0.59
          ? Math.floor(detail * 3)
          : 4 + Math.floor(detail * 2);
    }
    if (recipe.style === "volcanic" || recipe.style === "crystal")
      color = Math.min(4, Math.floor(detail * 5));
    if (recipe.style === "rock" || recipe.style === "moon") {
      for (let i = 0; i < 22; i++) {
        const cy = hash(i, 3, 7, recipe.seed) * 2 - 1,
          a = hash(i, 5, 11, recipe.seed) * Math.PI * 2,
          s = Math.sqrt(1 - cy * cy),
          size = 0.055 + hash(i, 9, 4, recipe.seed) * 0.16;
        const distance =
          Math.hypot(
            d[0] - Math.cos(a) * s,
            d[1] - cy,
            d[2] - Math.sin(a) * s,
          ) / size;
        if (distance < 0.82) {
          height -= 0.045 * (1 - distance * 0.5);
          color = Math.max(0, color - 2);
        } else if (distance < 1.1) height += 0.015;
      }
    }
  }
  const lava =
    effects.volcanicCoverage > 0 &&
    Math.abs(n(6, 93) - 0.5) < effects.volcanicCoverage * 0.065 &&
    (land || !water);
  if (lava) height = Math.max(0.955, height - 0.025);
  return {
    height: Math.min(1.155, height),
    land,
    color,
    lava,
    moisture: n(9, 201),
    detail,
  };
}
export function buildLayeredTerrain(
  recipe: PlanetRecipe,
  resolution: number,
): LayeredTerrain {
  if (!Number.isInteger(resolution) || resolution < 12 || resolution > 96)
    throw new RangeError("Cube-face resolution must be 12..96");
  const out: LayeredTerrain = {
    terrain: empty(),
    lava: empty(),
    ice: empty(),
    spill: empty(),
    water: empty(),
    trees: [],
    crystals: [],
    resolution,
    samples: 6 * resolution * resolution,
  };
  out.ice.iceOptics = [];
  const treesPerFace = new Uint16Array(6),
    crystalsPerFace = new Uint16Array(6);
  const palette = recipe.palette.map(rgb),
    step = 2 / resolution,
    effects = planetEffects(recipe);
  for (let face = 0; face < 6; face++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++) {
        const u = -1 + (x + 0.5) * step,
          v = -1 + (y + 0.5) * step,
          d = faceDirection(face, u, v),
          sample = surfaceSample(d, recipe);

        const corners = [
          faceDirection(face, u - step / 2, v - step / 2),
          faceDirection(face, u + step / 2, v - step / 2),
          faceDirection(face, u + step / 2, v + step / 2),
          faceDirection(face, u - step / 2, v + step / 2),
        ];
        const neighbor = [0, 1, 2, 3].map((edge) =>
          surfaceSample(
            terrainNeighborDirection(face, u, v, edge, resolution),
            recipe,
          ),
        );
        const cliff = neighbor.some((n) => n.height < sample.height - 0.012);
        const variation =
          0.88 +
          hash(
            Math.floor(d[0] * 500),
            Math.floor(d[1] * 500),
            Math.floor(d[2] * 500),
            recipe.seed,
          ) *
            0.2;
        const contactEnabled =
          recipe.style === "ice" ||
          recipe.style === "volcanic" ||
          effects.volcanicCoverage > 0;
        const ao = contactEnabled
          ? terrainContactOcclusion(
              sample.height,
              neighbor.map((n) => n.height),
              step,
            )
          : 1;
        const topColor = palette[sample.color].map(
          (c) => c * variation * ao,
        ) as Vec;
        const targetGeometry =
          recipe.style === "ice" && sample.color === 1
            ? out.ice
            : sample.land
              ? out.terrain
              : out.water;
        const top = corners.map((c) => scale(c, sample.height));
        if (sample.lava) {
          quad(out.lava, top, [1, 0.21, 0.025], d);
        } else if (cliff && resolution >= 48) {
          const inset = corners.map((c) =>
            scale(
              normalize(c.map((a, i) => a * 0.96 + d[i] * 0.04) as Vec),
              sample.height + 0.0012,
            ),
          );
          quad(targetGeometry, inset, topColor, d);
          const edge = corners.map((c) => scale(c, sample.height));
          for (let k = 0; k < 4; k++)
            quad(
              targetGeometry,
              [inset[k], inset[(k + 1) % 4], edge[(k + 1) % 4], edge[k]],
              topColor.map((c) => Math.min(1, c * 1.08)) as Vec,
              d,
            );
        } else quad(targetGeometry, top, topColor, d);
        for (let k = 0; k < 4; k++) {
          const low = Math.max(
            recipe.style === "moon" || recipe.style === "rock" ? 0.9 : 0.952,
            neighbor[k].height,
          );
          const high = sample.height;
          if (low >= high - 0.002) continue;
          const a = corners[k],
            b = corners[(k + 1) % 4],
            outward = normalize(
              a.map((q, i) => (q + b[i]) * 0.5 - d[i]) as Vec,
            );
          const bands = Math.min(
            8,
            Math.max(1, Math.ceil((high - low) / 0.024)),
          );
          for (let band = 0; band < bands; band++) {
            const r0 = low + ((high - low) * band) / bands,
              r1 = low + ((high - low) * (band + 1)) / bands;
            const soil =
              recipe.style === "ice"
                ? (palette[
                    1 + Math.min(2, Math.floor(((band + 0.5) / bands) * 3))
                  ].map((c) => c * (0.9 + 0.08 * (band % 2))) as Vec)
                : ["temperate", "ocean"].includes(recipe.style)
                  ? high > 1.022 && r0 < high - 0.008
                    ? ([
                        0.34 + 0.07 * (band % 3),
                        0.39 + 0.075 * (band % 3),
                        0.47 + 0.07 * (band % 3),
                      ] as Vec)
                    : ([
                        0.34 + 0.045 * (band % 3),
                        0.27 + 0.035 * (band % 3),
                        0.17 + 0.025 * (band % 3),
                      ] as Vec)
                  : (topColor.map(
                      (c) => c * (0.68 + 0.08 * (band % 3)),
                    ) as Vec);
            const wall = [
              scale(a, r0),
              scale(b, r0),
              scale(b, r1),
              scale(a, r1),
            ];
            const baseContact = contactEnabled
              ? 0.6 + 0.4 * ((band + 0.5) / bands)
              : 1;
            const wallGeometry =
              recipe.style === "ice" ? out.ice : targetGeometry;
            quad(
              wallGeometry,
              wall,
              soil.map((c) => c * baseContact) as Vec,
              outward,
              [1 - (band + 0.5) / bands, 0.1 + (0.8 * (band + 0.5)) / bands],
            );
            const spill = adjacentLavaRadiance(
              neighbor[k].lava,
              neighbor[k].height,
              (r0 + r1) * 0.5,
              step,
              recipe.emission,
            );
            if (spill[0] > 0.008) {
              quad(
                out.spill,
                wall.map(
                  (p) => p.map((v, axis) => v + outward[axis] * 0.00035) as Vec,
                ),
                spill,
                outward,
              );
            }
          }
        }
        const slope = Math.max(
          ...neighbor.map((n) => Math.abs(n.height - sample.height)),
        );
        const candidate = hash(x + face * resolution, y, 31, recipe.seed);
        if (
          effects.vegetation > 0 &&
          out.trees.length < 2400 &&
          treesPerFace[face] < 400 &&
          sample.moisture > 0.44 &&
          sample.height > 0.974 &&
          sample.height < 1.115 &&
          slope < 0.03 &&
          !sample.lava &&
          sample.color !== 8 &&
          candidate < effects.vegetation * 0.48
        ) {
          treesPerFace[face]++;
          out.trees.push({
            position: scale(d, sample.height + 0.001),
            normal: d,
            seed: Math.floor(candidate * 2147483647),
          });
        }
        if (
          effects.crystalCoverage > 0 &&
          out.crystals.length < 220 &&
          crystalsPerFace[face] < 36 &&
          !sample.lava &&
          sample.detail > 0.52 &&
          candidate < effects.crystalCoverage * 0.027
        ) {
          crystalsPerFace[face]++;
          out.crystals.push({
            position: scale(d, sample.height),
            normal: d,
            seed: Math.floor(candidate * 2147483647),
          });
        }
      }
  if (out.terrain.faces + out.ice.faces > MAX_TERRAIN_FACES)
    throw new RangeError("Terrain exceeded 110000 quads; reduce detail");
  return out;
}
