import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { PlanetRecipe } from "../../../content/src/environment";
import { stageLayeredPlanet, type PlanetLOD } from "./layered-planet";
import { createPlanetLODCache } from "./planet-lod-cache";
import type { createPlanetWorkerClient } from "./planet-worker-client";

/** Each body owns its material pool and retained LOD nodes. GPU uploads/compiles
 * happen before publication, one mesh step per animation frame. */
export function createPlanetLODRuntime(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  worker: ReturnType<typeof createPlanetWorkerClient>,
  beforeCompile?: () => void,
) {
  const root = new TransformNode(name + "-layers", scene);
  root.metadata = { role: "planet", layeredPlanet: true };
  const content = new TransformNode(name + "-lod-content", scene);
  content.parent = root;
  const pool = new Map<string, Material>();
  let disposed = false;
  const nextFrame=worker.nextFrame;
  const cache = createPlanetLODCache(
    async (lod) => {
      const data = await worker.build(recipe, lod);
      if (disposed) throw new Error("Planet removed");
      const stage = stageLayeredPlanet(
        scene,
        name,
        recipe,
        lod,
        data,
        <T extends Material>(key: string, create: () => T): T => {
          let mat = pool.get(key);
          if (!mat) {
            mat = create();
            pool.set(key, mat);
          }
          return mat as T;
        },
        (phase) => worker.weather(recipe, lod, phase),
      );
      let step = stage.next();
      const stagingRoot = step.done ? step.value.root : step.value;
      // Generator yields its root before advancing expensive mesh uploads.
      if (stagingRoot instanceof TransformNode) stagingRoot.parent = content;
      try {
        while (!step.done) {
          await nextFrame();
          if (disposed) throw new Error("Planet removed");
          step = stage.next();
        }
        const value = step.value;
        beforeCompile?.();
        for (const mesh of value.root.getChildMeshes()) {
          const candidate = mesh.material;
          if (!candidate) continue;
          const shared = pool.get(candidate.name);
          if (shared && shared !== candidate) {
            mesh.material = shared;
            const i = value.animatedMaterials.indexOf(
              candidate as ShaderMaterial,
            );
            if (i >= 0) value.animatedMaterials[i] = shared as ShaderMaterial;
            candidate.dispose(false, true);
          } else pool.set(candidate.name, candidate);
          await mesh.material!.forceCompilationAsync(mesh);
          await nextFrame();
          if (disposed) throw new Error("Planet removed");
        }
        return value;
      } catch (error) {
        if (stagingRoot instanceof TransformNode)
          stagingRoot.dispose(false, false);
        throw error;
      }
    },
    (value) => value.root.dispose(false, false),
  );
  let current:
    | ReturnType<typeof import("./layered-planet").createLayeredPlanet>
    | undefined;
  return {
    root,
    get clouds() {
      return current?.clouds;
    },
    get smoke() {
      return current?.smoke;
    },
    get emitters() {
      return current?.emitters ?? [];
    },
    get animatedMaterials() {
      return current?.animatedMaterials ?? [];
    },
    updateLOD(lod: PlanetLOD, projected: number) {
      const previous=current;
      current = cache.update(lod, projected);
      root.metadata.activeLOD=cache.snapshot().active;
      return current!==previous;
    },
    snapshot: cache.snapshot,
    updateWeather(age: number, reduced: boolean) {
      return current?.updateWeather(age, reduced);
    },
    dispose() {
      disposed = true;
      cache.dispose();
      root.dispose(false, false);
      for (const mat of pool.values()) mat.dispose(false, true);
      pool.clear();
    },
  };
}
