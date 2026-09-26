import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF";
import {
  CREW_ITEM_CATALOG,
  crewItem,
  crewItemActionPlan,
  crewItemFx,
  crewItemMaterials,
  sampleCrewItemFx,
  toEquipmentPoseItem,
  type CrewItemAction,
  type CrewItemDefinition,
  type CrewItemSlot,
  type CrewItemSocketName,
} from "../../../content/src/crew-items";
import { setMeshRole } from "../mesh-roles";
import { bindPoseEquipment } from "./pose-anchors";

/** Materials exported by scripts/art_library/crew_items are named `slot:<slot>@<theme>`. */
export function crewItemSlotFromMaterialName(name: string): CrewItemSlot | undefined {
  const match = /^slot:([a-z_]+)@/.exec(name);
  const slot = match?.[1] as CrewItemSlot | undefined;
  return slot && CREW_ITEM_CATALOG.slots.includes(slot) ? slot : undefined;
}

/** Recolour loaded slot materials in place (albedo = slot colour x baked per-part shade vertex colour). */
export function applyCrewItemTheme(materials: readonly Material[], item: CrewItemDefinition, theme = item.defaultTheme) {
  const table = crewItemMaterials(item, theme);
  let applied = 0;
  for (const material of materials) {
    const slot = crewItemSlotFromMaterialName(material.name);
    if (!slot || !(material instanceof PBRMaterial)) continue;
    const m = table[slot];
    material.albedoColor = new Color3(m.color[0], m.color[1], m.color[2]);
    material.roughness = m.roughness;
    material.metallic = m.metallic;
    if (m.emissive) {
      material.emissiveColor = new Color3(m.emissive[0], m.emissive[1], m.emissive[2]);
      material.emissiveIntensity = m.emissiveStrength ?? 1;
    }
    if (m.alpha !== undefined) material.alpha = m.alpha;
    applied++;
  }
  return applied;
}

/** Socket.hand.R (CHAR-BODY r001) local rotation for the item root, in Blender axes (w,x,y,z). */
export function crewItemHandSocketRotation(): Quaternion {
  const [w, x, y, z] = CREW_ITEM_CATALOG.handSocketRotationWXYZ;
  return new Quaternion(x, y, z, w);
}

export interface VoxelItemVisualOptions {
  theme?: string;
  lod?: "lod0" | "lod1";
  baseUrl?: string;
  /** Optional local rotation of the item root under `parent` (e.g. a socket whose axes differ). */
  localRotation?: Quaternion;
}

/**
 * Load a voxel r001 crew item under a socket/placement node. Returns the same surface as
 * createEquipmentVisual (root, pose binding, muzzle, dispose) plus theme swap and item clips.
 * PRESENTATION ONLY: firing/reload/use clips play for already accepted events or previews.
 */
