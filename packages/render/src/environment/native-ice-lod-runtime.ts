import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { PlanetRecipe } from "@sidereal/content/environment";
import type { NativePlanetKit } from "./native-planet-composition";
import type { PlanetLOD } from "./layered-planet";
import type { createPlanetWorkerClient } from "./planet-worker-client";
import { createPlanetLODCache } from "./planet-lod-cache";
import { createNativeIceFinish } from "./native-ice-material";
import { NATIVE_ICE_REVISION } from "./native-planet-assets";
export function createNativeIceLODRuntime(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  kit: NativePlanetKit,
  worker: ReturnType<typeof createPlanetWorkerClient>,
  beforeCompile: () => void,
) {
  const root = new TransformNode(name + "-ice-lods", scene);
  root.metadata = {
    role: "planet",
    nativePlanet: true,
    nativeRevision: NATIVE_ICE_REVISION,
  };
  const content = new TransformNode(name + "-lod-content", scene);
  content.parent = root;
  const materials = new Map<number, ReturnType<typeof createNativeIceFinish>>();
  let disposed = false;
  const cache = createPlanetLODCache(
    async (lod) => {
      const data = await worker.nativeIce(kit, recipe, lod);
      if (disposed) throw new Error("Planet removed");
      const level = new TransformNode(name + "-native-ice", scene);
      level.parent = content;
      level.setEnabled(false);
      level.metadata = {
        role: "planet",
        nativePlanet: true,
        nativeRevision: NATIVE_ICE_REVISION,
        lod: data.nativeLod,
        triangles: data.triangles,
        seed: recipe.seed,
        source: "Blender authored native forms",
        artApproval: "local review candidate, final art unapproved",
      };
      try {
        for (const [index, batch] of data.batches.entries()) {
          if (!batch.indices.length) continue;
          await worker.nextFrame();
          if (disposed) throw new Error("Planet removed");
          const mesh = new Mesh(
              name + "-native-" + kit.materials[index].name,
              scene,
            ),
            vertices = new VertexData();
          mesh.parent = level;
          mesh.isPickable = false;
          mesh.metadata = {
            role: "planet",
            style: "ice",
            nativeRevision: NATIVE_ICE_REVISION,
          };
          vertices.positions = batch.positions;
          vertices.normals = batch.normals;
          vertices.indices = batch.indices;
          vertices.applyToMesh(mesh);
          mesh.setVerticesData("iceOptics", batch.optics, false, 2);
          mesh.setVerticesData("nativeOptics", batch.optics, false, 2);
          if (!materials.has(index)) {
            const material = createNativeIceFinish(
              scene,
              name + "-" + kit.materials[index].name,
              index === 0,
            );
            material.albedoColor = Color3.FromArray(
              kit.materials[index].linearColor,
            );
            material.metallic = 0;
            material.indexOfRefraction = 1.31;
            materials.set(index, material);
          }
          mesh.material = materials.get(index)!;
        }
        beforeCompile();
        for (const mesh of level.getChildMeshes()) {
          await worker.nextFrame();
          if (disposed) throw new Error("Planet removed");
          await mesh.material!.forceCompilationAsync(mesh);
        }
        return { root: level };
      } catch (error) {
        level.dispose(false, false);
        throw error;
      }
    },
    (value) => value.root.dispose(false, false),
  );
  let current: ReturnType<typeof cache.update>;
  return {
    root,
    clouds: undefined as TransformNode | undefined,
    smoke: undefined as TransformNode | undefined,
    emitters: [] as Mesh[],
    animatedMaterials: [] as ShaderMaterial[],
    snapshot: cache.snapshot,
    updateLOD(lod: PlanetLOD, projected: number) {
      const old = current;
      current = cache.update(lod, projected);
      root.metadata.activeLOD = cache.snapshot().active;
      return old !== current;
    },
    updateWeather: (_age: number, _reduced: boolean) =>
      undefined as TransformNode | undefined,
    dispose() {
      disposed = true;
      cache.dispose();
      root.dispose(false, false);
      for (const material of materials.values()) material.dispose(false, false);
      materials.clear();
    },
  };
}
