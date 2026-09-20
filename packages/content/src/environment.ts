/** Authored presentation vistas. These are distant visual studies, not discoverable world entities. */
export type CelestialKind = "ocean" | "gas" | "rock" | "star";
export interface CelestialAppearance {
  id: string;
  kind: CelestialKind;
  position: [number, number, number];
  radius: number;
  seed: number;
  primary: string;
  secondary: string;
  atmosphere: string;
  rings?: boolean;
}
export interface SpaceVista {
  id: string;
  name: string;
  description: string;
  nebulaTint: [number, number, number];
  nebulaStrength: number;
  dust: number;
  seed: number;
  nebulaAsset?: string;
  bodies: readonly CelestialAppearance[];
}
export const SPACE_VISTAS: readonly SpaceVista[] = [
  {
    id: "orion-veil",
    name: "Orion Veil",
    description:
      "A violet spiral galaxy, blue nebular dust and a jewel-toned ringed world.",
    nebulaAsset: "orion-veil-v1.png",
    nebulaTint: [1, 1, 1],
    nebulaStrength: 1.5,
    dust: 0.55,
    seed: 117,
    bodies: [
      {
        id: "amethyst",
        kind: "gas",
        position: [23, -85, 17],
        radius: 5.1,
        seed: 38,
        primary: "#7567c9",
        secondary: "#283e78",
        atmosphere: "#796cf1",
        rings: true,
      },
      {
        id: "cold-star",
        kind: "star",
        position: [-28, -95, -18],
        radius: 1.1,
        seed: 14,
        primary: "#f4ecff",
        secondary: "#a6a5dd",
        atmosphere: "#a797e0",
      },
    ],
  },
  {
    id: "helion-reach",
    name: "Helion Reach",
    description:
      "Cold oceans, pale ring systems and the distant galactic veil.",
    nebulaTint: [0.78, 1, 1.08],
    nebulaStrength: 0.84,
    dust: 0.65,
    seed: 17,
    bodies: [
      {
        id: "helion",
        kind: "star",
        position: [-26, -95, -16],
        radius: 3.5,
        seed: 23,
        primary: "#fff4d6",
        secondary: "#e59c67",
        atmosphere: "#b49bc0",
      },
      {
        id: "pelagic",
        kind: "ocean",
        position: [-19, -58, 11],
        radius: 5.3,
        seed: 17,
        primary: "#122f46",
        secondary: "#4d6256",
        atmosphere: "#5ea3bc",
      },
      {
        id: "pale-giant",
        kind: "gas",
        position: [22, -85, 4],
        radius: 6.1,
        seed: 42,
        primary: "#d5c6ac",
        secondary: "#7a716b",
        atmosphere: "#8aafba",
        rings: true,
      },
    ],
  },
  {
    id: "veil-expanse",
    name: "Veil Expanse",
    description: "Blue mineral worlds below a cold, filamented nebula.",
    nebulaTint: [0.55, 1.08, 1.28],
    nebulaStrength: 1.12,
    dust: 0.38,
    seed: 41,
    bodies: [
      {
        id: "veil-sun",
        kind: "star",
        position: [24, -95, -15],
        radius: 2.8,
        seed: 11,
        primary: "#edf7ff",
        secondary: "#8bbbd5",
        atmosphere: "#74a5c4",
      },
      {
        id: "cobalt",
        kind: "ocean",
        position: [-23, -65, 6],
        radius: 6.9,
        seed: 31,
        primary: "#142d41",
        secondary: "#5b767d",
        atmosphere: "#65bad5",
      },
      {
        id: "companion",
        kind: "rock",
        position: [20, -62, 12],
        radius: 3.2,
        seed: 68,
        primary: "#9a9998",
        secondary: "#45464c",
        atmosphere: "#31404d",
      },
    ],
  },
  {
    id: "ash-belt",
    name: "Ash Belt",
    description: "Weathered stone, rust-colored dust and a quiet ivory sun.",
    nebulaTint: [1.05, 0.66, 0.48],
    nebulaStrength: 0.66,
    dust: 1,
    seed: 89,
    bodies: [
      {
        id: "ash-sun",
        kind: "star",
        position: [-23, -95, -17],
        radius: 4.4,
        seed: 66,
        primary: "#fff0cd",
        secondary: "#c87947",
        atmosphere: "#af7451",
      },
      {
        id: "ferric",
        kind: "rock",
        position: [21, -62, 6],
        radius: 6.3,
        seed: 89,
        primary: "#9c7661",
        secondary: "#403d3e",
        atmosphere: "#94795f",
      },
      {
        id: "ash-moon",
        kind: "rock",
        position: [-20, -65, 14],
        radius: 3.8,
        seed: 104,
        primary: "#a6aaa9",
        secondary: "#535b61",
        atmosphere: "#4d6572",
      },
    ],
  },
  {
    id: "deep-space",
    name: "Deep space",
    description: "Open space and distant stars, without nebulae.",
    nebulaTint: [0, 0, 0],
    nebulaStrength: 0,
    dust: 0,
    seed: 17,
    bodies: [],
  },
];
export const DEFAULT_SPACE_VISTA = "deep-space";
export function spaceVista(id: string): SpaceVista {
  return (
    SPACE_VISTAS.find((v) => v.id === id) ??
    SPACE_VISTAS.find((v) => v.id === DEFAULT_SPACE_VISTA)!
  );
}

