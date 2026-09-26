/**
 * Prefab ship themes (docs/shipyard_player_builder_design.md §12.2): a theme is only a
 * slot -> material table over the nine kit material slots. Geometry never changes per theme.
 * Colours are linear RGB. Federation, Riftjack and Aurelian come from the r004-r008
 * prototype; Industrial and Crystalline are new proposals. None is approved art.
 */
import type { ShipKitSlot } from "./ship-kit";
import type { EmblemId, ShipThemeId } from "./ship-prefab";

export interface ShipSlotMaterial {
  colour: [number, number, number];
  roughness: number;
  metallic: number;
  /** Tiling detail-bump strength (0 = none). */
  bump: number;
  /** Emissive intensity multiplier (emit slots and glass). */
  emissive?: number;
  /** Glass transparency. */
  alpha?: number;
}

export interface ShipTheme {
  id: ShipThemeId;
  label: string;
  slots: Record<ShipKitSlot, ShipSlotMaterial>;
  /** 0..1 noise-masked grime/rust amount and its colour. */
  wear: number;
  wearColour: [number, number, number];
  /** Decal ink on dark and on light plates. */
  inkOnDark: [number, number, number];
  inkOnLight: [number, number, number];
  defaultEmblem: EmblemId;
  /** Engine plume colour (presentation only). */
  plume: [number, number, number];
}

const PBR: Record<"primary" | "secondary" | "accent" | "trim" | "metal" | "dark", [number, number, number]> = {
  // roughness, metallic, bump (prototype SLOT_PBR)
  primary: [0.48, 0.1, 0.35],
  secondary: [0.42, 0.2, 0.3],
  accent: [0.4, 0.1, 0.35],
  trim: [0.4, 0.45, 0.3],
  metal: [0.3, 0.85, 0.12],
  dark: [0.8, 0.0, 0.0],
};

function theme(
  id: ShipThemeId,
  label: string,
  c: {
    primary: [number, number, number];
    secondary: [number, number, number];
    accent: [number, number, number];
    trim: [number, number, number];
    metal: [number, number, number];
    dark: [number, number, number];
    emitA: [number, number, number];
    emitAStrength: number;
    emitB: [number, number, number];
    emitBStrength: number;
    glass: [number, number, number];
  },
  rest: Omit<ShipTheme, "id" | "label" | "slots">,
): ShipTheme {
  const solid = (slot: keyof typeof PBR, colour: [number, number, number]): ShipSlotMaterial => ({
    colour,
    roughness: PBR[slot][0],
    metallic: PBR[slot][1],
    bump: PBR[slot][2],
  });
  return {
    id,
    label,
    slots: {
      primary: solid("primary", c.primary),
      secondary: solid("secondary", c.secondary),
      accent: solid("accent", c.accent),
      trim: solid("trim", c.trim),
      metal: solid("metal", c.metal),
      dark: solid("dark", c.dark),
      emit_a: { colour: c.emitA, roughness: 0.4, metallic: 0, bump: 0, emissive: c.emitAStrength },
      emit_b: { colour: c.emitB, roughness: 0.4, metallic: 0, bump: 0, emissive: c.emitBStrength },
      glass: { colour: c.glass, roughness: 0.04, metallic: 0, bump: 0, emissive: 0.9, alpha: 0.35 },
    },
    ...rest,
  };
}