export async function createVoxelItemVisual(scene: Scene, parent: TransformNode, itemId: string, options: VoxelItemVisualOptions = {}) {
  const item = crewItem(itemId);
  const base = options.baseUrl ?? CREW_ITEM_CATALOG.assetBase;
  const container = await SceneLoader.LoadAssetContainerAsync(base, item.files[options.lod ?? "lod0"], scene, undefined, ".glb");
  for (const material of container.materials) if (material instanceof PBRMaterial) material.maxSimultaneousLights = 8;
  applyCrewItemTheme(container.materials, item, options.theme);
  const root = new TransformNode(`crew-item-placement:${item.id}`, scene);
  root.parent = parent;
  if (options.localRotation) root.rotationQuaternion = options.localRotation.clone();
  container.addAllToScene();
  for (const mesh of container.meshes) setMeshRole(mesh, "equipment");
  for (const node of container.rootNodes) node.parent = root;
  const imported = container.rootNodes[0];
  for (const group of container.animationGroups) group.stop();
  const poseItem = item.poseProfile ? toEquipmentPoseItem(item) : undefined;
  let disposed = false;
  const socketWorld = (name: CrewItemSocketName) => {
    const socket = item.sockets[name];
    if (disposed || !socket || !(imported instanceof TransformNode)) return undefined;
    const chain: TransformNode[] = [];
    for (let node: TransformNode | null = imported; node; node = node.parent as TransformNode | null) chain.push(node);
    for (let i = chain.length - 1; i >= 0; i--) chain[i].computeWorldMatrix(true);
    const m: Matrix = imported.getWorldMatrix();
    return {
      position: Vector3.TransformCoordinates(Vector3.FromArray(socket.gltfPosition), m),
      direction: Vector3.TransformNormal(Vector3.FromArray(socket.gltfDirection), m).normalize(),
    };
  };
  return {
    item,
    root,
    poseItem,
    createPoseBinding(poseParent: TransformNode) {
      if (disposed || !(imported instanceof TransformNode) || !poseItem) throw new Error(`Crew item ${item.id} has no pose binding`);
      return bindPoseEquipment(root, imported, poseItem, poseParent);
    },
    /** Plays the item-part clip matching an action and reports the character clip / FX to pair with it. */
    play(action: CrewItemAction) {
      const plan = crewItemActionPlan(item, action);
      if (!disposed && plan.itemClip) container.animationGroups.find((g) => g.name === plan.itemClip)?.start(action === "idle");
      return plan;
    },
    setTheme(theme: string) {
      if (!disposed) applyCrewItemTheme(container.materials, item, theme);
    },
    socketWorld,
    getMuzzleWorld: () => socketWorld(item.sockets.muzzle ? "muzzle" : "emitter"),
    dispose() {
      if (disposed) return;
      disposed = true;
      container.dispose();
      root.dispose();
    },
  };
}

/** Presentation FX instance driven by the pure sampler in @sidereal/content crew-items. */
export async function createVoxelItemFx(scene: Scene, parent: TransformNode, fxId: string, options: { baseUrl?: string; tint?: Color3; lengthM?: number } = {}) {
  const fx = crewItemFx(fxId);
  const base = options.baseUrl ?? CREW_ITEM_CATALOG.assetBase;
  const container = await SceneLoader.LoadAssetContainerAsync(base, fx.file, scene, undefined, ".glb");
  const root = new TransformNode(`crew-item-fx:${fx.id}`, scene);
  root.parent = parent;
  container.addAllToScene();
  for (const node of container.rootNodes) node.parent = root;
  for (const mesh of container.meshes) {
    setMeshRole(mesh, "equipment");
    mesh.isPickable = false;
  }
  const materials = container.materials.filter((m): m is PBRMaterial => m instanceof PBRMaterial);
  const baseAlpha = materials.map((m) => m.alpha);
  const baseIntensity = materials.map((m) => m.emissiveIntensity);
  if (options.tint && fx.tint !== "fixed")
    for (const m of materials) if (m.emissiveColor.toLuminance() > 0) m.emissiveColor = options.tint.clone();
  let t = 0;
  let disposed = false;
  let lengthScale = fx.lengthM && options.lengthM ? options.lengthM / fx.lengthM : 1;
  return {
    fx,
    root,
    /** Advance by dt seconds; returns false once a one-shot effect has finished. */
    update(dt: number) {
      if (disposed) return false;
      t += dt;
      const s = sampleCrewItemFx(fx, t);
      // Authored +Y (Blender forward) is glTF -Z; beams stretch along it to the measured length.
      root.scaling.set(s.scale[0], s.scale[2], s.scale[1] * lengthScale);
      materials.forEach((m, i) => {
        m.alpha = baseAlpha[i] * s.opacity;
        m.emissiveIntensity = baseIntensity[i] * s.emissive;
      });
      return !s.finished;
    },
    setLength(metres: number) {
      if (fx.lengthM) lengthScale = metres / fx.lengthM;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      container.dispose();
      root.dispose();
    },
  };
}
