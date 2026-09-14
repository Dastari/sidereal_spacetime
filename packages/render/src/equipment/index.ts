import { setMeshRole } from "../mesh-roles";
import { bindPoseEquipment } from "./pose-anchors";
import {
  EQUIPMENT_POSE_ITEMS,
  type EquipmentPoseItem,
} from "../../../content/src/equipment-poses";
import { equipmentAimSource, validAnchors } from "./anchors";
export type { EquipmentAimSource, GripBasis } from "./anchors";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";

/** Visual catalog only: these identifiers confer no inventory or combat rights. */
export const EQUIPMENT_ASSETS = [
  "compact-pistol",
  "heavy-handgun",
  "carbine",
  "long-rifle",
  "plasma-cutter",
  "sample-scanner",
  "medkit",
  "resource-canister",
  "power-cell",
  "supply-crate",
  "utility-backpack",
  "shield-backpack",
] as const;
export type EquipmentAsset = (typeof EQUIPMENT_ASSETS)[number];

/** Attach an independently disposable GLB to a crew socket or placed-item node.
 * Caller must hide built-in weapon fixtures when using external held equipment.
 * Use the returned placement node for any intentional art-scale adjustment.
 */
export async function createEquipmentVisual(
  scene: Scene,
  parent: TransformNode,
  asset: EquipmentAsset,
  baseUrl = "/assets/equipment/",
) {
  const metadata = await fetch(`${baseUrl}manifest.json`)
    .then((r) => (r.ok ? r.json() : undefined))
    .catch(() => undefined);
  const entry = metadata?.entries?.find(
    (entry: { file?: string }) => entry.file === `${asset}.glb`,
  );
  const container = await SceneLoader.LoadAssetContainerAsync(
    baseUrl,
    `${asset}.glb`,
    scene,
    undefined,
    ".glb",
  );
  for (const material of container.materials) {
    if (material instanceof PBRMaterial) material.maxSimultaneousLights = 8;
  }
  const root = new TransformNode(`equipment-placement:${asset}`, scene);
  root.parent = parent;
  container.addAllToScene();
  for (const mesh of container.meshes) setMeshRole(mesh, "equipment");
  for (const node of container.rootNodes) node.parent = root;
  const imported = container.rootNodes[0];
  const aim =
    imported instanceof TransformNode &&
    parent.parent instanceof TransformNode &&
    validAnchors(entry)
      ? equipmentAimSource(imported, parent.parent, entry)
      : undefined;
  let disposed = false;
  return {
    root,
    createPoseBinding(
      poseParent: TransformNode,
      item: EquipmentPoseItem = EQUIPMENT_POSE_ITEMS[asset],
    ) {
      if (disposed || !(imported instanceof TransformNode))
        throw new Error("Equipment visual unavailable");
      if (!item) throw new Error(`No equipment pose metadata for ${asset}`);
      return bindPoseEquipment(root, imported, item, poseParent);
    },
    getMuzzleWorld: () => (disposed ? undefined : aim?.getMuzzleWorld()),
    getGripBasis: () => (disposed ? undefined : aim?.getGripBasis()),
    dispose() {
      if (disposed) return;
      disposed = true;
      container.dispose();
      root.dispose();
    },
  };
}
