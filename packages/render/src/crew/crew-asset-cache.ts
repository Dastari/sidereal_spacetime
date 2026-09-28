import type { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import "@babylonjs/loaders/glTF";

const caches = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();

/**
 * One parsed GLB per scene and URL, never added to the scene itself: callers instantiate copies.
 * Every crew body (the local character and each visible crewmate) clones its meshes from this
 * source, so the vertex and index buffers are uploaded once. Released with the scene.
 */
export function sharedCrewContainer(
  scene: Scene,
  url: string,
): Promise<AssetContainer> {
  let cache = caches.get(scene);
  if (!cache) {
    const owned = new Map<string, Promise<AssetContainer>>();
    cache = owned;
    caches.set(scene, owned);
    scene.onDisposeObservable.addOnce(() => {
      for (const pending of owned.values())
        pending.then((c) => c.dispose()).catch(() => undefined);
      owned.clear();
    });
  }
  let pending = cache.get(url);
  if (!pending) {
    const loading = SceneLoader.LoadAssetContainerAsync(
      "",
      url,
      scene,
      undefined,
      ".glb",
    );
    pending = loading;
    cache.set(url, loading);
    // A failed load may be retried by the next caller.
    loading.catch(() => {
      if (cache.get(url) === loading) cache.delete(url);
    });
  }
  return pending;
}

/** The parts of an asset container a crew body uses, whether owned or instantiated. */
export interface CrewBodyAssets {
  meshes: AbstractMesh[];
  materials: Material[];
  transformNodes: TransformNode[];
  rootNodes: TransformNode[];
  animationGroups: AnimationGroup[];
  skeletons: Skeleton[];
  dispose(): void;
}

/**
 * Instantiate a shared crew body: meshes are clones that share the source geometry, skeletons and
 * animation groups are per body, and materials are cloned (appearance tints each body's slots).
 * Node names are kept, so name-based lookups (bones, sockets, `crew.face`) work unchanged.
 */
export async function instantiateSharedCrewBody(
  scene: Scene,
  url: string,
): Promise<CrewBodyAssets> {
  const source = await sharedCrewContainer(scene, url);
  const entries = source.instantiateModelsToScene((name) => name, true, {
    doNotInstantiate: true,
  });
  const rootNodes = entries.rootNodes as TransformNode[];
  const nodes = rootNodes.flatMap((root) => [
    root,
    ...root.getDescendants(false),
  ]);
  const meshes = nodes.filter(
    (n): n is AbstractMesh => n instanceof AbstractMesh,
  );
  const transformNodes = nodes.filter(
    (n): n is TransformNode =>
      n instanceof TransformNode && !(n instanceof AbstractMesh),
  );
  const materials = [
    ...new Set(
      meshes.flatMap((m) =>
        m.material instanceof MultiMaterial
          ? [m.material, ...m.material.subMaterials]
          : [m.material],
      ),
    ),
  ].filter((m): m is Material => !!m);
  return {
    meshes,
    materials,
    transformNodes,
    rootNodes,
    animationGroups: entries.animationGroups,
    skeletons: entries.skeletons,
    dispose() {
      // Cloned materials may hold cloned texture wrappers (same GPU texture, reference counted);
      // release those, never the shared source's own textures.
      const shared = new Set<unknown>(source.textures);
      const clonedTextures = new Set(
        materials
          .flatMap((m) => m.getActiveTextures())
          .filter((t) => !shared.has(t)),
      );
      entries.dispose();
      for (const material of materials) material.dispose(false, false);
      for (const texture of clonedTextures) texture.dispose();
    },
  };
}
