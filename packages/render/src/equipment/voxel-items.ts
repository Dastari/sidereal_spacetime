import { setPbrLightBudget, GAME_PBR_LIGHT_LIMIT } from "../pbr-light-budget";
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
} from "@sidereal/content/crew-items";
import { setMeshRole } from "../mesh-roles";
import { bindPoseEquipment } from "./pose-anchors";
import { CREW_STUDY, crewStudyUrl } from "@sidereal/content/crew-study";
import { studyMaterials } from "../crew/crew-study-materials";

/** Materials exported by scripts/art_library/crew_items are named `slot:<slot>@<theme>`. */
export function crewItemSlotFromMaterialName(
  name: string,
): CrewItemSlot | undefined {
  const match = /^slot:([a-z_]+)@/.exec(name);
  const slot = match?.[1] as CrewItemSlot | undefined;
  return slot && CREW_ITEM_CATALOG.slots.includes(slot) ? slot : undefined;
}

/** Recolour loaded slot materials in place (albedo = slot colour x baked per-part shade vertex colour). */
export function applyCrewItemTheme(
  materials: readonly Material[],
  item: CrewItemDefinition,
  theme = item.defaultTheme,
) {
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
      material.emissiveColor = new Color3(
        m.emissive[0],
        m.emissive[1],
        m.emissive[2],
      );
      material.emissiveIntensity = m.emissiveStrength ?? 1;
    }
    if (m.alpha !== undefined) material.alpha = m.alpha;
    applied++;
  }
  return applied;
}

/** Socket.hand.R item rotation: convert the catalog's Blender axes to glTF (x, z, -y). */
export function crewItemHandSocketRotation(): Quaternion {
  const [w, x, y, z] = CREW_ITEM_CATALOG.handSocketRotationWXYZ;
  return new Quaternion(x, z, -y, w).normalize();
}

