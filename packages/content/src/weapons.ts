/** Provisional laboratory energy rules; these are not approved progression/economy stats. */
export interface WeaponDefinition {
  capacity: number;
  shotCost: number;
  cooldownMs: number;
  rangeMeters: number;
}
export const LAB_WEAPONS: Readonly<Record<string, WeaponDefinition>> = {
  "compact-pistol": {
    capacity: 100,
    shotCost: 8,
    cooldownMs: 250,
    rangeMeters: 60,
  },
  "heavy-handgun": {
    capacity: 100,
    shotCost: 16,
    cooldownMs: 500,
    rangeMeters: 60,
  },
  carbine: { capacity: 120, shotCost: 4, cooldownMs: 100, rangeMeters: 60 },
  "long-rifle": {
    capacity: 120,
    shotCost: 24,
    cooldownMs: 700,
    rangeMeters: 60,
  },
};
