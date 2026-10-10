import {
  characterComponent,
  characterComponentImageUrl,
  type CharacterEquipmentSlot,
} from "./character-components";

/** Game-owned equipment classification over immutable study art. All values are provisional. */
export interface StudyWearable {
  id: string;
  name: string;
  slot: CharacterEquipmentSlot;
  massKg: number;
  grid: [number, number];
  colourway: string;
  study: { id: string; regions?: string[] };
  iconUrl: string;
  /** Explicit pressure coverage, counted only in this item's equipment slot. */
  pressureCoverage?: readonly string[];
  eva?: "helmet" | "pack" | "boots";
  maglock?: boolean;
}

function wearable(
  id: string,
  name: string,
  slot: CharacterEquipmentSlot,
  part: string,
  comparable: string,
  extra: Partial<StudyWearable> = {},
): StudyWearable {
  const reference = characterComponent(comparable);
  if (!reference)
    throw new Error(`Study wearable comparable missing: ${comparable}`);
  return {
    id: `study-${id}`,
    name,
    slot,
    massKg: reference.massKg,
    grid: [reference.grid[0], reference.grid[1]],
    colourway: "arctic",
    study: { id: part },
    // Existing authored icons are labelled by the actual inventory name. New icon art is deferred.
    iconUrl: characterComponentImageUrl(comparable),
    ...extra,
  };
}

export const STUDY_RP_WEARABLES: readonly StudyWearable[] = [
  ...[
    ["goggles_blue", "Blue goggles"],
    ["goggles_up_orange", "Raised orange goggles"],
    ["goggles_teal", "Teal goggles"],
    ["nv_goggles", "Night-vision goggles"],
    ["nv_goggles_strap", "Strapped night-vision goggles"],
    ["glasses_blue", "Blue glasses"],
    ["glasses", "Rounded glasses"],
  ].map(([id, name]) =>
    wearable(id, name, "helmet", `visor.${id}`, "pilot-visor"),
  ),
  ...[
    ["balaclava", "Balaclava"],
    ["scarf_yellow", "Yellow scarf"],
    ["scarf_olive", "Olive scarf"],
    ["earpiece_medic", "Medic earpiece"],
    ["headset_blue", "Blue headset"],
    ["headset_orange", "Orange headset"],
    ["earring_gold", "Gold earring"],
  ].map(([id, name]) =>
    wearable(id, name, "helmet", `acc.${id}`, "pilot-visor"),
  ),
  wearable(
    "nurse-cap",
    "Nurse cap",
    "helmet",
    "headwear.nurse_cap",
    "captain-helmet",
  ),
];

/** Ordinary outfits use one whole authored garment, rather than separate role chest/leg meshes. */
export const STUDY_CLOTHING: readonly StudyWearable[] = [
  ...[
    ["civilian", "Civilian outfit", "captain"],
    ["civilian_f", "Civilian coat outfit", "captain"],
    ["captain", "Captain coat outfit", "captain"],
    ["engineer", "Engineer outfit", "engineer"],
    ["security", "Security coat outfit", "security"],
    ["scientist", "Scientist coat outfit", "scientist"],
    ["mechanic", "Mechanic outfit", "mechanic"],
  ].map(([id, name, role]) =>
    wearable(
      `clothing-${id}`,
      name,
      "uniform",
      `uniform.${id}`,
      `${role}-chest`,
      {
        massKg: 0.9,
        grid: [2, 3],
      },
    ),
  ),
  ...(["chest", "shoulders", "back"] as const).map((slot) =>
    wearable(
      `t0-${slot}`,
      `Civilian ${slot} layer (T0)`,
      slot,
      `armor.${slot}.t0`,
      `captain-${slot}`,
    ),
  ),
];

export const STUDY_EVA_FAMILIES = [
  "medic",
  "pilot",
  "marine",
  "salvage",
  "recon",
] as const;
export type StudyEvaFamily = (typeof STUDY_EVA_FAMILIES)[number];
const PRESSURE_SLOTS = [
  "chest",
  "legs",
  "gloves",
  "boots",
  "helmet",
  "back",
] as const;
const LABELS = {
  medic: "Medic",
  pilot: "Pilot",
  marine: "Heavy Marine",
  salvage: "Salvage Tech",
  recon: "Recon Scout",
};

/** Explicit rated variants. A role label or an open study headpiece is never a pressure rating. */
export const STUDY_EVA_WEARABLES: readonly StudyWearable[] =
  STUDY_EVA_FAMILIES.flatMap((family) => {
    const role = family === "recon" ? "scout" : family;
    const helmet = {
      medic: "headwear.medic_helmet",
      pilot: "headwear.pilot_helmet",
      marine: "armor.helmet.t3",
      salvage: "armor.helmet.t1",
      recon: "armor.helmet.t2",
    }[family];
    const gloves = {
      medic: "white",
      pilot: "flight",
      marine: "heavy",
      salvage: "work",
      recon: "tactical",
    }[family];
    const boots = {
      medic: "white",
      pilot: "flight",
      marine: "heavy",
      salvage: "work",
      recon: "combat",
    }[family];
    const parts = {
      chest: family === "marine" ? "armor.chest.t3" : `uniform.${role}`,
      legs: family === "marine" ? "armor.legs.t3" : `uniform.${role}`,
      gloves: `gloves.${gloves}`,
      boots: `boots.${boots}`,
      helmet,
      back: family === "marine" ? "armor.back.t3" : `back.${role}`,
    };
    return PRESSURE_SLOTS.map((slot) =>
      wearable(
        `eva-${family}-${slot}`,
        `${LABELS[family]} EVA-rated ${slot}`,
        slot,
        parts[slot],
        `${family}-${slot}`,
        {
          ...(slot === "chest"
            ? {
                pressureCoverage: ["torso", "arms"],
                ...(family !== "marine"
                  ? {
                      study: {
                        id: parts[slot],
                        regions: ["torso", "upperArms", "forearms"],
                      },
                    }
                  : {}),
              }
            : slot === "legs"
              ? {
                  pressureCoverage: ["legs"],
                  ...(family !== "marine"
                    ? { study: { id: parts[slot], regions: ["hips", "legs"] } }
                    : {}),
                }
              : slot === "gloves"
                ? { pressureCoverage: ["hands"] }
                : slot === "boots"
                  ? { pressureCoverage: ["feet"], eva: "boots", maglock: true }
                  : slot === "helmet"
                    ? { eva: "helmet" }
                    : { eva: "pack" }),
        },
      ),
    );
  });

export const STUDY_WEARABLES = [
  ...STUDY_RP_WEARABLES,
  ...STUDY_CLOTHING,
  ...STUDY_EVA_WEARABLES,
];
export const STUDY_EQUIPMENT_KITS: Readonly<Record<string, readonly string[]>> =
  {
    "study-rp-wearables": STUDY_RP_WEARABLES.map((w) => `wardrobe-${w.id}`),
    "study-clothing": STUDY_CLOTHING.map((w) => `wardrobe-${w.id}`),
    ...Object.fromEntries(
      STUDY_EVA_FAMILIES.map((family) => [
        `study-eva-${family}`,
        STUDY_EVA_WEARABLES.filter((w) =>
          w.id.startsWith(`study-eva-${family}-`),
        ).map((w) => `wardrobe-${w.id}`),
      ]),
    ),
  };
