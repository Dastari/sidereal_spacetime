import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import "@babylonjs/loaders/glTF";
import {
  CREW_MATERIAL_SLOTS,
  crewArmorAssetUrl,
  crewArmorColourway,
  crewArmorMeshName,
  type CrewArmorBodyVariant,
  type CrewArmorPart,
  type CrewBodyRegion,
  type CrewMaterialSlot,
} from "@sidereal/content/crew-armor";
import { setMeshRole } from "../mesh-roles";
import { tagCrewPart } from "../molded-plastic";

/**
 * Presentation-only armour attachment for the voxel crew (CHAR-BODY contract): every armour GLB
 * carries a copy of crew_rig plus one rigid-skinned mesh per torso fit. The armour skeleton's bones
 * are re-linked to the body's joint TransformNodes of the same name, so the armour follows every
 * body animation without its own animation data. Nothing here reads or writes authority state.
 */
export interface CrewArmorAttachTarget {
  /** Node the body's glTF root is parented to (the crew visual root). */
  root: TransformNode;
  /** Body joints by crew_rig bone name (CHAR-BODY `crew.joints`). */
  joints: ReadonlyMap<string, TransformNode>;
}

export interface CrewArmorAttachment {
  part: CrewArmorPart;
  meshes: AbstractMesh[];
  /** Body regions the caller should hide (CHAR-BODY `crew.setHiddenRegions`). */
  hidesBodyRegions: CrewBodyRegion[];
  /** Bones that found a body joint; unmatched bones keep the armour's rest pose. */
  linkedBones: string[];
  setColourway(id: string): void;
  dispose(): void;
}

/** `crew.suit_primary`, `crew.suit_primary.001` -> `suit_primary`. */
export function crewMaterialSlot(name: string): CrewMaterialSlot | undefined {
  const m = /^crew\.([a-z_]+)/.exec(name);
  const slot = m?.[1];
  return (CREW_MATERIAL_SLOTS as readonly string[]).includes(slot ?? "")
    ? (slot as CrewMaterialSlot)
    : undefined;
}

/** Linear-space colours for the armour slots of a colourway (glTF factors are linear). */
export function crewArmorSlotColors(
  colourway: string,
): Partial<Record<CrewMaterialSlot, Color3>> {
  const table = crewArmorColourway(colourway);
  const out: Partial<Record<CrewMaterialSlot, Color3>> = {};
  for (const [slot, hex] of Object.entries(table))
    if (slot !== "label")
      out[slot as CrewMaterialSlot] = Color3.FromHexString(hex).toLinearSpace();
  return out;
}

export function applyCrewArmorColourway(
  materials: readonly Material[],
  colourway: string,
) {
  const colors = crewArmorSlotColors(colourway);
  for (const material of materials) {
    const slot = crewMaterialSlot(material.name);
    const color = slot && colors[slot];
    if (!color || !(material instanceof PBRMaterial)) continue;
    material.albedoColor = color.clone();
    if (slot === "emit") material.emissiveColor = color.clone();
  }
}

export async function attachCrewArmor(
  scene: Scene,
  target: CrewArmorAttachTarget,
  part: CrewArmorPart,
  options: {
    variant: CrewArmorBodyVariant;
    colourway: string;
    /** Override for tests/previews (URL or GLB bytes); defaults to the content-addressed asset URL. */
    source?: string | ArrayBufferView;
  },
): Promise<CrewArmorAttachment> {
  const container = await SceneLoader.LoadAssetContainerAsync(
    "",
    options.source ?? crewArmorAssetUrl(part),
    scene,
    undefined,
    ".glb",
  );
  const keep = crewArmorMeshName(part, options.variant);
  // Babylon names multi-material primitives `<mesh>_primitiveN` under a `<mesh>` node.
  const wanted = (m: AbstractMesh) =>
    m.name === keep || m.name.startsWith(`${keep}_primitive`);
  for (const mesh of [...container.meshes])
    if (mesh.getTotalVertices() > 0 && !wanted(mesh)) {
      container.meshes.splice(container.meshes.indexOf(mesh), 1);
      mesh.dispose(false, false);
    }
  container.addAllToScene();
  const meshes = container.meshes.filter(
    (m) => m.getTotalVertices() > 0 && wanted(m),
  );
  for (const mesh of meshes) setMeshRole(mesh, "crew");
  const linkedBones: string[] = [];
  for (const skeleton of container.skeletons)
    for (const bone of skeleton.bones) {
      const joint = target.joints.get(bone.name);
      if (!joint) continue;
      bone.linkTransformNode(joint);
      linkedBones.push(bone.name);
    }
  for (const node of container.rootNodes) node.parent = target.root;
  applyCrewArmorColourway(container.materials, options.colourway);
  // Armour, helmets and wardrobe gear are moulded parts (their suit slots are plates, not cloth).
  tagCrewPart(container.materials, "armour");
  let disposed = false;
  return {
    part,
    meshes,
    hidesBodyRegions: [...part.hidesBodyRegions],
    linkedBones,
    setColourway: (id) => {
      if (!disposed) applyCrewArmorColourway(container.materials, id);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      container.dispose();
    },
  };
}
