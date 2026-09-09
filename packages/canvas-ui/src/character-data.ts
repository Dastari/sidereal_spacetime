import type { ItemRarity } from "./item-frame";

/** Owner-requested visual-study data. Never passed to reducers or simulation. */
export const CHARACTER_PREVIEW = {
  level: 12,
  xp: 3450,
  nextLevelXp: 6000,
  gearPower: 1280,
  vitals: [
    {
      label: "Health",
      current: 386,
      max: 480,
      color: "#ff456a",
      icon: "heart",
    },
    {
      label: "Shield",
      current: 256,
      max: 320,
      color: "#28b9ff",
      icon: "shield",
    },
    { label: "Energy", current: 108, max: 150, color: "#ffe56b", icon: "bolt" },
    {
      label: "Stamina",
      current: 92,
      max: 120,
      color: "#35edc4",
      icon: "stamina",
    },
  ] as const,
  attributes: [
    ["Strength", 8],
    ["Agility", 12],
    ["Intellect", 10],
    ["Endurance", 12],
    ["Tech", 14],
  ] as const,
  resistances: [
    { label: "Kinetic", value: 30, color: "#65ddff", icon: "kinetic" },
    { label: "Thermal", value: 25, color: "#ff547d", icon: "flame" },
    { label: "Energy", value: 20, color: "#35beff", icon: "bolt" },
    { label: "Radiation", value: 15, color: "#f8db68", icon: "radiation" },
    { label: "EMP", value: 35, color: "#c16dff", icon: "emp" },
    { label: "Corrosion", value: 20, color: "#5fea96", icon: "corrosion" },
  ] as const,
};
export const STAT_GROUPS = [
  {
    name: "Survival",
    rows: [
      ["Health", "480", "heart"],
      ["Shield", "320", "shield"],
      ["Energy", "150", "bolt"],
      ["Stamina", "120", "stamina"],
      ["Health regen", "12 /s", "heart"],
      ["Shield regen", "18 /s", "shield"],
      ["Energy regen", "10 /s", "bolt"],
    ],
  },
  {
    name: "Offense",
    rows: [
      ["Weapon damage", "128", "crosshair"],
      ["Critical chance", "18%", "crosshair"],
      ["Critical damage", "180%", "crosshair"],
      ["Ability power", "96", "emp"],
      ["Fire rate", "+12%", "gear"],
      ["Weapon range", "+25%", "scan"],
      ["Armor penetration", "15", "kinetic"],
    ],
  },
  {
    name: "Utilities",
    rows: [
      ["Mining yield", "+35%", "repair"],
      ["Repair speed", "+40%", "repair"],
      ["Hacking speed", "+25%", "gear"],
      ["Move speed", "6.2 m/s", "dash"],
      ["Boost speed", "12.8 m/s", "dash"],
      ["Cargo capacity", "120", "cargo"],
      ["Scan range", "+50%", "scan"],
    ],
  },
] as const;

/** Stable appearance examples, not a server-owned rarity or loot valuation. */
export const ITEM_PRESENTATION: Readonly<
  Record<string, { rarity: ItemRarity }>
> = {
  "compact-pistol": { rarity: "common" },
  "heavy-handgun": { rarity: "rare" },
  carbine: { rarity: "epic" },
  "long-rifle": { rarity: "legendary" },
  scanner: { rarity: "rare" },
  "plasma-cutter": { rarity: "legendary" },
  medkit: { rarity: "common" },
  "power-cell": { rarity: "rare" },
  "field-pack": { rarity: "uncommon" },
  "resource-canister": { rarity: "common" },
};
export function itemRarity(definitionId: string): ItemRarity {
  const archetype = definitionId.startsWith("crew-")
    ? definitionId.split("-")[1]
    : "";
  const armor: Record<string, ItemRarity> = {
    captain: "legendary",
    marine: "epic",
    security: "rare",
    medic: "rare",
    engineer: "uncommon",
    recon: "rare",
    salvage: "uncommon",
    pilot: "rare",
    scientist: "epic",
  };
  return (
    ITEM_PRESENTATION[definitionId]?.rarity ?? armor[archetype] ?? "common"
  );
}
