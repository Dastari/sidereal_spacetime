import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { PlanetRecipe } from "@sidereal/content/environment";
import type { NativePlanetKit } from "./native-planet-composition";
import type { PlanetLOD } from "./layered-planet";
import type { createPlanetWorkerClient } from "./planet-worker-client";
import { createPlanetLODCache } from "./planet-lod-cache";
import { stageNativeVolcanicPlanet } from "./native-volcanic-planet";
import { createPlanetSmoke } from "./planet-smoke";
/** Same ready-only publication contract as layered planets; authored volcanic
 * geometry, UV/radiance attributes and molten texture are prepared in the worker. */
export function createNativeVolcanicLODRuntime(
  scene: Scene,
  name: string,
  recipe: PlanetRecipe,
  kit: NativePlanetKit,
  revision: string,
  worker: ReturnType<typeof createPlanetWorkerClient>,
  beforeCompile: () => void,
) {
  const root = new TransformNode(name + "-volcanic-lods", scene);
  root.metadata = {
    role: "planet",
    nativePlanet: true,
    nativeRevision: revision,
  };
  const content = new TransformNode(name + "-lod-content", scene);
  content.parent = root;
  const pool = new Map<string, unknown>(),
    materials = new Set<Material>(),
    textures = new Set<BaseTexture>();
  let disposed = false;
  function shared<T>(key: string, create: () => T): T {
    if (!pool.has(key)) pool.set(key, create());
    return pool.get(key) as T;
  }
  const cache = createPlanetLODCache(
    async (lod) => {
      const data = await worker.nativeVolcanic(kit, recipe, lod);
      if (disposed) throw new Error("Planet removed");
      const stage = stageNativeVolcanicPlanet(
        scene,
        name,
        kit,
        recipe.seed,
        recipe.emission,
        { prepared: data, geometry: data.geometry, revision, shared },
      );
      let step = stage.next();
      const staging = step.done ? step.value.root : step.value;
      staging.parent = content;
      try {
        while (!step.done) {
          await worker.nextFrame();
          if (disposed) throw new Error("Planet removed");
          step = stage.next();
        }
        const value = step.value;
        await worker.nextFrame();
        if (disposed) throw new Error("Planet removed");
        const smoke = createPlanetSmoke(
          scene,
          name,
          recipe,
          data.nativeLod,
          data.smoke,
        );
        if (smoke) {
          smoke.parent = value.root;
          const candidate = smoke.material!;
          smoke.material = shared("smoke-material", () => candidate);
          if (candidate !== smoke.material) candidate.dispose();
        }
        value.root.metadata = {
          ...value.root.metadata,
          lod: data.nativeLod,
          smokeImplemented: true,
          artApproval: "unapproved draft",
        };
        beforeCompile();
        for (const mesh of value.root.getChildMeshes())
          if (mesh.material) {
            materials.add(mesh.material);
            for (const texture of mesh.material.getActiveTextures())
              textures.add(texture);
            await worker.nextFrame();
            if (disposed) throw new Error("Planet removed");
            await mesh.material.forceCompilationAsync(mesh);
          }
        return { ...value, smoke };
      } catch (error) {
        staging.dispose(false, false);
        throw error;
      }
    },
    (value) => value.root.dispose(false, false),
  );
  let current: Awaited<ReturnType<typeof cache.update>>;
  return {
    root,
    get clouds() {
      return undefined as TransformNode | undefined;
    },
    get smoke() {
      return current?.smoke;
    },
    get emitters() {
      return current?.emitters ?? [];
    },
    get animatedMaterials() {
      return [] as ShaderMaterial[];
    },
    snapshot: cache.snapshot,
    updateLOD(lod: PlanetLOD, projected: number) {
      const old = current;
      current = cache.update(lod, projected);
      root.metadata.activeLOD = cache.snapshot().active;
      return old !== current;
    },
    updateWeather(age: number, reduced: boolean) {
      current?.update(age, reduced);
      return undefined as TransformNode | undefined;
    },
    dispose() {
      disposed = true;
      cache.dispose();
      root.dispose(false, false);
      for (const value of pool.values()) {
        if (value && typeof value === "object" && "getActiveTextures" in value)
          materials.add(value as Material);
        else if (value && typeof value === "object" && "material" in value)
          materials.add((value as { material: Material }).material);
        else if (value && typeof value === "object" && "getSize" in value)
          textures.add(value as BaseTexture);
      }
      for (const material of materials) material.dispose(false, false);
      for (const texture of textures) texture.dispose();
      pool.clear();
    },
  };
}
