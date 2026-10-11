import { createHullPaintBinding } from "./hull-paint";
import { canInstancePlacement } from "./placement-instance";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { categoryMeshRole, setMeshRole, type MeshRole } from "./mesh-roles";
import { updateHullDecals } from "./hull-decals";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { PartAsset, PartPlacement } from "@sidereal/content/assembly";
import { createEquipmentLighting } from "./equipment-lighting";
import { batchStaticMaterials } from "./static-material-batches";
import { nativeMeshInGroup } from "./native-mesh-group";

type PrototypeLibrary = {
  sha256: string;
  meshes: Mesh[];
  groups: Map<string, Mesh[]>;
};
const sceneLibraries = new WeakMap<
  Scene,
  Map<string, { sha256: string; ready: Promise<PrototypeLibrary> }>
>();
/** Immutable native source library; Scene owns its meshes, transforms and materials. */
export async function loadNativeLibrary(
  scene: Scene,
  url: string,
  sha256: string,
  role: MeshRole,
): Promise<PrototypeLibrary> {
  let libraries = sceneLibraries.get(scene);
  if (!libraries) {
    libraries = new Map();
    sceneLibraries.set(scene, libraries);
  }
  let cached = libraries.get(url);
  if (cached && cached.sha256 !== sha256)
    throw new Error("Conflicting visual revisions for shared GLB: " + url);
  if (!cached) {
    const ready = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Native visual unavailable: " + url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (constructionHash(bytes) !== sha256)
        throw new Error("Native visual hash mismatch: " + url);
      if (scene.isDisposed) throw Error("Native visual load cancelled");
      const imported = await SceneLoader.ImportMeshAsync(
        "",
        "",
        bytes,
        scene,
        undefined,
        ".glb",
      );
      if (scene.isDisposed) {
        for (const mesh of imported.meshes) mesh.dispose(false, true);
        throw Error("Native visual load cancelled");
      }
      for (const mesh of imported.meshes) setMeshRole(mesh, role);
      const meshes = imported.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      for (const mesh of meshes) {
        mesh.isVisible = false;
        mesh.isPickable = false;
      }
      return { sha256, meshes, groups: new Map<string, Mesh[]>() };
    })();
    cached = { sha256, ready };
    libraries.set(url, cached);
    void ready.catch(() => {
      if (libraries!.get(url)?.ready === ready) libraries!.delete(url);
    });
  }
  return cached.ready;
}
/** Load pinned native surfaces. Geometry/materials are shared, placement IDs are not. */
export async function loadEquipmentPrototypes(
  scene: Scene,
  assets: readonly PartAsset[],
) {
  const result = new Map<string, Mesh[]>();
  for (const asset of assets) {
    const visual = asset.visual;
    if (!visual) continue;
    const library = await loadNativeLibrary(
      scene,
      visual.url,
      visual.sha256,
      categoryMeshRole(asset.category),
    );
    const groupKey = JSON.stringify([
      asset.id,
      asset.category,
      visual.nodePrefix,
      visual.designId,
    ]);
    const existing = library.groups.get(groupKey);
    if (existing) {
      result.set(asset.id, existing);
      continue;
    }
    const prefix = visual.nodePrefix;
    let meshes = prefix
      ? library.meshes.filter((m) => nativeMeshInGroup(m.name, prefix))
      : library.meshes;
    if (!meshes.length)
      throw new Error(
        "Empty visual mesh group: " + asset.id + (prefix ? " / " + prefix : ""),
      );
    if (
      asset.category === "cargo" ||
      visual?.designId === "shipyard.hull.pilot-section"
    )
      meshes = batchStaticMaterials(
        meshes,
        categoryMeshRole(asset.category),
        false,
      );
    for (const mesh of meshes)
      setMeshRole(mesh, categoryMeshRole(asset.category));
    library.groups.set(groupKey, meshes);
    result.set(asset.id, meshes);
  }
  // Immutable hidden sources belong to the Scene, not an occupied private vessel.
  // Keep every library group available for later accepted decks; Scene.dispose owns cleanup.
  return result;
}
export function equipmentPlacement(
  scene: Scene,
  parent: TransformNode,
  asset: PartAsset,
  placement: PartPlacement,
  sources: Mesh[],
) {
  const node = new TransformNode("placement-" + placement.id, scene);
  node.parent = parent;
  node.metadata = {
    partId: placement.id,
    assetId: asset.id,
    designRevision: asset.visual?.revision,
    role: categoryMeshRole(asset.category),
  };
  node.position.set(
    placement.position[0],
    placement.position[2],
    -placement.position[1],
  );
  node.rotation.y = placement.rotation;
  node.scaling.x = placement.flipped ? -1 : 1;
  const painter = createHullPaintBinding(node, asset, placement.paint);
  const meshes: AbstractMesh[] = sources.map((source) => {
    const name = "GEO-" + placement.id + "--native--" + source.name;
    const instanceable = canInstancePlacement(asset, source);
    // Ship lighting uses the same receiver policy for these pinned opaque kits.
    // Babylon instances inherit this flag from the source.
    if (instanceable) {
      source.receiveShadows = true;
      source.metadata = {
        ...source.metadata,
        role: categoryMeshRole(asset.category),
        materialRole: "opaque",
      };
    }
    const mesh = painter
      ? painter.clone(source, name)
      : instanceable
        ? source.createInstance(name)
        : source.clone(name, node, true)!;
    mesh.parent = node;
    mesh.isVisible = true;
    mesh.isPickable = true;
    mesh.metadata = {
      partId: placement.id,
      assetId: asset.id,
      role: categoryMeshRole(asset.category),
      ...(instanceable ? { materialRole: "opaque" } : {}),
      ...(source.metadata?.prototypeBatch && !instanceable
        ? {
            trianglePlacements: [
              {
                start: 0,
                count: mesh.getTotalIndices() / 3,
                placementId: placement.id,
              },
            ],
          }
        : {}),
    };
    return mesh;
  });
  meshes.push(
    ...updateHullDecals(scene, node, placement.decals, placement.flipped),
  );
  const lighting = createEquipmentLighting(scene, node, asset.lights);
  lighting.setMeshes(meshes);
  const releaseLighting = lighting.dispose.bind(lighting);
  let lightsDisposed = false;
  lighting.dispose = () => {
    if (lightsDisposed) return;
    lightsDisposed = true;
    releaseLighting();
  };
  node.onDisposeObservable.addOnce(() => lighting.dispose());

  return { node, meshes, lighting };
}
/** One placed native part: its node, meshes and local light owner. */
export type InstalledPlacement = ReturnType<typeof equipmentPlacement>;
