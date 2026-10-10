import catalog from "./character-components.json";
export const CHARACTER_EQUIPMENT_SLOTS = [
  "helmet",
  "visor",
  "chest",
  "shoulders",
  "gloves",
  "belt",
  "legs",
  "boots",
  "back",
  /** Voxel-crew wardrobe: the full-body suit layer (department uniform); no r008 component. */
  "uniform",
] as const;
export type CharacterEquipmentSlot = (typeof CHARACTER_EQUIPMENT_SLOTS)[number];
export type EquipmentSlot = CharacterEquipmentSlot | "hand";
export type CharacterBodyType = "male" | "female";
export const CHARACTER_HAIR_STYLES = [
  "none",
  "swept",
  "cropped",
  "crest",
  "scientist",
  "bob",
  "ponytail",
  "bun",
  "braids",
  "hair.swept",
  "hair.short_side",
  "hair.crop",
  "hair.spiky",
  "hair.tousled",
  "hair.fluffy_curls",
  "hair.long_curls",
  "hair.messy_bun",
  "hair.bun",
  "hair.high_ponytail",
  "hair.long_ponytail",
  "hair.braids",
  "hair.long_wavy",
  "hair.short_bob",
  "hair.shoulder_wavy",
  "hair.twin_puffs",
  "hair.buzz",
  "hair.side_part",
  "hair.crest",
  "hair.afro",
  "hair.pixie",
  "hair.twin_tails",
  "hair.long_straight",
  "hair.slick_back",
  "hair.undercut",
  "groom.fluffy_curls",
  "groom.twin_puffs",
  "groom.high_ponytail",
  "groom.twin_tails",
] as const;
export type CharacterHairStyle = (typeof CHARACTER_HAIR_STYLES)[number];
export interface CharacterComponent {
  id: string;
  archetype: string;
  slot: CharacterEquipmentSlot;
  name: string;
  massKg: number;
  grid: number[];
  bodyTypes: string[];
  covers: string[];
  boundsMeters: { min: number[]; max: number[]; size: number[] };
}
export const CHARACTER_COMPONENTS =
  catalog.components as readonly CharacterComponent[];
export const CHARACTER_COMPONENT_SETS = catalog.sets as Readonly<
  Record<string, Partial<Record<CharacterEquipmentSlot, string>>>
>;
export type EquippedCharacterComponents = Partial<
  Record<CharacterEquipmentSlot, string>
>;
export function characterComponent(id: string) {
  return CHARACTER_COMPONENTS.find((c) => c.id === id);
}
/** Visible skin coverage derives from actual equipped definitions, not arbitrary tags. */
export function characterCoverage(
  equipped: EquippedCharacterComponents,
): ReadonlySet<string> {
  return new Set(
    Object.entries(equipped).flatMap(([slot, id]) => {
      const c = characterComponent(id!);
      return c?.slot === slot ? c.covers : [];
    }),
  );
}
/** Visual revisions invalidate browser caches without changing item identities. */
export function characterComponentImageUrl(id: string) {
  const revisions = (
    catalog as { visualRevisions?: Readonly<Record<string, number>> }
  ).visualRevisions;
  return `/assets/crew/components/${id}.png?revision=r${String(revisions?.[id] ?? 2).padStart(3, "0")}`;
}
