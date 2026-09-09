import { CHARACTER_HAIR_STYLES } from "./character-components";
import looks from "./crew-looks.json";
/** Persisted cosmetic choices. Hand/back equipment comes from inventory only. */
export const CHARACTER_APPEARANCE_ENUMS = {
  outfit: [...Object.keys(looks), "crew", "explorer"],
  bodyStyle: ["jacket", "flight-suit", "uniform", "lab-coat"],
  armor: [
    "none",
    "utility",
    "heavy",
    "expedition",
    "officer",
    "medical",
    "pilot",
    "salvage",
    "recon",
    "scientist",
    "mechanic",
  ],
  bodyType: ["male", "female"],
  hairStyle: CHARACTER_HAIR_STYLES,
  helmet: [
    "none",
    "open",
    "closed",
    "engineer",
    "marine",
    "explorer",
    "captain",
    "security",
    "medic",
    "pilot",
    "salvage",
    "recon",
    "mechanic",
  ],
  backpackStyle: ["utility", "oxygen", "field"],
} as const;
export const CHARACTER_APPEARANCE_COLORS = [
  "suit",
  "accent",
  "trim",
  "insignia",
  "visor",
  "light",
  "skin",
  "hair",
] as const;
