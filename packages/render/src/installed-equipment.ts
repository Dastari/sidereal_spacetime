import { canInstancePlacement } from "./placement-instance";
import { framedWayfarerVisual } from "./framed-wayfarer-visuals";
import { framedEnginePrototype } from "./framed-engine-prototype";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { categoryMeshRole, setMeshRole } from "./mesh-roles";
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

/** Load pinned native surfaces. Geometry/materials are shared, placement IDs are not. */
export async function loadEquipmentPrototypes(
  scene: Scene,
  assets: readonly PartAsset[],
) {
  const result = new Map<string, Mesh[]>();
  const libraries = new Map<
    string,
    { sha256: string; meshes: Mesh[]; framed: boolean }
  >();
  for (const original of assets) {
    const asset = framedWayfarerVisual(original);
    if (!asset.visual) continue;
    const url = asset.visual.url;
    let library = libraries.get(url);
    if (library && library.sha256 !== asset.visual.sha256)
      throw new Error("Conflicting visual revisions for shared GLB: " + url);
    if (!library) {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Native visual unavailable: " + url);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (constructionHash(bytes) !== asset.visual.sha256)
        throw new Error("Native visual hash mismatch: " + url);
      const imported = await SceneLoader.ImportMeshAsync(
        "",
        "",
        bytes,
        scene,
        undefined,
        ".glb",
      );
      for (const mesh of imported.meshes)
        setMeshRole(mesh, categoryMeshRole(asset.category));
      const meshes = imported.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      for (const mesh of meshes) {
        mesh.isVisible = false;
        mesh.isPickable = false;
      }
      library = {
        sha256: asset.visual.sha256,
        meshes,
        framed:
          asset.visual.designId?.startsWith("shipyard.wayfarer.framed.") ??
          false,
      };
      libraries.set(url, library);
    }
    const prefix = asset.visual.nodePrefix;
    let meshes = prefix
      ? library.meshes.filter((m) => nativeMeshInGroup(m.name, prefix))
      : library.meshes;
    if (!meshes.length)
      throw new Error(
        "Empty visual mesh group: " + asset.id + (prefix ? " / " + prefix : ""),
      );
    const enginePrototype = framedEnginePrototype(asset, meshes);
    if (enginePrototype) meshes = [enginePrototype];
    if (
      asset.category === "cargo" ||
      asset.visual?.designId === "shipyard.hull.pilot-section"
    )
      meshes = batchStaticMaterials(meshes, categoryMeshRole(asset.category));
    for (const mesh of meshes)
      setMeshRole(mesh, categoryMeshRole(asset.category));
    result.set(asset.id, meshes);
  }
  // A shared kit includes optional sizes and variants. Once every requested
  // group has been resolved, retain only its actual prototypes (including the
  // merged engines). Keep shared materials and parent transforms alive.
  const retained = new Set([...result.values()].flat());
  for (const library of libraries.values()) {
    for (const mesh of library.meshes)
      if (
        !retained.has(mesh) &&
        !mesh.isDisposed() &&
        mesh.getChildren().length === 0
      )
        mesh.dispose(true, false);
  }
  return result;
}
export function equipmentPlacement(
  scene: Scene,
  parent: TransformNode,
  asset: PartAsset,
  placement: PartPlacement,
  sources: Mesh[],
) {
  asset = framedWayfarerVisual(asset);
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
    const mesh = instanceable
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
  return { node, meshes, lighting };
}
export async function loadInstalledEquipment(
  scene: Scene,
  parent: TransformNode,
  legacyMeshes: AbstractMesh[],
) {
  const response = await fetch("/assets/assembly/equipment-manifest.json");
  if (!response.ok) throw new Error("Approved equipment manifest unavailable");
  const manifest = (await response.json()) as {
    entries: { asset: PartAsset; placements: PartPlacement[] }[];
  };
  const prototypes = await loadEquipmentPrototypes(
    scene,
    manifest.entries.map((e) => e.asset),
  );
  const placements = manifest.entries.flatMap((e) =>
    e.placements.map((p) =>
      equipmentPlacement(
        scene,
        parent,
        e.asset,
        p,
        prototypes.get(e.asset.id)!,
      ),
    ),
  );
  const ids = manifest.entries.flatMap((e) =>
    e.placements.map((p) => "GEO-" + p.id),
  );
  // Retained old ship exports may still contain proxy visuals. Never show both.
  const retired = legacyMeshes.filter((m) =>
    ids.some(
      (id) =>
        m.name === id ||
        m.name.startsWith(id + "-") ||
        m.name.startsWith(id + "_"),
    ),
  );
  for (const mesh of retired) mesh.dispose();
  return {
    meshes: [
      ...legacyMeshes.filter((m) => !retired.includes(m)),
      ...placements.flatMap((p) => p.meshes),
    ],
    placements,
  };
}
