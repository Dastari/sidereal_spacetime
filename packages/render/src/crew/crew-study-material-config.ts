// Material contract ported from study 8f26c307; provisional, not owner-approved.
/** crew.<slot> material slots (cr.mats.SLOTS): 11 live slots + visor and emit_b. */
export const CREW_SLOTS = [
  "skin",
  "hair",
  "eye",
  "suit_primary",
  "suit_secondary",
  "accent",
  "metal",
  "dark",
  "emit",
  "glass",
  "face",
  "visor",
  "emit_b",
] as const;
export type CrewSlot = (typeof CREW_SLOTS)[number];

export interface CrewFinish {
  rough: number;
  metal: number;
  coat: number;
}

/** cr.mats.FAMILIES (roughness / metallic / clear coat), the molded-plastic.ts families. */
export const CREW_FAMILIES: Readonly<Record<string, CrewFinish>> = {
  plastic: { rough: 0.32, metal: 0.0, coat: 0.08 },
  plastic_dark: { rough: 0.38, metal: 0.0, coat: 0.08 },
  plastic_colour: { rough: 0.27, metal: 0.0, coat: 0.08 },
  cloth: { rough: 0.55, metal: 0.0, coat: 0.0 },
  skin: { rough: 0.45, metal: 0.0, coat: 0.04 },
  hair: { rough: 0.4, metal: 0.0, coat: 0.06 },
  metal: { rough: 0.34, metal: 0.85, coat: 0.0 },
  rubber: { rough: 0.65, metal: 0.0, coat: 0.0 },
  glass: { rough: 0.05, metal: 0.0, coat: 0.0 },
  visor: { rough: 0.08, metal: 0.0, coat: 1.0 },
  emissive: { rough: 0.4, metal: 0.0, coat: 0.0 },
  face: { rough: 0.45, metal: 0.0, coat: 0.04 },
};

/** cr.mats.DEFAULT_FAMILY; parts override per slot through their catalog `families`. */
export const CREW_DEFAULT_FAMILY: Readonly<Record<CrewSlot, string>> = {
  skin: "skin",
  hair: "hair",
  eye: "plastic",
  suit_primary: "cloth",
  suit_secondary: "cloth",
  accent: "plastic_colour",
  metal: "metal",
  dark: "rubber",
  emit: "emissive",
  glass: "glass",
  face: "face",
  visor: "visor",
  emit_b: "emissive",
};

/**
 * Study family -> live molded-plastic.ts SurfaceFamily, so the game can hand every crew material to its
 * existing applySurfaceFinish (which owns IOR 1.46, specular, studio environment and grading).
 */
export const CREW_FAMILY_TO_MOLDED: Readonly<Record<string, string>> = {
  plastic: "plastic-light",
  plastic_dark: "plastic-dark",
  plastic_colour: "plastic-colour",
  cloth: "fabric",
  skin: "skin",
  hair: "plastic-dark",
  metal: "metal",
  rubber: "rubber",
  glass: "glass",
  visor: "glass",
  emissive: "emissive",
  face: "skin",
};

/** cr.mats offline glow reference; the live runtime uses exported strength × 0.9/6. */
export const CREW_EMISSIVE_STRENGTH: Readonly<Record<string, number>> = {
  emit: 6.0,
  emit_b: 6.0,
};
