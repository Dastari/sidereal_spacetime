import {
  CHARACTER_COMPONENTS,
  characterComponentImageUrl,
  type EquipmentSlot,
} from "./character-components";
/** Versioned laboratory item definitions. Grid dimensions are storage footprints,
 * distinct from physical mesh/collision dimensions. Every item is a stable instance. */
export interface InventoryDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  massKg: number;
  assetId: string;
  equipSlot?: EquipmentSlot;
  /** Native shared-rig component, authoritative only when an owned item is equipped. */
  characterComponentId?: string;
  iconUrl?: string;
  pose?: "pistol" | "rifle";
  storage?: { width: number; height: number; maxMassKg: number };
  reservoir?: { capacityLitres: number; liquidType: string };
}
export const CHARACTER_ARMOR_DEFINITIONS: readonly InventoryDefinition[] =
  CHARACTER_COMPONENTS.map((c) => ({
    id: "crew-" + c.id,
    name: c.name,
    width: c.grid[0],
    height: c.grid[1],
    massKg: c.massKg,
    assetId: "crew-" + c.id,
    equipSlot: c.slot,
    characterComponentId: c.id,
    iconUrl: characterComponentImageUrl(c.id),
    ...(c.slot === "back"
      ? { storage: { width: 8, height: 6, maxMassKg: 24 } }
      : {}),
  }));
export const INVENTORY_DEFINITIONS: readonly InventoryDefinition[] = [
  {
    id: "compact-pistol",
    name: "Compact pistol",
    width: 2,
    height: 2,
    massKg: 1.1,
    assetId: "compact-pistol",
    equipSlot: "hand",
    pose: "pistol",
  },
  {
    id: "heavy-handgun",
    name: "Heavy handgun",
    width: 2,
    height: 2,
    massKg: 1.8,
    assetId: "heavy-handgun",
    equipSlot: "hand",
    pose: "pistol",
  },
  {
    id: "carbine",
    name: "Frontier carbine",
    width: 2,
    height: 4,
    massKg: 3.2,
    assetId: "carbine",
    equipSlot: "hand",
    pose: "rifle",
  },
  {
    id: "long-rifle",
    name: "Survey rifle",
    width: 2,
    height: 5,
    massKg: 4.4,
    assetId: "long-rifle",
    equipSlot: "hand",
    pose: "rifle",
  },
  {
    id: "scanner",
    name: "Survey scanner",
    width: 1,
    height: 2,
    massKg: 0.5,
    assetId: "sample-scanner",
    equipSlot: "hand",
    pose: "pistol",
  },
  {
    id: "plasma-cutter",
    name: "Plasma cutter",
    width: 2,
    height: 3,
    massKg: 2.4,
    assetId: "plasma-cutter",
    equipSlot: "hand",
    pose: "pistol",
  },
  {
    id: "medkit",
    name: "Field medkit",
    width: 2,
    height: 2,
    massKg: 0.8,
    assetId: "medkit",
  },
  {
    id: "power-cell",
    name: "Power cell",
    width: 1,
    height: 2,
    massKg: 0.7,
    assetId: "power-cell",
  },
  {
    id: "field-pack",
    name: "Field backpack",
    width: 3,
    height: 4,
    massKg: 1.2,
    assetId: "utility-backpack",
    equipSlot: "back",
    storage: { width: 8, height: 6, maxMassKg: 24 },
  },
  {
    id: "resource-canister",
    name: "Fuel canister",
    width: 1,
    height: 2,
    massKg: 0.6,
    assetId: "resource-canister",
    reservoir: { capacityLitres: 5, liquidType: "fuel" },
  },
  ...CHARACTER_ARMOR_DEFINITIONS,
];
export function inventoryDefinition(id: string): InventoryDefinition {
  const found = INVENTORY_DEFINITIONS.find(
    (definition) => definition.id === id,
  );
  if (!found) throw new Error("Unknown item definition");
  return found;
}
export const CHARACTER_CARRY_LIMIT_KG = 32;
export const LIQUID_DENSITY_KG_PER_LITRE: Readonly<Record<string, number>> = {
  fuel: 0.8,
  water: 1,
};
/** Equipment visuals are derived only from the filtered inventory projection. */
export function characterEquipmentFromInventory(
  items: readonly { definitionId: string; equipmentSlot: string }[],
) {
  const result: import("./character-components").EquippedCharacterComponents =
    {};
  for (const item of items) {
    const definition = INVENTORY_DEFINITIONS.find(
      (d) => d.id === item.definitionId,
    );
    if (definition?.equipSlot !== item.equipmentSlot || !item.equipmentSlot)
      continue;
    const id =
      definition.characterComponentId ??
      (definition.id === "field-pack" ? "engineer-back" : undefined);
    if (id && item.equipmentSlot !== "hand")
      result[
        item.equipmentSlot as import("./character-components").CharacterEquipmentSlot
      ] = id;
  }
  return result;
}
