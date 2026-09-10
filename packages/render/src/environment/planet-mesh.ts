import { setMeshRole } from '../mesh-roles';
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildPlanetRecipe } from "./voxel-planets";
import { voxelPlanetMaterial } from "./voxel-material";
import type { PlanetRecipe } from "../../../content/src/environment";
/** Two bounded batches: opaque surface and, when present, real emissive deposits. */
export function createPlanetMesh(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  clouds = false,
) {
  const geometry = buildPlanetRecipe(recipe, clouds);
  const mesh = new Mesh(name, scene);
  setMeshRole(mesh, "planet");
  const data = new VertexData();
  data.positions = geometry.positions;
  data.normals = geometry.normals;
  data.colors = geometry.colors;
  data.indices = geometry.indices;
  data.applyToMesh(mesh);
  mesh.hasVertexAlpha = false;
  mesh.isPickable = false;
  mesh.metadata = { role: "planet",
    voxelPlanet: true,
    style: recipe.style,
    faces: geometry.faces,
    triangles: geometry.faces * 2,
    resolution: geometry.resolution,
    occupied: geometry.occupied,
  };
  const material = voxelPlanetMaterial(scene, name + "-material", clouds);
  material.setFloat("emission", recipe.emission);
  mesh.material = material;
  let emitter: Mesh | undefined;
  if (!clouds && recipe.emission > 0) {
    const glowingIndices: number[] = [];
    for (let face = 0; face < geometry.faces; face++)
      if (geometry.colors[face * 16 + 3] > 0)
        glowingIndices.push(...geometry.indices.slice(face * 6, face * 6 + 6));
    if (glowingIndices.length) {
      // Same positions, exactly matching emissive faces; the surface batch omits them.
      data.indices = geometry.indices.filter(
        (_, index) => geometry.colors[Math.floor(index / 6) * 16 + 3] === 0,
      );
      data.applyToMesh(mesh);
      emitter = new Mesh(name + "-deposits", scene);
      data.indices = glowingIndices;
      data.applyToMesh(emitter);
      emitter.parent = mesh;
      emitter.hasVertexAlpha = false;
      emitter.isPickable = false;
      emitter.metadata = { role: "planet", planetEmitter: true };
      const glow = new StandardMaterial(name + "-emission", scene);
      glow.disableLighting = true;
      glow.emissiveColor = Color3.FromHexString("#" + recipe.palette[5]).scale(
        recipe.emission,
      );
      glow.diffuseColor = Color3.Black();
      emitter.material = glow;
    }
  }
  return { mesh, material, emitter };
}
/** At most one short-range source per luminous body; no per-voxel lights. */
export function createPlanetLight(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  radius: number,
) {
  if (recipe.emission <= 0) return;
  const light = new PointLight(name + "-local-radiance", Vector3.Zero(), scene);
  light.diffuse = Color3.FromHexString("#" + recipe.palette[5]);
  light.intensity = Math.min(0.6, recipe.emission * 0.15);
  light.range = radius * 3;
  return light;
}
