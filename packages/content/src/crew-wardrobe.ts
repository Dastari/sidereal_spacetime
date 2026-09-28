import { crewArmorPart, crewArmorPreset } from "./crew-armor";
import {
  CHARACTER_COMPONENT_SETS,
  type CharacterEquipmentSlot,
} from "./character-components";

/**
 * Wearable voxel-crew wardrobe items (r006 wardrobe, first revision). Each entry is the content side
 * of an inventory definition (`wardrobe-<id>`): ownership, slots and movement stay with the normal
 * inventory authority. The visual maps to an armour-v1 part + colourway, or (uniforms) to the body's
 * suit layer tint. Appearance grants no protection, oxygen or skill.
 */
export type WardrobeSlot = CharacterEquipmentSlot;
export const CREW_WARDROBE_REVISION = "r001";
export const CREW_WARDROBE_ASSET_BASE = `/assets/crew/wardrobe/${CREW_WARDROBE_REVISION}`;
export interface CrewWardrobeItem {
  /** Stable item id; the inventory definition id is `wardrobe-<id>`. Never rename. */
  id: string;
  name: string;
  slot: WardrobeSlot;
  massKg: number;
  grid: [number, number];
  /** Armour part id; a uniform uses a chest applique beneath equipped chest armour. */
  part?: string;
  colourway: string;
  /** Suit-layer tint of a uniform (undersuit) plus its department accent. */
  suit?: { primary: string; secondary: string; accent: string };
}

/** The four department uniforms of the r006 wardrobe: role undersuit + department accent. */
const UNIFORMS: readonly [string, string, string, string][] = [
  ["command", "Command uniform", "role.captain", "captain"],
  ["medical", "Medical uniform", "role.medic", "medic"],
  ["engineering", "Engineering uniform", "role.engineer", "engineer"],
  ["security", "Security uniform", "role.security", "security"],
];
/** Tier sets as on the r006 tier chart (T1 light in amber, T2 standard in cobalt). */
const TIERS: readonly [1 | 2, string, Record<string, string>][] = [
  [
    1,
    "amber",
    {
      chest: "armor.chest.harness",
      shoulders: "armor.shoulders.light",
      gloves: "armor.gloves.light",
      belt: "armor.belt.utility",
      legs: "armor.legs.light",
      boots: "armor.boots.light",
      back: "armor.back.backpack-t1",
    },
  ],
  [
    2,
    "cobalt",
    {
      chest: "armor.chest.plate",
      shoulders: "armor.shoulders.standard",
      gloves: "armor.gloves.standard",
      belt: "armor.belt.standard",
      legs: "armor.legs.standard",
      boots: "armor.boots.standard",
      back: "armor.back.backpack-t2",
    },
  ],
];

function uniform([id, name, preset, colourway]: (typeof UNIFORMS)[number]) {
  const p = crewArmorPreset(preset);
  if (!p?.undersuit?.suit_primary || !p.undersuit.suit_secondary)
    throw new Error(`wardrobe: preset ${preset} has no undersuit`);
  return {
    id: `uniform-${id}`,
    name,
    slot: "uniform" as const,
    massKg: 0.9,
    grid: [2, 3] as [number, number],
    colourway,
    part: `armor.chest.uniform-${id}`,
    suit: {
      primary: p.undersuit.suit_primary,
      secondary: p.undersuit.suit_secondary,
      accent: accentFor(colourway),
    },
  };
}
// Department accents (from the matching colourways) keep the dark undersuits readable.
const ACCENTS: Readonly<Record<string, string>> = {
  captain: "#f3bb3c",
  medic: "#e0253e",
  engineer: "#f08c1e",
  security: "#4f8cff",
};
function accentFor(colourway: string) {
  return ACCENTS[colourway] ?? "#f3bb3c";
}

export const CREW_WARDROBE: readonly CrewWardrobeItem[] = [
  ...UNIFORMS.map(uniform),
  ...TIERS.flatMap(([tier, colourway, parts]) =>
    Object.entries(parts).map(([slot, partId]) => {
      const part = crewArmorPart(partId);
      if (!part || part.slot !== slot)
        throw new Error(`wardrobe: bad part ${partId} for ${slot}`);
      return {
        id: `t${tier}-${slot}`,
        name: `${part.name} (T${tier})`,
        slot: slot as WardrobeSlot,
        massKg: part.massKg,
        grid: [part.grid[0], part.grid[1]] as [number, number],
        part: partId,
        colourway,
      };
    }),
  ),
];

export const WARDROBE_DEFINITION_PREFIX = "wardrobe-";
export function crewWardrobeItem(id: string): CrewWardrobeItem | undefined {
  const key = id.startsWith(WARDROBE_DEFINITION_PREFIX)
    ? id.slice(WARDROBE_DEFINITION_PREFIX.length)
    : id;
  return CREW_WARDROBE.find((item) => item.id === key);
}

/**
 * Operator delivery kits (inventory definition ids), each sized for one 14x14 storage container:
 * - `uniforms-and-tiers`: the four department uniforms and the tier 1-2 pieces (new items);
 * - `role-sets`: the medic, engineer and pilot sets. These are the existing r008 item definitions,
 *   which already render through the r006 role mapping; helmets and visors use the head kit.
 */
export const CREW_WARDROBE_KITS: Readonly<Record<string, readonly string[]>> = {
  "uniforms-and-tiers": CREW_WARDROBE.map(
    (item) => `${WARDROBE_DEFINITION_PREFIX}${item.id}`,
  ),
  "role-sets": ["medic", "engineer", "pilot"].flatMap((set) =>
    Object.values(CHARACTER_COMPONENT_SETS[set] ?? {}).map(
      (id) => `crew-${id}`,
    ),
  ),
};
/** Everything the starter delivery grants (both kits). */
export const CREW_WARDROBE_STARTER_DELIVERY: readonly string[] = [
  ...CREW_WARDROBE_KITS["uniforms-and-tiers"],
  ...CREW_WARDROBE_KITS["role-sets"],
];

/** Inventory icon (rendered headless from the armour-v1 GLBs / the body suit layer). */
export function crewWardrobeIconUrl(id: string): string {
  return `${CREW_WARDROBE_ASSET_BASE}/icons/${id}.png?revision=${CREW_WARDROBE_REVISION}`;
}
