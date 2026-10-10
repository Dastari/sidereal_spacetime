import type { Material } from "@babylonjs/core/Materials/material";
import { CrewMaterialRegistry } from "./crew-recolor";
import { CREW_FAMILY_TO_MOLDED } from "./crew-study-material-config";
import { resolveCrewAppearance, type CrewAppearance } from "./appearance";

/** Source look strength 6 becomes the game's 0.9, preserving per-part ratios. */
export const STUDY_EMISSIVE_SCALE = 0.9 / 6;

/** Saved controls map to study slots; vertex shades and face texture remain authored. */
export function studyCrewPalette(
  appearance: CrewAppearance,
): Record<string, string> {
  const look = resolveCrewAppearance(appearance);
  return {
    skin: look.skin,
    hair: look.hair,
    eye: look.eyes,
    suit_primary: look.suit,
    suit_secondary: look.trim,
    accent: look.insignia,
    metal: look.trim,
    dark: look.accent,
    emit: look.light,
    emit_b: look.light,
    glass: look.visor,
    visor: look.visor,
  };
}

/** Ported registry owns slot factors only; no material clones and no alpha changes. */
export function studyMaterials(
  materials: readonly Material[],
  overrides: Record<string, string> = {},
  finish: Record<string, string> = {},
) {
  const registry = new CrewMaterialRegistry();
  registry.register(materials, "part", finish);
  registry.applyFinishes({ emissiveScale: STUDY_EMISSIVE_SCALE });
  for (const entry of registry.entries)
    entry.material.metadata = {
      ...entry.material.metadata,
      studySurfaceFamily:
        CREW_FAMILY_TO_MOLDED[entry.family] ?? "plastic-colour",
    };
  registry.setPalette(overrides);
  return registry;
}
