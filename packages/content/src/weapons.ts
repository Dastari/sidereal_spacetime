/**
 * Provisional handheld weapon rules (lab balance; NOT approved progression/economy stats). The
 * balance table lives on the wiki (Systems/Combat). Every accepted shot is resolved by the server
 * from the shooter's committed deck position and the accepted aim (`packages/world/src/combat.ts`).
 *
 * Energy: `capacity` units per item, `shotCost` per accepted shot, passive recovery 12 units/s
 * after 1.5 s without firing (`packages/sim/src/combat.ts`). A weapon with `reloadMs` also accepts
 * a manual reload intent that refills it to capacity after `reloadMs` (cell/magazine swap); firing
 * is refused while it reloads.
 */
export type WeaponFireMode =
  /** One hitscan ray along the aim: the first body or structure it reaches takes `damage`. */
  | "beam"
  /** `pellets` rays spread evenly over `spreadRad` around the aim; each pellet deals `damage`. */
  | "pellets"
  /** One short ray (`rangeMeters` is the reach); hits the first body/structure within reach. */
  | "melee"
  /** Lands at the first obstacle along the aim (at most `rangeMeters`) and detonates after
   * `fuseMs`: every standing body within `blastRadiusM` takes `damage` scaled by distance. */
  | "thrown";

export interface WeaponDefinition {
  capacity: number;
  shotCost: number;
  cooldownMs: number;
  rangeMeters: number;
  /** Damage per accepted shot (per pellet for "pellets"; at the centre for "thrown"). */
  damage: number;
  /** Defaults to "beam". */
  mode?: WeaponFireMode;
  pellets?: number;
  /** Total cone angle (radians) the pellets cover. */
  spreadRad?: number;
  /** Manual reload time; absent = no reload (melee, thrown). */
  reloadMs?: number;
  /** A struck character cannot aim or fire for this long (stun gun, baton). */
  stunMs?: number;
  blastRadiusM?: number;
  /** Damage fraction at the edge of the blast (linear falloff from 1 at the centre). */
  blastEdgeFraction?: number;
  fuseMs?: number;
}

export const LAB_WEAPONS: Readonly<Record<string, WeaponDefinition>> = {
  // Legacy definitions (live since 2026-09-08; unchanged apart from a manual reload).
  "compact-pistol": {
    capacity: 100,
    shotCost: 8,
    cooldownMs: 250,
    rangeMeters: 60,
    damage: 15,
    reloadMs: 1200,
  },
  "heavy-handgun": {
    capacity: 100,
    shotCost: 16,
    cooldownMs: 500,
    rangeMeters: 60,
    damage: 30,
    reloadMs: 1400,
  },
  carbine: {
    capacity: 120,
    shotCost: 4,
    cooldownMs: 100,
    rangeMeters: 60,
    damage: 7,
    reloadMs: 1800,
  },
  "long-rifle": {
    capacity: 120,
    shotCost: 24,
    cooldownMs: 700,
    rangeMeters: 60,
    damage: 55,
    reloadMs: 2200,
  },
  // r001 handhelds (batch A, 2026-09-29): provisional.
  pistol: {
    capacity: 100,
    shotCost: 8,
    cooldownMs: 250,
    rangeMeters: 60,
    damage: 15,
    reloadMs: 1200,
  },
  smg: {
    capacity: 120,
    shotCost: 3,
    cooldownMs: 80,
    rangeMeters: 40,
    damage: 6,
    reloadMs: 1600,
  },
  "compact-carbine": {
    capacity: 120,
    shotCost: 4,
    cooldownMs: 100,
    rangeMeters: 60,
    damage: 7,
    reloadMs: 1800,
  },
  rifle: {
    capacity: 120,
    shotCost: 10,
    cooldownMs: 250,
    rangeMeters: 70,
    damage: 20,
    reloadMs: 2000,
  },
  shotgun: {
    capacity: 100,
    shotCost: 20,
    cooldownMs: 800,
    rangeMeters: 18,
    damage: 7,
    mode: "pellets",
    pellets: 8,
    spreadRad: 0.35,
    reloadMs: 2400,
  },
  "heavy-gun": {
    capacity: 300,
    shotCost: 3,
    cooldownMs: 60,
    rangeMeters: 50,
    damage: 8,
    reloadMs: 3200,
  },
  "beam-rifle": {
    capacity: 150,
    shotCost: 12,
    cooldownMs: 300,
    rangeMeters: 60,
    damage: 24,
    reloadMs: 2000,
  },
  "rail-rifle": {
    capacity: 120,
    shotCost: 40,
    cooldownMs: 1500,
    rangeMeters: 90,
    damage: 80,
    reloadMs: 2600,
  },
  "stun-gun": {
    capacity: 80,
    shotCost: 20,
    cooldownMs: 900,
    rangeMeters: 12,
    damage: 5,
    stunMs: 2500,
    reloadMs: 1500,
  },
  baton: {
    capacity: 100,
    shotCost: 10,
    cooldownMs: 600,
    rangeMeters: 1.8,
    damage: 20,
    mode: "melee",
    stunMs: 1000,
  },
  // Batch A: a reusable charge (two throws, then passive recovery). Consumable grenades wait for
  // ammunition/consumables; the item is never used up or deleted.
  grenade: {
    capacity: 100,
    shotCost: 50,
    cooldownMs: 1500,
    rangeMeters: 14,
    damage: 70,
    mode: "thrown",
    blastRadiusM: 3.5,
    blastEdgeFraction: 0.35,
    fuseMs: 1200,
  },
};

export function weaponMode(definition: WeaponDefinition): WeaponFireMode {
  return definition.mode ?? "beam";
}