/** Versioned local art recipe. This carries no position, ownership or authority. */
export const PLANET_STYLES = [
  "temperate",
  "ocean",
  "desert",
  "rock",
  "ice",
  "volcanic",
  "toxic",
  "gas",
  "crystal",
  "moon",
] as const;
export type PlanetStyle = (typeof PLANET_STYLES)[number];
export interface PlanetEffects {
  vegetation: number;
  volcanicCoverage: number;
  crystalCoverage: number;
  smoke: number;
  atmosphere: number;
}
export interface PlanetRecipe {
  version: 1;
  seed: number;
  style: PlanetStyle;
  resolution: number;
  terrain: number;
  mountains: number;
  seaLevel: number;
  cloudCoverage: number;
  cloudSpeed: number;
  emission: number;
  rings: boolean;
  palette: string[];
  effects?: PlanetEffects;
}
export const PLANET_PALETTES: Record<PlanetStyle, readonly string[]> = {
  temperate: [
    "12499b",
    "1469c4",
    "258ed5",
    "46bfd0",
    "d4c797",
    "66b82d",
    "237d28",
    "155721",
    "e4f4ff",
  ],
  ocean: [
    "083a8e",
    "105bc0",
    "258ed5",
    "46bfd0",
    "e0d7a7",
    "66b82d",
    "237d28",
    "155721",
    "e4f4ff",
  ],
  desert: [
    "623748",
    "8f4950",
    "b86348",
    "ce824f",
    "e99f64",
    "efbd83",
    "b96d51",
    "864447",
    "ffe0a1",
  ],
  rock: [
    "443947",
    "625063",
    "887586",
    "ab94a1",
    "b49b8a",
    "d0b69b",
    "70576a",
    "ecd3b6",
    "66586e",
  ],
  moon: [
    "494253",
    "696274",
    "8a8597",
    "afaabc",
    "bbb4c3",
    "cdc6d3",
    "686272",
    "e3dce6",
    "625b70",
  ],
  ice: [
    "164589",
    "266eb5",
    "368dcc",
    "61b3df",
    "90c9e6",
    "c5e5ee",
    "e4f2f5",
    "b2d4e9",
    "eff8ff",
  ],
  volcanic: [
    "211c31",
    "362c40",
    "503744",
    "694b52",
    "de5926",
    "ff8b28",
    "ffbd49",
    "443445",
    "796069",
  ],
  toxic: [
    "273c34",
    "385542",
    "58753d",
    "7ca440",
    "a0c945",
    "c6e45c",
    "667945",
    "314847",
    "b5d963",
  ],
  gas: [
    "302477",
    "49359d",
    "6855c3",
    "9c75de",
    "d798e4",
    "c74bc3",
    "7145b5",
    "e3b4ed",
    "54439d",
  ],
  crystal: [
    "29203f",
    "49315f",
    "735880",
    "92769e",
    "af9cb9",
    "cc42ee",
    "f395ff",
    "4e3b67",
    "ffceff",
  ],
};
export function planetRecipe(
  style: PlanetStyle = "temperate",
  seed = 17,
): PlanetRecipe {
  return {
    version: 1,
    seed,
    style,
    resolution: style === "gas" ? 52 : 96,
    terrain: 0.65,
    mountains: style === "crystal" ? 0.85 : 0.55,
    seaLevel: style === "ocean" ? 0.55 : style === "temperate" ? 0.515 : 0.475,
    cloudCoverage: ["temperate", "ocean"].includes(style)
      ? 0.42
      : style === "toxic"
        ? 0.55
        : 0,
    cloudSpeed: 0.006,
    emission:
      style === "crystal"
        ? 1.4
        : style === "volcanic"
          ? 2.4
          : style === "toxic"
            ? 0.3
            : 0,
    rings: style === "gas",
    palette: [...PLANET_PALETTES[style]],
  };
}
export function validatePlanetRecipe(value: PlanetRecipe): PlanetRecipe {
  if (value.version !== 1 || !PLANET_STYLES.includes(value.style))
    throw new Error("Unsupported planet recipe");
  if (
    !Number.isInteger(value.seed) ||
    value.seed < 0 ||
    value.seed > 2147483647
  )
    throw new RangeError("Seed must be an integer from 0 to 2147483647");
  if (
    !Number.isInteger(value.resolution) ||
    value.resolution < 12 ||
    value.resolution > 96
  )
    throw new RangeError("Planet resolution must be 12..96");
  for (const key of [
    "terrain",
    "mountains",
    "seaLevel",
    "cloudCoverage",
  ] as const)
    if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1)
      throw new RangeError(`${key} must be 0..1`);
  if (
    !Number.isFinite(value.cloudSpeed) ||
    value.cloudSpeed < 0 ||
    value.cloudSpeed > 0.1
  )
    throw new RangeError("Cloud speed must be 0..0.1");
  if (
    !Number.isFinite(value.emission) ||
    value.emission < 0 ||
    value.emission > 4
  )
    throw new RangeError("Emission must be 0..4");
  if (
    typeof value.rings !== "boolean" ||
    value.palette.length !== 9 ||
    value.palette.some((c) => !/^[\da-f]{6}$/i.test(c))
  )
    throw new Error("Recipe requires nine RGB hex colors and a rings flag");
  if (value.effects)
    for (const [key, parameter] of Object.entries(value.effects)) {
      if (
        ![
          "vegetation",
          "volcanicCoverage",
          "crystalCoverage",
          "smoke",
          "atmosphere",
        ].includes(key) ||
        !Number.isFinite(parameter) ||
        parameter < 0 ||
        parameter > 1
      )
        throw new RangeError(`Invalid planet effect ${key}`);
    }
  return {
    ...value,
    palette: [...value.palette],
    effects: value.effects
      ? { ...defaultPlanetEffects(value.style), ...value.effects }
      : undefined,
  };
}

