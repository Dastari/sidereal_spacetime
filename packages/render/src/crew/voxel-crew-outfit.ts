import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {
  CREW_ARMOR_SLOTS,
  crewArmorLoadoutFromEquipment,
  crewArmorPart,
  type CrewArmorLoadout,
  type CrewArmorSlot,
} from "@sidereal/content/crew-armor";
import { crewWardrobeItem } from "@sidereal/content/crew-wardrobe";
import { voxelHeadLoadoutFromAppearance } from "@sidereal/content/crew-voxel-appearance";
import type { EquippedCharacterComponents } from "@sidereal/content/character-components";
import type { VoxelCrewRegion } from "@sidereal/content/crew-voxel-bundle";
import { attachCrewArmor, type CrewArmorAttachment } from "./armor-attach";
import { attachVoxelCrewHead } from "./voxel-crew-kit";
import { resolveCrewAppearance, type CrewAppearance } from "./appearance";
import {
  CREW_EMISSIVE_INTENSITY,
  type createVoxelCrewVisual,
} from "./voxel-crew";
import { applyMoldedFinishToMeshes } from "../molded-plastic";

type VoxelCrew = Awaited<ReturnType<typeof createVoxelCrewVisual>>;

/**
 * Prepare every crew material (body, head kit, armour, held items) for the game lights:
 * - finish: the shared molded-plastic family of each slot (cloth body suit, moulded armour and
 *   helmets, rubber grips, real metal only on metal slots; see molded-plastic.ts);
 * - cap emission: authored `crew.emit` strength 6 blooms across the face and chest in game; the cap
 *   keeps it a small accent;
 * - raise the light budget: with Babylon's default of 4, a deck with several room lights drops the
 *   ship fill and key light and late-loaded parts (head kit, armour) render near black.
 * Idempotent.
 */
export const CREW_MAX_LIGHTS = 12;
export function toneCrewEmissive(meshes: readonly AbstractMesh[]) {
  applyMoldedFinishToMeshes(meshes);
  for (const mesh of meshes) {
    const material = mesh.material;
    const list =
      material instanceof MultiMaterial ? material.subMaterials : [material];
    for (const m of list) {
      if (!(m instanceof PBRMaterial)) continue;
      if (m.emissiveIntensity > CREW_EMISSIVE_INTENSITY)
        m.emissiveIntensity = CREW_EMISSIVE_INTENSITY;
      if (m.maxSimultaneousLights < CREW_MAX_LIGHTS)
        m.maxSimultaneousLights = CREW_MAX_LIGHTS;
    }
  }
}

/**
 * Armour visuals for the equipped items: live r008 item ids through the r006 legacy mapping, and
 * wardrobe items (`wardrobe-*`) through their own part + colourway. Presentation only.
 */
export function voxelArmorLoadout(
  equipped: EquippedCharacterComponents,
): CrewArmorLoadout {
  const out = crewArmorLoadoutFromEquipment(equipped);
  for (const [slot, id] of Object.entries(equipped)) {
    const item = id ? crewWardrobeItem(id) : undefined;
    const part = item?.part ? crewArmorPart(item.part) : undefined;
    if (item && part && item.slot === slot && part.slot === slot)
      out[part.slot] = { part: part.id, colourway: item.colourway };
  }
  // Department applique occupies the visual chest only when no chest item covers it.
  const uniform = equipped.uniform
    ? crewWardrobeItem(equipped.uniform)
    : undefined;
  const insignia = uniform?.part ? crewArmorPart(uniform.part) : undefined;
  if (!out.chest && uniform?.slot === "uniform" && insignia?.slot === "chest")
    out.chest = { part: insignia.id, colourway: uniform.colourway };
  return out;
}

/**
 * Keeps a voxel crew's head kit and armour in step with the character's appearance and equipped
 * inventory. Each change loads only the parts that differ; stale async loads are discarded.
 */
