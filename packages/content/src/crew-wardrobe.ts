import { crewArmorPart, crewArmorPreset } from "./crew-armor";
import {
  CHARACTER_COMPONENT_SETS,
  type CharacterEquipmentSlot,
} from "./character-components";
import {
  STUDY_WEARABLES,
  STUDY_EQUIPMENT_KITS,
  type StudyWearable,
} from "./crew-study-equipment";

/**
 * Wearable voxel-crew wardrobe items (r006 wardrobe, first revision). Each entry is the content side
 * of an inventory definition (`wardrobe-<id>`): ownership, slots and movement stay with the normal
 * inventory authority. The visual maps to an armour-v1 part + colourway, or (uniforms) to the body's
 * suit layer tint. Ordinary appearance grants no protection, oxygen or skill; explicit equipment ratings describe protection only.
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
  /**
   * Space-suit boots with magnetic soles (EVA milestone 2, owner 2026-09-29: "mag locks ... part of
   * all space suit boots (not shoes or clothing style boots)"). Only boots-slot items set it; the
   * maglock works only inside ships for now (wiki `Systems/EVA`).
   */
  maglock?: boolean;
  /**
   * Part of the EVA space suit (owner 2026-09-29: "you're going to need a backpack/spacesuit and
   * helmet before you can exist in the vacuum of space"). Legacy protection needs `suit`, `helmet` and
   * `pack`; modular rated coverage is additive. Neither rating blocks physical crossing.
   */
  eva?: "suit" | "helmet" | "pack" | "boots";
  /** Head-kit helmet id drawn for a helmet item (crew-heads.v1.json `helmets`). */
  helmet?: string;
  study?: StudyWearable["study"];
  pressureCoverage?: StudyWearable["pressureCoverage"];
  iconUrl?: string;
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

/**
 * The EVA space suit (proposal, provisional masses kept inside the 32 kg carry limit together with
 * a normal kit): a pressure suit (the body suit layer with a
 * harness), a sealed helmet, the EVA jetpack (its nozzles and suit IFCS are `packages/sim/src/
 * eva-suit.ts`) and mag boots. Item ids are stable: the inventory definitions are `wardrobe-<id>`.
 */
function evaSuit(): CrewWardrobeItem[] {
  const boots = crewArmorPart("armor.boots.heavy");
  const pack = crewArmorPart("armor.back.jetpack-light");
  const harness = crewArmorPart("armor.chest.flight");
  if (
    boots?.slot !== "boots" ||
    pack?.slot !== "back" ||
    harness?.slot !== "chest"
  )
    throw new Error("wardrobe: EVA suit armour parts are missing");
  return [
    {
      id: "suit-body",
      name: "EVA pressure suit",
      slot: "uniform",
      massKg: 4,
      grid: [2, 3],
      part: harness.id,
      colourway: "arctic",
      suit: { primary: "#e8e6f0", secondary: "#f08c1e", accent: "#4f8cff" },
      eva: "suit",
    },
    {
      id: "suit-helmet",
      name: "EVA helmet",
      slot: "helmet",
      massKg: 1.5,
      grid: [2, 2],
      colourway: "arctic",
      helmet: "explorer",
      eva: "helmet",
    },
    {
      id: "suit-pack",
      name: "EVA jetpack",
      slot: "back",
      massKg: 4,
      grid: [pack.grid[0], pack.grid[1]],
      part: pack.id,
      colourway: "arctic",
      eva: "pack",
    },
    {
      id: "suit-boots",
      name: "Space-suit mag boots",
      slot: "boots",
      massKg: boots.massKg,
      grid: [boots.grid[0], boots.grid[1]],
      part: boots.id,
      colourway: "arctic",
      maglock: true,
      eva: "boots",
    },
  ];
}

export const LEGACY_CREW_WARDROBE: readonly CrewWardrobeItem[] = [
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
  ...evaSuit(),
];
export const CREW_WARDROBE: readonly CrewWardrobeItem[] = [
  ...LEGACY_CREW_WARDROBE,
  ...STUDY_WEARABLES,
];

export const WARDROBE_DEFINITION_PREFIX = "wardrobe-";
export function crewWardrobeItem(id: string): CrewWardrobeItem | undefined {
  const key = id.startsWith(WARDROBE_DEFINITION_PREFIX)
    ? id.slice(WARDROBE_DEFINITION_PREFIX.length)
    : id;
  return CREW_WARDROBE.find((item) => item.id === key);
}

