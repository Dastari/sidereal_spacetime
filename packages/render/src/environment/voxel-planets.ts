/** Pure, seeded presentation mesher. No world state, colliders, or per-cell nodes. */
import {
  planetRecipe,
  validatePlanetRecipe,
  type PlanetRecipe,
  type PlanetStyle,
} from "../../../content/src/environment";
export type { PlanetStyle } from "../../../content/src/environment";
export const PLANET_GRID = 52;
export const CLOUD_GRID = 40;
export interface PlanetGeometry {
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
  occupied: number;
  faces: number;
  resolution: number;
}
export function hash(x: number, y: number, z: number, seed: number) {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 2147483647) ^
    Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise(x: number, y: number, z: number, seed: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  let v = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++)
        v +=
          hash(ix + a, iy + b, iz + c, seed) *
          (a ? fx : 1 - fx) *
          (b ? fy : 1 - fy) *
          (c ? fz : 1 - fz);
  return v;
}
/** Unit-radius globe inside a bounded voxel lattice. Only exposed quads emitted;
 * all opaque terrain is one material/draw batch, cloud volume a second batch. */
export function buildVoxelPlanet(
  seed: number,
  style: PlanetStyle,
  clouds = false,
  resolution = clouds ? CLOUD_GRID : PLANET_GRID,
  parameters?: PlanetRecipe,
): PlanetGeometry {
  const recipe = validatePlanetRecipe(
    parameters ?? { ...planetRecipe(style, seed), cloudCoverage: 0.42 },
  );
  if (!Number.isInteger(resolution) || resolution < 12 || resolution > 64)
    throw new RangeError("Planet resolution must be 12..64");
  const n = resolution,
    step = 2.4 / n,
    cells = new Uint8Array(n * n * n);
  const idx = (x: number, y: number, z: number) => x + n * (y + n * z);
  const palette = recipe.palette.map((hex) =>
    [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255),
  );
  let occupied = 0;
  const stormX = 0.15 + hash(7, 3, 9, seed) * 0.4;
  const stormY = 0.1 + hash(4, 1, 8, seed) * 0.4;
  const stormZ = Math.sqrt(1 - stormX * stormX - stormY * stormY);
  // Craters are stable directional depressions, not texture-only circles.
  const craters = Array.from({ length: 12 }, (_, i) => {
    const y = hash(i, 3, 7, seed) * 2 - 1,
      a = hash(i, 5, 11, seed) * Math.PI * 2,
      s = Math.sqrt(1 - y * y);
    return [
      Math.cos(a) * s,
      y,
      Math.sin(a) * s,
      0.09 + hash(i, 9, 4, seed) * 0.16,
    ];
  });
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const px = (x + 0.5) * step - 1.2,
          py = (y + 0.5) * step - 1.2,
          pz = (z + 0.5) * step - 1.2;
        const r = Math.hypot(px, py, pz);
        if (r > 1.17) continue;
        const nx = px / (r || 1),
          ny = py / (r || 1),
          nz = pz / (r || 1);
        const broad = noise(nx * 2.8 + 3, ny * 2.8 + 7, nz * 2.8 + 1, seed);
        const detail = noise(nx * 11 + 2, ny * 11 + 4, nz * 11 + 9, seed + 23);
        let radius = 0.965,
          color = 0;
        if (clouds) {
          const weather =
            noise(nx * 4 + 8, ny * 6 + 3, nz * 4, seed + 71) * 0.75 +
            noise(nx * 12, ny * 12, nz * 12, seed + 7) * 0.25;
          if (
            weather < 0.82 - recipe.cloudCoverage * 0.55 ||
            recipe.cloudCoverage === 0 ||
            r < 1.045 ||
            r > 1.07 + Math.max(0, weather - 0.5) * 0.3
          )
            continue;
          color = 8;
        } else {
          if (style === "gas") {
            const stormDistance = Math.hypot(
              nx - stormX,
              ny - stormY,
              nz - stormZ,
            );
            const phase =
              stormDistance < 0.33
                ? stormDistance * 78 - Math.atan2(ny - stormY, nx - stormX) * 2
                : ny * 43 + broad * 10 + detail * 0.8;
            const band = Math.sin(phase);
            color = Math.min(
              8,
              Math.max(0, Math.floor((band * 0.5 + 0.5) * 8)),
            );
            radius = 0.978 + Math.floor(detail * 3) * 0.007;
          } else if (style === "ocean" || style === "temperate") {
            const sea = recipe.seaLevel;
            radius =
              broad > sea
                ? 0.977 +
                  Math.floor((broad - sea) * 19 * recipe.mountains) * 0.023
                : 0.951;
            color =
              broad < sea - 0.1
                ? 0
                : broad < sea - 0.04
                  ? 1
                  : broad < sea - 0.005
                    ? 2
                    : broad < sea + 0.015
                      ? 4
                      : broad < sea + 0.09
                        ? 5
                        : broad < sea + 0.18
                          ? 6
                          : 7;
            if (Math.abs(ny) > 0.84 + detail * 0.09) {
              color = 8;
              radius += 0.018;
            }
          } else {
            radius =
              0.965 +
              Math.floor((broad - 0.4) * 12) * 0.04 * recipe.mountains +
              Math.floor(detail * 3) * 0.012;
            color = Math.min(8, Math.floor(broad * 7 + detail * 2));
            if (style === "rock" || style === "moon")
              for (const [cx, cy, cz, size] of craters) {
                const d = Math.hypot(nx - cx, ny - cy, nz - cz) / size;
                if (d < 0.78) {
                  radius -= 0.07 * (1 - d * 0.5);
                  color = Math.max(0, color - 2);
                } else if (d < 1.12) radius += 0.026;
              }
            if (style === "ice") {
              radius +=
                Math.abs(broad - 0.5) < 0.055
                  ? -0.035
                  : Math.floor(Math.max(0, detail - 0.44) * 10) *
                    0.026 *
                    recipe.mountains;
              color =
                Math.abs(broad - 0.5) < 0.055
                  ? 1
                  : Math.min(8, 4 + Math.floor(detail * 5));
            }
            if (style === "volcanic") {
              radius +=
                Math.abs(broad - 0.5) < 0.025
                  ? -0.025
                  : Math.floor(detail * 4) * 0.012 * recipe.mountains;
              color =
                Math.abs(broad - 0.5) < 0.025
                  ? 5 + (detail > 0.55 ? 1 : 0)
                  : Math.min(3, Math.floor(detail * 4));
            }
            if (style === "toxic")
              radius +=
                Math.floor(Math.max(0, detail - 0.5) * 12) *
                0.032 *
                recipe.mountains;
          }
          if (style === "desert") {
            radius +=
              Math.floor(Math.max(0, detail - 0.48) * 12) *
              0.035 *
              recipe.mountains;
            color = Math.min(8, Math.floor(broad * 6 + detail * 2));
          }
          if (style === "crystal") {
            const spire = Math.max(0, (detail - 0.56) / 0.3);
            radius += Math.floor(spire * 8) * 0.038 * recipe.mountains;
            color =
              spire > 0.4
                ? spire > 0.65
                  ? 6
                  : 5
                : Math.min(4, Math.floor(broad * 7));
          }
          if (
            style === "temperate" &&
            broad > recipe.seaLevel + 0.03 &&
            detail > 0.63
          ) {
            radius += 0.06 * recipe.mountains;
            color = 7;
          }
          radius = Math.min(
            1.16,
            0.95 + ((radius - 0.95) * recipe.terrain) / 0.65,
          );
          if (r > radius) continue;
        }
        cells[idx(x, y, z)] = color + 1;
        occupied++;
      }
  const out: PlanetGeometry = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    occupied,
    faces: 0,
    resolution: n,
  };
  // Clockwise from outside for Babylon's default left-handed front faces.
  const directions = [
    [0, -1, -1],
    [0, 1, 1],
    [1, -1, 1],
    [1, 1, -1],
    [2, -1, -1],
    [2, 1, 1],
  ];
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const c = cells[idx(x, y, z)];
        if (!c) continue;
        const base = [x, y, z];
        for (const [axis, sign] of directions) {
          const neighbor = [x, y, z];
          neighbor[axis] += sign;
          if (
            neighbor[axis] >= 0 &&
            neighbor[axis] < n &&
            cells[idx(...(neighbor as [number, number, number]))]
          )
            continue;
          const u = (axis + 1) % 3,
            v = (axis + 2) % 3;
          const origin = base.map((k) => k * step - 1.2);
          if (sign > 0) origin[axis] += step;
          const first = out.positions.length / 3;
          const color = clouds
            ? style === "toxic"
              ? [0.65, 0.9, 0.22]
              : [0.88, 0.94, 1]
            : palette[c - 1];
          for (const [du, dv] of [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ]) {
            const p = [...origin];
            p[u] += du * step;
            p[v] += dv * step;
            out.positions.push(...p);
            const normal = [0, 0, 0];
            normal[axis] = sign;
            out.normals.push(...normal);
            out.colors.push(
              ...color,
              (style === "volcanic" || style === "crystal") &&
                (c === 6 || c === 7) &&
                !clouds
                ? 1
                : style === "toxic" && c >= 5 && !clouds
                  ? 0.35
                  : 0,
            );
          }
          // cross(U,V) points along +axis; Babylon's front winding is clockwise.
          const order = sign > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
          out.indices.push(...order.map((i) => first + i));
          out.faces++;
          if (out.faces > 60000)
            throw new RangeError(
              "Planet exceeded 60000 exposed faces; lower resolution or terrain",
            );
        }
      }
  return out;
}

/** Bounded LRU shared by preview and world. Never keyed only by entity identity. */
const geometryCache = new Map<string, PlanetGeometry>();
export function buildPlanetRecipe(
  input: PlanetRecipe,
  clouds = false,
): PlanetGeometry {
  const recipe = validatePlanetRecipe(input);
  const key = JSON.stringify([recipe, clouds]);
  const cached = geometryCache.get(key);
  if (cached) {
    geometryCache.delete(key);
    geometryCache.set(key, cached);
    return cached;
  }
  const result = buildVoxelPlanet(
    recipe.seed,
    recipe.style,
    clouds,
    clouds ? Math.min(40, recipe.resolution) : recipe.resolution,
    recipe,
  );
  geometryCache.set(key, result);
  while (geometryCache.size > 6)
    geometryCache.delete(geometryCache.keys().next().value!);
  return result;
}