export function createVoxelCrewOutfit(
  scene: Scene,
  crew: VoxelCrew,
  options: { onChange?: () => void } = {},
) {
  let disposed = false;
  let headKey = "";
  let headRevision = 0;
  let head: Awaited<ReturnType<typeof attachVoxelCrewHead>> | undefined;
  const armour = new Map<
    CrewArmorSlot,
    { key: string; revision: number; attachment?: CrewArmorAttachment }
  >();
  let pending = 0;
  const changed = () => {
    if (disposed) return;
    const regions = new Set<VoxelCrewRegion>();
    if (head) {
      regions.add("head");
      regions.add("hair");
    }
    for (const entry of armour.values())
      for (const region of entry.attachment?.meshes.length
        ? entry.attachment.hidesBodyRegions
        : [])
        regions.add(region);
    crew.setArmorCloth(
      [...armour]
        .filter(([, entry]) => entry.attachment?.meshes.length)
        .map(([slot]) => slot),
    );
    crew.setHiddenRegions(regions);
    toneCrewEmissive(crew.root.getChildMeshes());
    options.onChange?.();
  };
  const track = <T>(promise: Promise<T>) => {
    pending++;
    return promise.finally(() => {
      pending--;
    });
  };

  function apply(appearance: CrewAppearance) {
    if (disposed) return;
    const resolved = resolveCrewAppearance(appearance);
    const equipped = appearance.equippedComponents ?? {};
    // Head kit: the persisted look plus the equipped helmet / visor.
    const loadout = voxelHeadLoadoutFromAppearance({
      ...resolved,
      bodyType: resolved.bodyType,
      equippedComponents: equipped,
    });
    const key = JSON.stringify(loadout);
    if (key !== headKey) {
      headKey = key;
      const revision = ++headRevision;
      void track(attachVoxelCrewHead(scene, crew, loadout))
        .then((next) => {
          if (disposed || revision !== headRevision) {
            // A stale head kit clears the body's hidden regions when disposed;
            // restore the current head/armour hides (else gloves/hands flash back).
            next.dispose();
            changed();
            return;
          }
          head?.dispose();
          head = next;
          changed();
        })
        .catch((error) => {
          // The body's own head blank stays visible if the head kit cannot load.
          console.warn("voxel crew head kit unavailable", error);
        });
    }
    // Armour: one attachment per slot, keyed by part, colourway and body fit.
    const armourLoadout = voxelArmorLoadout(equipped);
    const variant = crew.variant;
    let removed = false;
    for (const slot of CREW_ARMOR_SLOTS) {
      const want = armourLoadout[slot];
      const wantKey = want ? `${want.part}|${want.colourway}|${variant}` : "";
      const current = armour.get(slot);
      if ((current?.key ?? "") === wantKey) continue;
      const revision = (current?.revision ?? 0) + 1;
      current?.attachment?.dispose();
      if (current?.attachment) removed = true;
      if (!want) {
        armour.delete(slot);
        continue;
      }
      const request = { key: wantKey, revision } as {
        key: string;
        revision: number;
        attachment?: CrewArmorAttachment;
      };
      armour.set(slot, request);
      const part = crewArmorPart(want.part)!;
      void track(
        attachCrewArmor(
          scene,
          { root: crew.model, joints: crew.joints },
          part,
          {
            variant,
            colourway: want.colourway,
          },
        ),
      )
        .then((attachment) => {
          const entry = armour.get(slot);
          // Identity survives remove/re-add cycles, unlike a revision counter reset by deletion.
          if (disposed || entry !== request) {
            attachment.dispose();
            return;
          }
          entry.attachment = attachment;
          changed();
        })
        .catch((error) =>
          console.warn(`voxel crew armour ${want.part} unavailable`, error),
        );
    }
    if (removed) changed();
  }

  return {
    apply,
    /** Loads still in flight (tests, first-frame readiness). */
    get pending() {
      return pending;
    },
    /** Successfully loaded armour part ids by slot (diagnostics and tests). */
    get armour() {
      return Object.fromEntries(
        [...armour]
          .filter(([, entry]) => entry.attachment?.meshes.length)
          .map(([slot, entry]) => [slot, entry.key.split("|")[0]]),
      ) as Partial<Record<CrewArmorSlot, string>>;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      head?.dispose();
      for (const entry of armour.values()) entry.attachment?.dispose();
      armour.clear();
      crew.setArmorCloth([]);
      crew.setHiddenRegions([]);
    },
  };
}