/**
 * Maglock rule input: whether an equipped item (wardrobe id or inventory definition id) is a pair
 * of space-suit boots. Clothing boots and shoes are not. Explicit EVA-rated armour boots are.
 */
export function isMaglockBoots(id: string | null | undefined): boolean {
  const item = id ? crewWardrobeItem(id) : undefined;
  return !!item?.maglock && item.slot === "boots";
}

/** Protection requirements, independent of movement. Legacy integrated suits retain optional mag boots. */
export const EVA_SUIT_REQUIRED = ["suit", "helmet", "pack"] as const;
export type EvaSuitPart = (typeof EVA_SUIT_REQUIRED)[number];
/**
 * The suit rule: which required EVA suit parts are missing from the equipped items (wardrobe or
 * inventory definition ids, one per slot). Each part counts only in its own slot.
 */
export function evaSuitCheck(
  equipped: Iterable<{ slot: string; id: string }>,
): { ready: boolean; missing: EvaSuitPart[] } {
  const have = new Set<string>();
  const coverage = new Set<string>();
  for (const e of equipped) {
    const item = crewWardrobeItem(e.id);
    if (item?.eva && item.slot === e.slot) have.add(item.eva);
    if (item?.slot === e.slot)
      for (const region of item.pressureCoverage ?? []) coverage.add(region);
  }
  if (
    ["torso", "arms", "legs", "hands", "feet"].every((region) =>
      coverage.has(region),
    )
  )
    have.add("suit");
  const missing = EVA_SUIT_REQUIRED.filter((p) => !have.has(p));
  return { ready: missing.length === 0, missing };
}
export const EVA_SUIT_NAMES: Readonly<Record<EvaSuitPart, string>> = {
  suit: "pressure suit",
  helmet: "helmet",
  pack: "EVA jetpack",
};
/** Informational protection status, never a movement or door-operation refusal. */
export function evaSuitMessage(missing: readonly EvaSuitPart[]): string {
  const names = missing.map((m) => EVA_SUIT_NAMES[m]);
  const list =
    names.length <= 1
      ? names.join("")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Protection incomplete: missing ${list}`;
}

/**
 * Operator delivery kits (inventory definition ids), each sized for one 14x14 storage container:
 * - `uniforms-and-tiers`: the four department uniforms and the tier 1-2 pieces (new items);
 * - `eva-suit`: the EVA space suit (pressure suit, helmet, jetpack, mag boots), needed outside;
 * - `role-sets`: the medic, engineer and pilot sets. These are the existing r008 item definitions,
 *   which already render through the r006 role mapping; helmets and visors use the head kit.
 */
export const CREW_WARDROBE_KITS: Readonly<Record<string, readonly string[]>> = {
  "uniforms-and-tiers": LEGACY_CREW_WARDROBE.filter((item) => !item.eva).map(
    (item) => `${WARDROBE_DEFINITION_PREFIX}${item.id}`,
  ),
  /** Legacy protection kit; never a condition for crossing into space. */
  "eva-suit": LEGACY_CREW_WARDROBE.filter((item) => item.eva).map(
    (item) => `${WARDROBE_DEFINITION_PREFIX}${item.id}`,
  ),
  "role-sets": ["medic", "engineer", "pilot"].flatMap((set) =>
    Object.values(CHARACTER_COMPONENT_SETS[set] ?? {}).map(
      (id) => `crew-${id}`,
    ),
  ),
  ...STUDY_EQUIPMENT_KITS,
};
/** Everything the starter delivery grants (both kits). */
export const CREW_WARDROBE_STARTER_DELIVERY: readonly string[] = [
  ...CREW_WARDROBE_KITS["uniforms-and-tiers"],
  ...CREW_WARDROBE_KITS["role-sets"],
];

/** Inventory icon (rendered headless from the armour-v1 GLBs / the body suit layer). */
export function crewWardrobeIconUrl(id: string): string {
  const override = crewWardrobeItem(id)?.iconUrl;
  if (override) return override;
  return `${CREW_WARDROBE_ASSET_BASE}/icons/${id}.png?revision=${CREW_WARDROBE_REVISION}`;
}
