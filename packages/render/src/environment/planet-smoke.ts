import { setMeshRole } from '../mesh-roles';
import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { buildPlanetClouds } from "./planet-clouds";
import { planetEffects, type PlanetRecipe } from "../../../content/src/environment";
/** Existing bounded smoke presentation, shared unchanged by native and layered worlds. */
export function createPlanetSmoke(scene: Scene, name: string, recipe: PlanetRecipe, lod: number) {
  const coverage = planetEffects(recipe).smoke;
  if (lod >= 2 || coverage <= 0) return undefined;
  const geometry = buildPlanetClouds({seed: recipe.seed + 909, coverage, radius: 1.145, detail: 48,
    tint: recipe.style === "toxic" ? [0.44, 0.6, 0.15] : [0.24, 0.2, 0.22]});
  const material = new PBRMaterial(name + "-smoke-material", scene);
  material.metallic = 0; material.directIntensity = 1.45; material.roughness = 1;
  material.maxSimultaneousLights = 4; material.environmentIntensity = 0.7;
  material.forceIrradianceInFragment = true; material.alpha = 0.48;
  material.backFaceCulling = true; material.disableDepthWrite = true;
  const haze = new Mesh(name + "-smoke", scene), data = new VertexData();
  setMeshRole(haze, "planet");
  data.positions = geometry.positions; data.normals = geometry.normals;
  data.colors = geometry.colors.map((v,i) => i % 4 === 3 ? v : v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  data.indices = geometry.indices.map((_,i) => geometry.indices[i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i]);
  data.applyToMesh(haze); haze.material = material; haze.hasVertexAlpha = false; haze.isPickable = false;
  return haze;
}