export function defaultPlanetEffects(style: PlanetStyle): PlanetEffects {
  return {
    vegetation: style === "temperate" ? 0.7 : style === "ocean" ? 0.45 : 0,
    volcanicCoverage: style === "volcanic" ? 0.55 : 0,
    crystalCoverage: style === "crystal" ? 0.5 : 0,
    smoke: style === "volcanic" ? 0.14 : style === "toxic" ? 0.25 : 0,
    atmosphere: ["moon", "rock"].includes(style) ? 0.1 : 0.65,
  };
}
export function planetEffects(recipe: PlanetRecipe): PlanetEffects {
  return { ...defaultPlanetEffects(recipe.style), ...recipe.effects };
}

/** Server-authored appearance keys select validated presentation recipes.
 * The optional explicit recipe is used by local art drafts or trusted callers.
 */
export function planetRecipeForAppearance(
  appearance: string,
  seed: number,
  explicit?: PlanetRecipe,
): PlanetRecipe {
  if (explicit) return validatePlanetRecipe(explicit);
  const vistaKind =
    SPACE_VISTAS.flatMap((v) => v.bodies).find((b) => b.id === appearance)
      ?.kind ?? SPACE_VISTAS[0].bodies[0].kind;
  const style: PlanetStyle =
    appearance === "pelagic" || appearance === "temperate-volcanic"
      ? "temperate"
      : appearance === "companion"
        ? "moon"
        : (PLANET_STYLES.find((s) => appearance.includes(s)) ??
          (vistaKind === "star" ? "rock" : vistaKind));
  const recipe = planetRecipe(style, seed);
  if (appearance === "temperate-volcanic") {
    recipe.emission = 2;
    recipe.effects = {
      ...planetEffects(recipe),
      volcanicCoverage: 0.15,
      smoke: 0.12,
    };
  }
  return validatePlanetRecipe(recipe);
}