export const SHIP_THEMES: Record<ShipThemeId, ShipTheme> = {
  federation: theme(
    "federation",
    "Federation (Orion Crest)",
    {
      // Reference palette (VERIFY rubric, measured from 3d-rpg-after): lavender-tinted warm grey
      // #c8bcd8/#a78db6, charcoal navy #343652/#16182a, crimson #95233c, cyan #3fb8ff, amber #ffb14c.
      primary: [0.55, 0.49, 0.64], secondary: [0.034, 0.037, 0.085], accent: [0.3, 0.017, 0.045], trim: [0.1, 0.075, 0.16],
      metal: [0.38, 0.36, 0.46], dark: [0.008, 0.009, 0.024], emitA: [0.05, 0.48, 1.0], emitAStrength: 8, emitB: [1.0, 0.44, 0.07], emitBStrength: 7,
      glass: [0.3, 0.65, 1.0],
    },
    { wear: 0, wearColour: [0.05, 0.045, 0.04], inkOnDark: [0.85, 0.84, 0.8], inkOnLight: [0.05, 0.05, 0.08], defaultEmblem: "planet", plume: [0.35, 0.7, 1.0] },
  ),
  riftjack: theme(
    "riftjack",
    "Riftjack (pirate)",
    {
      primary: [0.24, 0.21, 0.19], secondary: [0.025, 0.022, 0.022], accent: [0.4, 0.025, 0.02], trim: [0.7, 0.45, 0.02],
      metal: [0.25, 0.23, 0.22], dark: [0.006, 0.005, 0.005], emitA: [1.0, 0.28, 0.04], emitAStrength: 8, emitB: [1.0, 0.05, 0.03], emitBStrength: 7,
      glass: [0.9, 0.45, 0.2],
    },
    { wear: 0.35, wearColour: [0.11, 0.045, 0.018], inkOnDark: [0.8, 0.78, 0.7], inkOnLight: [0.8, 0.78, 0.7], defaultEmblem: "skull", plume: [1.0, 0.45, 0.15] },
  ),
  aurelian: theme(
    "aurelian",
    "Aurelian Synod (alien)",
    {
      primary: [0.58, 0.52, 0.68], secondary: [0.05, 0.025, 0.1], accent: [0.7, 0.5, 0.12], trim: [0.16, 0.07, 0.26],
      metal: [0.55, 0.48, 0.62], dark: [0.01, 0.004, 0.02], emitA: [0.85, 0.15, 1.0], emitAStrength: 9, emitB: [0.15, 0.85, 1.0], emitBStrength: 7,
      glass: [0.6, 0.35, 1.0],
    },
    { wear: 0, wearColour: [0.1, 0.1, 0.1], inkOnDark: [0.9, 0.8, 1.0], inkOnLight: [0.2, 0.08, 0.3], defaultEmblem: "crystal", plume: [0.85, 0.3, 1.0] },
  ),
  industrial: theme(
    "industrial",
    "Frontier Industrial (mining)",
    {
      primary: [0.55, 0.36, 0.05], secondary: [0.07, 0.07, 0.075], accent: [0.35, 0.36, 0.38], trim: [0.02, 0.02, 0.022],
      metal: [0.42, 0.42, 0.44], dark: [0.008, 0.008, 0.008], emitA: [1.0, 0.62, 0.1], emitAStrength: 7, emitB: [0.2, 1.0, 0.4], emitBStrength: 6,
      glass: [0.55, 0.75, 0.85],
    },
    { wear: 0.2, wearColour: [0.09, 0.07, 0.05], inkOnDark: [0.95, 0.75, 0.1], inkOnLight: [0.03, 0.03, 0.03], defaultEmblem: "gear", plume: [1.0, 0.7, 0.3] },
  ),
  crystalline: theme(
    "crystalline",
    "Vitreous Choir (crystalline alien)",
    {
      primary: [0.72, 0.82, 0.86], secondary: [0.02, 0.09, 0.12], accent: [0.05, 0.55, 0.62], trim: [0.12, 0.28, 0.34],
      metal: [0.6, 0.7, 0.75], dark: [0.004, 0.012, 0.018], emitA: [0.1, 1.0, 0.85], emitAStrength: 9, emitB: [0.6, 0.3, 1.0], emitBStrength: 7,
      glass: [0.4, 1.0, 0.95],
    },
    { wear: 0, wearColour: [0.1, 0.1, 0.1], inkOnDark: [0.75, 1.0, 0.95], inkOnLight: [0.02, 0.1, 0.12], defaultEmblem: "crystal", plume: [0.3, 1.0, 0.9] },
  ),
};

export const shipTheme = (id: ShipThemeId): ShipTheme => SHIP_THEMES[id];