export interface VoxelItemVisualOptions {
  study?: boolean;
  /** Exact in-memory asset for tests/review. */
  source?: ArrayBufferView;
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
export async function createVoxelItemVisual(
  scene: Scene,
  parent: TransformNode,
  itemId: string,
  options: VoxelItemVisualOptions = {},
) {
  const item = crewItem(itemId);
  const studyKey = `item.${item.id === "medkit" ? "med_kit" : item.id.replace(/-/g, "_")}`;
  const studyItem = options.study ? CREW_STUDY.items[studyKey] : undefined;
  if (options.study && !studyItem)
    throw new Error(`No pinned study mesh for ${item.id}`);
  const base = options.baseUrl ?? CREW_ITEM_CATALOG.assetBase;
  const container = await SceneLoader.LoadAssetContainerAsync(
    options.source || studyItem ? "" : base,
    options.source ??
      (studyItem
        ? crewStudyUrl(studyItem.files[options.lod ?? "lod0"].file)
        : item.files[options.lod ?? "lod0"]),
    scene,
    undefined,
    ".glb",
  );
  for (const material of container.materials)
    if (material instanceof PBRMaterial)
      setPbrLightBudget(material, GAME_PBR_LIGHT_LIMIT);
  const studyRegistry = studyItem
    ? studyMaterials(container.materials, {}, studyItem.families)
    : undefined;
  if (!studyItem) applyCrewItemTheme(container.materials, item, options.theme);
  const root = new TransformNode(`crew-item-placement:${item.id}`, scene);
  root.parent = parent;
  if (options.localRotation)
    root.rotationQuaternion = options.localRotation.clone();
  container.addAllToScene();
  for (const mesh of container.meshes) setMeshRole(mesh, "equipment");
  // An item under a crew glTF socket already inherits the crew handedness conversion.
  if (studyItem)
    for (const node of container.rootNodes)
      if (node instanceof TransformNode && node.name === "__root__") {
        node.position.setAll(0);
        node.scaling.setAll(1);
        node.rotationQuaternion = Quaternion.Identity();
      }
  for (const node of container.rootNodes) node.parent = root;
  const imported = container.rootNodes[0];
  // Position comes from this item's own exported socket metadata. The support target's axes
  // match socket.hand.L/R, rather than the item's native -Z barrel frame.
  const supportTarget =
    !studyItem && item.sockets.support && imported instanceof TransformNode
      ? new TransformNode(`crew-item-support:${item.id}`, scene)
      : null;
  if (supportTarget) {
    supportTarget.parent = imported;
    supportTarget.position.copyFromFloats(
      ...item.sockets.support!.gltfPosition,
    );
    supportTarget.rotationQuaternion = crewItemHandSocketRotation().conjugate();
  }
  for (const group of container.animationGroups) group.stop();
  const sight = studyItem
    ? container.animationGroups.find((group) => group.name === "deploy_sight")
    : undefined;
  let sightAmount = 0;
  let sightTarget = 0;
  if (sight) {
    sight.start(false, 0);
    sight.pause();
    sight.goToFrame(sight.from);
  }
  const sightObserver = sight
    ? scene.onBeforeRenderObservable.add(() => {
        const step =
          Math.min(0.1, scene.getEngine().getDeltaTime() / 1000) / 0.25;
        sightAmount +=
          Math.sign(sightTarget - sightAmount) *
          Math.min(Math.abs(sightTarget - sightAmount), step);
        sight.goToFrame(sight.from + (sight.to - sight.from) * sightAmount);
      })
    : undefined;
  const poseItem = item.poseProfile ? toEquipmentPoseItem(item) : undefined;
  let disposed = false;
  const socketWorld = (name: CrewItemSocketName) => {
    if (studyItem) {
      const node = container.transformNodes.find(
        (node) => node.name === `socket.${name}`,
      );
      if (disposed || !node) return undefined;
      const world = node.computeWorldMatrix(true);
      return {
        position: world.getTranslation(),
        direction: Vector3.TransformNormal(
          new Vector3(0, 0, -1),
          world,
        ).normalize(),
      };
    }
    const socket = item.sockets[name];
    if (disposed || !socket || !(imported instanceof TransformNode))
      return undefined;
    const chain: TransformNode[] = [];
    for (
      let node: TransformNode | null = imported;
      node;
      node = node.parent as TransformNode | null
    )
      chain.push(node);
    for (let i = chain.length - 1; i >= 0; i--)
      chain[i].computeWorldMatrix(true);
    const m: Matrix = imported.getWorldMatrix();
    return {
      position: Vector3.TransformCoordinates(
        Vector3.FromArray(socket.gltfPosition),
        m,
      ),
      direction: Vector3.TransformNormal(
        Vector3.FromArray(socket.gltfDirection),
        m,
      ).normalize(),
    };
  };
  return {
    item,
    root,
    /** Cosmetic links only; legacy item themes retain their existing behaviour. */
    setPalette(palette: Record<string, string>) {
      if (!disposed) studyRegistry?.setPalette(palette);
    },
    supportTarget,
    setSightDeployed(deployed: boolean) {
      sightTarget = deployed ? 1 : 0;
    },
    poseItem,
    createPoseBinding(poseParent: TransformNode) {
      if (disposed || !(imported instanceof TransformNode) || !poseItem)
        throw new Error(`Crew item ${item.id} has no pose binding`);
      return bindPoseEquipment(root, imported, poseItem, poseParent);
    },
    /** Plays the item-part clip matching an action and reports the character clip / FX to pair with it. */
    play(action: CrewItemAction) {
      const plan = crewItemActionPlan(item, action);
      if (!disposed && (plan.itemClip || studyItem))
        container.animationGroups
          .find((g) => g.name === (studyItem ? action : plan.itemClip))
          ?.start(action === "idle");
      return plan;
    },
    setTheme(theme: string) {
      if (!disposed && !studyItem)
        applyCrewItemTheme(container.materials, item, theme);
    },
    socketWorld,
    getMuzzleWorld: () =>
      socketWorld(item.sockets.muzzle ? "muzzle" : "emitter"),
    dispose() {
      if (disposed) return;
      disposed = true;
      if (sightObserver) scene.onBeforeRenderObservable.remove(sightObserver);
      container.dispose();
      root.dispose();
    },
  };
}

/** Presentation FX instance driven by the pure sampler in @sidereal/content crew-items. */
export async function createVoxelItemFx(
  scene: Scene,
  parent: TransformNode,
  fxId: string,
  options: { baseUrl?: string; tint?: Color3; lengthM?: number } = {},
) {
  const fx = crewItemFx(fxId);
  const base = options.baseUrl ?? CREW_ITEM_CATALOG.assetBase;
  const container = await SceneLoader.LoadAssetContainerAsync(
    base,
    fx.file,
    scene,
    undefined,
    ".glb",
  );
  const root = new TransformNode(`crew-item-fx:${fx.id}`, scene);
  root.parent = parent;
  container.addAllToScene();
  for (const node of container.rootNodes) node.parent = root;
  for (const mesh of container.meshes) {
    setMeshRole(mesh, "equipment");
    mesh.isPickable = false;
  }
  const materials = container.materials.filter(
    (m): m is PBRMaterial => m instanceof PBRMaterial,
  );
  const baseAlpha = materials.map((m) => m.alpha);
  const baseIntensity = materials.map((m) => m.emissiveIntensity);
  if (options.tint && fx.tint !== "fixed")
    for (const m of materials)
      if (m.emissiveColor.toLuminance() > 0)
        m.emissiveColor = options.tint.clone();
  let t = 0;
  let disposed = false;
  let lengthScale =
    fx.lengthM && options.lengthM ? options.lengthM / fx.lengthM : 1;
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
