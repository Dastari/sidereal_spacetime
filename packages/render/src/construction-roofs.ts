import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import {
  CONSTRUCTION_ROOF_GLB_SHA,
  CONSTRUCTION_ROOF_URL,
  CONSTRUCTION_ROOF_INTERFACES as kit,
  type ConstructionRoofPlacement,
} from "@sidereal/content/construction-roof";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { createEquipmentLighting } from "./equipment-lighting";

/** Exact single-sided Blender surfaces; hiding roofs never changes authority. */
export async function loadConstructionRoofs(
  scene: Scene,
  parent: TransformNode,
  placements: readonly ConstructionRoofPlacement[],
) {
  if (!scene.useRightHandedSystem)
    throw Error("Native roof adapter requires the declared right-handed frame");
  const response = await fetch(CONSTRUCTION_ROOF_URL);
  if (!response.ok) throw Error("Native construction roofs unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (constructionHash(bytes) !== CONSTRUCTION_ROOF_GLB_SHA)
    throw Error("Pinned native roof GLB hash mismatch");
  const imported = await SceneLoader.ImportMeshAsync(
    "",
    "",
    bytes,
    scene,
    undefined,
    ".glb",
  );
  const sources = imported.meshes.filter(
    (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
  );
  const matrices = new Map(
    sources.map((m) => [m, m.computeWorldMatrix(true).clone()]),
  );
  for (const mesh of imported.meshes) {
    mesh.isVisible = false;
    mesh.isPickable = false;
  }
  const results = placements.map((p) => {
    const definition = kit.parts.find((d) => d.id === p.partId);
    if (!definition || !definition.quarterTurns.includes(p.quarterTurns))
      throw Error("Unknown native roof component or orientation");
    const prefix = definition.native.nodePrefix;
    const selected = sources.filter(
      (m) =>
        m.name === prefix ||
        m.name.startsWith(prefix + "_") ||
        m.name.startsWith(prefix + "."),
    );
    if (!selected.length) throw Error("Missing native roof selector " + prefix);
    const id =
      "construction:" +
      constructionHash(
        JSON.stringify([parent.metadata?.instanceId ?? parent.name, p.key]),
      ).slice(0, 32);
    const node = new TransformNode("placement-" + id, scene);
    node.parent = parent;
    node.position.set(p.origin[0] / 32, p.origin[2] / 32, -p.origin[1] / 32);
    node.rotation.y = (p.quarterTurns * Math.PI) / 2;
    node.metadata = {
      partId: id,
      assetId: definition.assetUuid,
      constructionRoof: true,
      floorId: p.floorId,
      semanticKey: p.key,
      damageMode: "voxel",
      damageReady: false,
    };
    const meshes = selected.map((source) => {
      const mesh = source.clone(
        "GEO-" + id + "--native--" + source.name,
        node,
        true,
      )!;
      const rotation = new Quaternion();
      matrices.get(source)!.decompose(mesh.scaling, rotation, mesh.position);
      mesh.rotationQuaternion = rotation;
      mesh.isVisible = true;
      mesh.isPickable = false;
      mesh.receiveShadows = true;
      mesh.metadata = { ...node.metadata };
      return mesh;
    });
    const lighting = createEquipmentLighting(scene, node, []);
    lighting.setMeshes(meshes);
    return { node, meshes, lighting };
  });
  return {
    placements: results,
    meshes: results.flatMap((p) => p.meshes),
    setVisible(visible: boolean) {
      for (const p of results)
        if (p.node.isEnabled() !== visible) p.node.setEnabled(visible);
    },
  };
}
