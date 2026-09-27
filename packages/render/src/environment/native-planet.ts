import { setMeshRole } from "../mesh-roles";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
  planetEffects,
  PLANET_PALETTES,
  type PlanetRecipe,
} from "../../../content/src/environment";
import type { PlanetLOD } from "./layered-planet";
import { composeNativeGlacialInterior } from "./native-glacial-interior";
import type {
  NativePlanetKit,
  NativePlanetComposition,
} from "./native-planet-composition";
import { createNativeIceFinish } from "./native-ice-material";
import { NATIVE_ICE_REVISION } from "./native-planet-assets";
export const NATIVE_PLANET_CACHE_LIMIT = 6;
/** Unsupported mixed effects/custom palettes retain their existing full renderer. */
export function canUseNativeIce(recipe: PlanetRecipe) {
  const effects = planetEffects(recipe);
  return (
    recipe.style === "ice" &&
    recipe.cloudCoverage === 0 &&
    recipe.emission === 0 &&
    effects.vegetation === 0 &&
    effects.volcanicCoverage === 0 &&
    effects.crystalCoverage === 0 &&
    effects.smoke === 0 &&
    JSON.stringify(recipe.palette) === JSON.stringify(PLANET_PALETTES.ice)
  );
}
/** Scene-owned CPU cache: at most two complete three-LOD seed families, no GPU retention. */
export function createNativePlanetCache(kit: NativePlanetKit) {
  const entries = new Map<string, NativePlanetComposition>();
  return {
    get(seed: number, lod: PlanetLOD, coverage = 0.55, relief = 0.55) {
      if (
        !Number.isInteger(seed) ||
        seed < 0 ||
        seed > 4294967295 ||
        ![0, 1, 2].includes(lod) ||
        !Number.isFinite(coverage) ||
        coverage < 0 ||
        coverage > 1 ||
        !Number.isFinite(relief) ||
        relief < 0 ||
        relief > 1
      )
        throw new Error("Invalid native cache recipe");
      const key = JSON.stringify([seed, lod, coverage, relief]);
      let value = entries.get(key);
      if (value) {
        entries.delete(key);
        entries.set(key, value);
        return value;
      }
      value = composeNativeGlacialInterior(
        kit,
        seed,
        coverage,
        ([16, 10, 6] as const)[lod],
        relief,
      );
      entries.set(key, value);
      while (entries.size > NATIVE_PLANET_CACHE_LIMIT)
        entries.delete(entries.keys().next().value!);
      return value;
    },
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}
export type NativePlanetCache = ReturnType<typeof createNativePlanetCache>;
export function createNativeIcePlanet(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  lod: PlanetLOD,
  kit: NativePlanetKit,
  cache: NativePlanetCache,
) {
  const nativeLod = Math.max(
    lod,
    recipe.resolution < 48 ? 2 : recipe.resolution < 64 ? 1 : 0,
  ) as PlanetLOD;
  const coverage = Math.max(
    0,
    Math.min(
      1,
      0.55 + (recipe.terrain - 0.65) * 0.22 + (recipe.seaLevel - 0.475) * 0.2,
    ),
  );
  const root = new TransformNode(name + "-native-ice", scene),
    geometry = cache.get(recipe.seed, nativeLod, coverage, recipe.mountains);
  geometry.batches.forEach((batch, index) => {
    if (!batch.indices.length) return;
    const mesh = new Mesh(name + "-native-" + kit.materials[index].name, scene),
      data = new VertexData();
    setMeshRole(mesh, "planet");
    data.positions = batch.positions;
    data.normals = batch.normals;
    data.indices = batch.indices;
    data.applyToMesh(mesh);
    const optics: number[] = [];
    for (let i = 0; i < batch.positions.length; i += 3) {
      const r = Math.hypot(...batch.positions.slice(i, i + 3));
      optics.push(
        Math.max(0, Math.min(0.65, (1 - r) / 0.4)),
        Math.max(0.15, Math.min(1, (r - 0.82) / 0.32)),
      );
    }
    mesh.setVerticesData("iceOptics", optics, false, 2);
    mesh.setVerticesData("nativeOptics", optics, false, 2);
    const material = createNativeIceFinish(
      scene,
      name + "-" + kit.materials[index].name,
      index === 0,
    );
    material.albedoColor = Color3.FromArray(kit.materials[index].linearColor);
    material.metallic = 0;
    material.indexOfRefraction = 1.31;
    mesh.material = material;
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.metadata = {
      role: "planet",
      style: "ice",
      nativeRevision: NATIVE_ICE_REVISION,
    };
  });
  root.metadata = {
    role: "planet",
    nativePlanet: true,
    nativeRevision: NATIVE_ICE_REVISION,
    lod: nativeLod,
    triangles: geometry.triangles,
    seed: recipe.seed,
    source: "Blender authored native forms",
    artApproval: "local review candidate, final art unapproved",
  };
  return {
    root,
    clouds: undefined as TransformNode | undefined,
    smoke: undefined as TransformNode | undefined,
    emitters: [] as Mesh[],
    animatedMaterials: [] as ShaderMaterial[],
    updateWeather: (_age: number, _reducedMotion: boolean) =>
      undefined as TransformNode | undefined,
    dispose: () => root.dispose(false, true),
  };
}
