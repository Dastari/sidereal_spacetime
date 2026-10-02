import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { SerializationHelper } from "@babylonjs/core/Misc/decorators.serialization";
import { GetMergedStore } from "@babylonjs/core/Misc/decorators.functions";
import { characterComponent } from "@sidereal/content/character-components";
import { crewWardrobeItem } from "@sidereal/content/crew-wardrobe";
import { CREW_ARMOR_COLOURWAYS } from "@sidereal/content/crew-armor";
import type {
  ResolvedHeadNode,
  SlotValues,
} from "@sidereal/content/crew-heads";

export const SEALED_HEAD_DIAGNOSTIC_REVISION = "sealed-r006-tactical";
export const SEALED_HEAD_OUTER_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-outer-002";
export const SEALED_HEAD_FACETED_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-faceted-003";
export const SEALED_HEAD_FUNCTIONAL_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-functional-004";
export const SEALED_HEAD_FUNCTIONAL_DETAIL_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-functional-005-exact";
export const SEALED_HEAD_FUNCTIONAL_MACHINE_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-functional-006-machine-exact";
export const SEALED_HEAD_FUNCTIONAL_CLIPPED_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-functional-007-emissive-bevel";
export const SEALED_HEAD_PRESSURE_CONTOUR_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-pressure-contour-008-actual-validated";
export const SEALED_HEAD_WIDE_VISOR_CONTOUR_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-wide-visor-contour-009-actual-validated";
export const SEALED_HEAD_CROWN_TEMPLE_CONTOUR_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-crown-temple-contour-010-finite-cavity";
export const SEALED_HEAD_EYE_LINE_CHEEK_JAW_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-eye-line-cheek-jaw-011-selected-crown-adjacency";
export const SEALED_HEAD_MARINE_CROWN_RECEIVER_DIAGNOSTIC_REVISION =
  "sealed-r006-tactical-marine-crown-stepped-receiver-012";
const navyVisorMaterials = new WeakSet<PBRMaterial>();
/** Physical style owns these two responses after the generic glass finish; only owned clones qualify. */
export function restoreOwnedTacticalVisorFinish(material: PBRMaterial): void {
  if (!navyVisorMaterials.has(material)) return;
  material.roughness = 0.18;
  material.metallic = 0.12;
}
export function isTacticalTintedVisor(node: ResolvedHeadNode): boolean {
  return (
    node.role === "visor" &&
    node.node === "visor.tactical.tinted" &&
    node.slots.glass === "tinted"
  );
}
const worn = new Set([
  "suit_primary",
  "suit_secondary",
  "accent",
  "metal",
  "dark",
  "emit",
]);

// Babylon's ordinary PBR clone also clones texture handles. Instanciate borrows those handles;
// restore independent mutable decorated values so later finish/palette changes stay actor-owned.
function independentBorrowedClone<T extends object>(
  create: () => T,
  source: T,
): T {
  const target = SerializationHelper.Instanciate(create, source);
  for (const [property, metadata] of Object.entries(GetMergedStore(source))) {
    if (![2, 3, 4, 5, 7, 8, 10, 12, 13].includes(metadata.type)) continue;
    const value: unknown = Reflect.get(source, property);
    if (
      value != null &&
      typeof value === "object" &&
      "clone" in value &&
      typeof value.clone === "function"
    )
      Reflect.set(target, property, value.clone());
  }
  return target;
}

function cloneWornMaterial(source: PBRMaterial): PBRMaterial {
  const material = independentBorrowedClone(
    () => new PBRMaterial(source.name, source.getScene()),
    source,
  );
  try {
    source.stencil.copyTo(material.stencil);
    for (const plugin of source.pluginManager?._plugins ?? []) {
      const target = material.pluginManager?.getPlugin(plugin.name);
      // Verified head GLBs use built-in PBR configurations; never silently drop an unknown plugin.
      if (!target) throw new Error("Head worn material plugin unavailable");
      independentBorrowedClone(() => target, plugin);
    }
    return material;
  } catch (error) {
    material.dispose(false, false);
    throw error;
  }
}

/** Actual equipped helmet owns its family; a department uniform cannot recolor its plates. */
export function equippedHelmetPalette(
  id: string | undefined,
  fallback: SlotValues = {},
): SlotValues {
  if (!id) return { ...fallback };
  const wardrobe = crewWardrobeItem(id);
  const component = characterComponent(id.replace(/^crew-/, ""));
  const family =
    wardrobe?.slot === "helmet"
      ? wardrobe.colourway
      : component?.slot === "helmet"
        ? component.archetype
        : undefined;
  const palette = family ? CREW_ARMOR_COLOURWAYS[family] : undefined;
  return {
    ...fallback,
    ...Object.fromEntries(
      Object.entries(palette ?? {}).filter(([slot]) => worn.has(slot)),
    ),
  };
}

/** Per-attachment worn clones; source/person/face/uniform materials and borrowed textures survive. */
export function bindHeadWornPalette(
  meshes: readonly AbstractMesh[],
  slots: SlotValues,
  options: { navyTacticalVisor?: boolean } = {},
): { dispose(): void } {
  const clones = new Map<Material, Material>();
  const assigned: Array<{ mesh: AbstractMesh; previous: Material }> = [];
  const clone = (source: Material): Material => {
    const existing = clones.get(source);
    if (existing) return existing;
    if (source instanceof MultiMaterial) {
      const material = source.clone(source.name, false);
      clones.set(source, material);
      material.subMaterials = source.subMaterials.map((m) =>
        m ? clone(m) : null,
      );
      return material;
    }
    const slot = /^crew\.([a-z_]+)/.exec(source.name)?.[1];
    const color = slot && slots[slot as keyof SlotValues];
    const navyVisor = options.navyTacticalVisor && slot === "glass";
    if (
      !(source instanceof PBRMaterial) ||
      !slot ||
      (!navyVisor &&
        (!worn.has(slot) || !color || !/^#[a-f0-9]{6}$/i.test(color)))
    )
      return source;
    const material = cloneWornMaterial(source);
    clones.set(source, material);
    material.metadata = { ...source.metadata, crewPart: "head" };
    material.albedoColor = Color3.FromHexString(
      navyVisor ? "#122747" : color!,
    ).toLinearSpace();
    if (navyVisor) {
      navyVisorMaterials.add(material);
      material.alpha = 0.94;
      restoreOwnedTacticalVisorFinish(material);
      material.emissiveColor = Color3.Black();
    }
    if (slot === "emit") material.emissiveColor = material.albedoColor.clone();
    return material;
  };
  const dispose = () => {
    for (const { mesh, previous } of assigned.splice(0))
      if (!mesh.isDisposed() && mesh.material === clones.get(previous))
        mesh.material = previous;
    for (const material of clones.values()) {
      if (material instanceof PBRMaterial) navyVisorMaterials.delete(material);
      material.dispose(false, false);
    }
    clones.clear();
  };
  try {
    for (const mesh of meshes) {
      const previous = mesh.material;
      if (!previous) continue;
      const material = clone(previous);
      if (material === previous) continue;
      assigned.push({ mesh, previous });
      mesh.material = material;
    }
    return { dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
