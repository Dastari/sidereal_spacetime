import {
  CHARACTER_COMPONENT_SETS,
  characterComponent,
  characterCoverage,
  type CharacterBodyType,
  type CharacterHairStyle,
  type EquippedCharacterComponents,
} from "@sidereal/content/character-components";
import looks from "../../../content/src/crew-looks.json";
export type CrewLook = keyof typeof looks;
/** Local visual slots only: these values grant no equipment or gameplay capability. */
export type CrewAppearance = {
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
  return {
    outfit,
    bodyType: "male",
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
    backpack: true,
    weapon: "none",
    weaponFixture: true,
    ...(outfit in CREW_OUTFITS
      ? CREW_OUTFITS[outfit as CrewLook]
      : LEGACY_LOOKS[outfit]),
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
  };
}

export function crewSlotVisible(
  slot: string,
  appearance: ResolvedCrewAppearance,
  modular = false,
): boolean {
  if (slot.startsWith("base-")) {
    const [, body, region] = slot.split("-");
    return (
      body === appearance.bodyType &&
      !characterCoverage(appearance.equippedComponents).has(region)
    );
  }
  const component = characterComponent(slot);
  if (component) return appearance.equippedComponents[component.slot] === slot;
  if (slot === "hair-helmet-liner") {
    const helmet = appearance.equippedComponents.helmet;
    return (
      appearance.hairStyle !== "none" &&
      !!helmet &&
      [
        "captain-helmet",
        "security-helmet",
        "mechanic-helmet",
        "engineer-helmet",
      ].includes(helmet)
    );
  }
  if (slot === "body") return true;
  if (slot.startsWith("look-")) return slot === `look-${appearance.outfit}`;
  if (slot.startsWith("body-")) return slot === `body-${appearance.bodyStyle}`;
  if (slot.startsWith("armor-")) return slot === `armor-${appearance.armor}`;
  if (slot.startsWith("hair-"))
    return (
      (modular
        ? !appearance.equippedComponents.helmet
        : appearance.helmet === "none") &&
      slot === `hair-${appearance.hairStyle}`
    );
  if (slot === "helmet-standard")
    return appearance.helmet === "open" || appearance.helmet === "closed";
  if (slot === "visor-standard") return appearance.helmet === "closed";
  if (slot.startsWith("helmet-")) return slot === `helmet-${appearance.helmet}`;
  if (slot.startsWith("backpack-"))
    return (
      appearance.backpack && slot === `backpack-${appearance.backpackStyle}`
    );
  if (slot.startsWith("weapon-"))
    return appearance.weaponFixture && slot === `weapon-${appearance.weapon}`;
  return false;
}
