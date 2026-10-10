import {
  CHARACTER_COMPONENT_SETS,
  type CharacterBodyType,
  type CharacterHairStyle,
  type EquippedCharacterComponents,
} from "@sidereal/content/character-components";
import {
  CHARACTER_FACE_DEFAULTS,
  CHARACTER_PERSONAL_APPEARANCE_KEYS,
  type CharacterExpression,
  type CharacterFaceDetail,
  type CharacterFacialHair,
  type CharacterFaceAge,
  type CharacterFaceVariant,
  CHARACTER_FACE_VARIANTS,
} from "@sidereal/content/appearance";
import looks from "../../../content/src/crew-looks.json";
export type CrewLook = keyof typeof looks;
/** Local visual slots only: these values grant no equipment or gameplay capability. */
export type CrewAppearance = {
  /** Explicit presentation/review candidate; omitted preserves the published head kit. */
  headArtRevision?: string;
  bodyType?: CharacterBodyType;
  /** Omitted: catalog preview; provided (including {}): actual inventory authority. */
  equippedComponents?: EquippedCharacterComponents;
  outfit?: CrewLook | "crew" | "explorer";
  bodyStyle?: "jacket" | "flight-suit" | "uniform" | "lab-coat";
  armor?:
    | "none"
    | "utility"
    | "heavy"
    | "expedition"
    | "officer"
    | "medical"
    | "pilot"
    | "salvage"
    | "recon"
    | "scientist"
    | "mechanic";
  suit?: string;
  accent?: string;
  trim?: string;
  insignia?: string;
  visor?: string;
  light?: string;
  skin?: string;
  hair?: string;
  eyes?: string;
  expression?: CharacterExpression;
  faceDetail?: CharacterFaceDetail;
  facialHair?: CharacterFacialHair;
  faceAge?: CharacterFaceAge;
  faceVariant?: CharacterFaceVariant;
  hairStyle?: CharacterHairStyle;
  helmet?:
    | "none"
    | "open"
    | "closed"
    | "engineer"
    | "marine"
    | "explorer"
    | "captain"
    | "security"
    | "medic"
    | "pilot"
    | "salvage"
    | "recon"
    | "mechanic";
  backpack?: boolean;
  backpackStyle?: "utility" | "oxygen" | "field";
  weapon?: "none" | "pistol" | "rifle";
  /** Hide the small pose fixture when an external weapon mesh uses the hand socket. */
  weaponFixture?: boolean;
};
export type ResolvedCrewAppearance = Required<CrewAppearance>;
/** The exact ten reference looks; legacy saved appearance IDs still resolve below. */
export const CREW_OUTFITS = looks as Readonly<
  Record<CrewLook, Partial<CrewAppearance> & { name: string }>
>;
const LEGACY_LOOKS: Readonly<Record<string, Partial<CrewAppearance>>> = {
  crew: {
    bodyStyle: "jacket",
    armor: "none",
    helmet: "none",
    hairStyle: "swept",
    backpackStyle: "utility",
    suit: "#496d85",
    accent: "#ed903a",
  },
  explorer: {
    bodyStyle: "flight-suit",
    armor: "expedition",
    helmet: "explorer",
    hairStyle: "crest",
    backpackStyle: "field",
    suit: "#476553",
    accent: "#dda452",
  },
};
export function resolveCrewAppearance(
  input: CrewAppearance,
): ResolvedCrewAppearance {
  const outfit = input.outfit ?? "engineer";
  if (
    input.faceVariant !== undefined &&
    !CHARACTER_FACE_VARIANTS.includes(input.faceVariant)
  )
    throw new Error(`Unknown crew face variant: ${input.faceVariant}`);
  const resolved = {
    outfit,
    headArtRevision: "legacy",
    bodyType: "male",
    faceVariant: "m_classic",
    equippedComponents:
      input.equippedComponents ??
      CHARACTER_COMPONENT_SETS[outfit] ??
      CHARACTER_COMPONENT_SETS.engineer,
    bodyStyle: "jacket",
    armor: "none",
    helmet: "none",
    hairStyle: "swept",
    backpackStyle: "utility",
    suit: "#496d85",
    accent: "#ed903a",
    trim: "#CBD4DF",
    insignia: "#EDB443",
    visor: "#102441",
    light: "#50D7F0",
    skin: "#bb805e",
    hair: "#47312c",
    ...CHARACTER_FACE_DEFAULTS,
    backpack: true,
    weapon: "none",
    weaponFixture: true,
    ...(outfit in CREW_OUTFITS
      ? CREW_OUTFITS[outfit as CrewLook]
      : LEGACY_LOOKS[outfit]),
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
  } as ResolvedCrewAppearance;
  resolved.faceVariant =
    input.faceVariant ??
    (resolved.bodyType === "female" ? "f_classic" : "m_classic");
  return resolved;
}

/** A uniform changes its preset slots, while explicitly chosen features persist. */
export function mergeCrewAppearance(
  previous: CrewAppearance,
  next: CrewAppearance,
): CrewAppearance {
  if (!next.outfit || next.outfit === (previous.outfit ?? "crew"))
    return { ...previous, ...next };
  return {
    ...Object.fromEntries(
      CHARACTER_PERSONAL_APPEARANCE_KEYS.filter(
        (key) => previous[key] !== undefined,
      ).map((key) => [key, previous[key]]),
    ),
    weapon: previous.weapon ?? "none",
    ...next,
  };
}
