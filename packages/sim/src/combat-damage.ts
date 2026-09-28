/**
 * Pure rules for handheld weapon damage (authority helpers; the world adapter commits rows).
 *
 * - Characters have health. At zero they are downed (cannot walk, aim, fire or pilot) and stand
 *   up again on their own after a fixed time with part of their health. Nobody dies: death, loot
 *   and respawn are still open owner decisions.
 * - Ship components take `max(0, damage - armor)` per hit against their catalogue hp (armor is
 *   the catalogue's flat per-hit reduction). Their damage state and performance come from the
 *   catalogue's `damageStates` table (pristine / scuffed / damaged / destroyed).
 * - Friendly fire is on (owner decision 2026-09-28): crewmates and your own ship take damage.
 *
 * All numbers here are provisional lab values, not approved balance.
 */
import {
  buildShipComponentCatalog,
  SHIP_COMPONENT_CATALOG_REVISION,
  SHIP_COMPONENT_CATALOG_REVISIONS,
} from "@sidereal/content/ship-components-source";
import { beamDirection } from "./prefab-beam";

export const CHARACTER_MAX_HEALTH = 100;
/** Downed characters stand up on their own after this long. */
export const DOWNED_MICROS = 10_000_000n;
/** Health restored when a downed character stands up. */
export const RECOVER_HEALTH = 25;
/** Health regenerates only after this long without taking damage. */
export const REGEN_DELAY_MICROS = 5_000_000n;
export const REGEN_PER_SECOND = 2;
/** Planar body radius of a character for beam hits (the walking capsule radius). */
export const CHARACTER_HIT_RADIUS_M = 0.3;

export type CharacterCondition = "active" | "downed";
export interface CharacterVitals {
  health: number;
  maxHealth: number;
  state: CharacterCondition;
  /** Last time damage was taken (regen delay start). */
  lastDamageMicros: bigint;
  /** Downed characters recover at this time; 0 while active. */
  downedUntilMicros: bigint;
  /** Health was last settled at this time. */
  checkpointMicros: bigint;
}

export const freshVitals = (now: bigint): CharacterVitals => ({
  health: CHARACTER_MAX_HEALTH,
  maxHealth: CHARACTER_MAX_HEALTH,
  state: "active",
  lastDamageMicros: 0n,
  downedUntilMicros: 0n,
  checkpointMicros: now,
});

const finite = (v: number) => Number.isFinite(v) && v >= 0;

/** Settle regeneration and downed recovery up to `now`. Pure; never lowers health. */
export function settledVitals(
  v: CharacterVitals,
  now: bigint,
): CharacterVitals {
  if (!finite(v.health) || !(v.maxHealth > 0)) throw Error("Invalid vitals");
  if (v.state === "downed") {
    if (now < v.downedUntilMicros) return v;
    return {
      ...v,
      state: "active",
      health: Math.min(v.maxHealth, Math.max(v.health, RECOVER_HEALTH)),
      downedUntilMicros: 0n,
      // Regeneration waits the normal delay after standing up.
      lastDamageMicros: now,
      checkpointMicros: now,
    };
  }
  if (v.health >= v.maxHealth) return { ...v, checkpointMicros: now };
  const regenFrom =
    v.checkpointMicros > v.lastDamageMicros + REGEN_DELAY_MICROS
      ? v.checkpointMicros
      : v.lastDamageMicros + REGEN_DELAY_MICROS;
  if (now <= regenFrom) return v;
  return {
    ...v,
    health: Math.min(
      v.maxHealth,
      v.health + (Number(now - regenFrom) / 1e6) * REGEN_PER_SECOND,
    ),
    checkpointMicros: now,
  };
}

export interface CharacterHitResult {
  vitals: CharacterVitals;
  /** Health actually removed. */
  applied: number;
  /** This hit took the character down. */
  downed: boolean;
}

/** Apply a hit at `now`. A downed character takes no further damage (nobody dies yet). */
export function hitCharacter(
  before: CharacterVitals,
  damage: number,
  now: bigint,
): CharacterHitResult {
  if (!finite(damage)) throw Error("Invalid damage");
  const v = settledVitals(before, now);
  if (v.state === "downed" || damage === 0)
    return { vitals: v, applied: 0, downed: false };
  const health = Math.max(0, v.health - damage);
  const applied = v.health - health;
  const downed = health <= 0;
  return {
    vitals: {
      ...v,
      health,
      state: downed ? "downed" : "active",
      lastDamageMicros: now,
      downedUntilMicros: downed ? now + DOWNED_MICROS : 0n,
      checkpointMicros: now,
    },
    applied,
    downed,
  };
}

export interface DamageStateRule {
  state: string;
  minHpFraction: number;
  performance: number;
}

/** Catalogue damage states, ordered best first (`ship-components.v1.json` `damageStates`). */
export function componentDamageState(
  hp: number,
  maxHp: number,
  rules: readonly DamageStateRule[],
): { state: string; performance: number } {
  if (!finite(hp) || !(maxHp > 0) || !rules.length)
    throw Error("Invalid component integrity");
  const fraction = Math.min(1, hp / maxHp);
  if (hp <= 0) {
    const last = rules[rules.length - 1];
    return { state: last.state, performance: last.performance };
  }
  const rule = [...rules]
    .sort((a, b) => b.minHpFraction - a.minHpFraction)
    .find((r) => r.minHpFraction > 0 && fraction >= r.minHpFraction);
  const fallback = rules.filter((r) => r.minHpFraction > 0).at(-1)!;
  const chosen = rule ?? fallback;
  return { state: chosen.state, performance: chosen.performance };
}

const damageStateCache = new Map<number, readonly DamageStateRule[]>();
/** The damage-state table of a prefab's component catalogue revision (`ship-components-v1@N`). */
export function catalogDamageStates(
  catalogRevision?: string,
): readonly DamageStateRule[] {
  const at = catalogRevision?.match(/@(\d+)$/);
  const revision = at ? Number(at[1]) : SHIP_COMPONENT_CATALOG_REVISION;
  if (
    !(SHIP_COMPONENT_CATALOG_REVISIONS as readonly number[]).includes(revision)
  )
    throw Error("Unknown component catalogue revision");
  let rules = damageStateCache.get(revision);
  if (!rules) {
    rules = buildShipComponentCatalog(
      revision as (typeof SHIP_COMPONENT_CATALOG_REVISIONS)[number],
    ).damageStates;
    damageStateCache.set(revision, rules);
  }
  return rules;
}

/** Damage a component takes from one hit: the catalogue armor is a flat per-hit reduction. */
export function componentHitDamage(damage: number, armor: number): number {
  if (!finite(damage) || !finite(armor)) throw Error("Invalid damage");
  return Math.max(0, damage - armor);
}

/**
 * Fraction to queue on the IFCS damage path so a fitting's availability drops from `current` to
 * `target` (the damage producer multiplies availability by `1 - loss`). Undefined when no
 * reduction is needed (damage never repairs a fitting).
 */
export function availabilityLoss(
  current: number,
  target: number,
): number | undefined {
  if (!(current > 0) || !(target >= 0) || target >= current) return;
  return target <= 0 ? 1 : 1 - target / current;
}

export interface CharacterTarget {
  id: string;
  x: number;
  y: number;
}

/**
 * First character body a planar beam reaches before `maxDistanceM` (a disc of
 * `CHARACTER_HIT_RADIUS_M` around each character). Bodies the origin is inside are skipped, so a
 * shooter never hits itself with its own muzzle.
 */
export function castCharacterBeam(
  origin: readonly [number, number],
  angle: number,
  maxDistanceM: number,
  targets: readonly CharacterTarget[],
  radiusM = CHARACTER_HIT_RADIUS_M,
): { id: string; distanceM: number; point: [number, number] } | undefined {
  if (
    ![origin[0], origin[1], angle, maxDistanceM, radiusM].every(Number.isFinite)
  )
    throw Error("Invalid beam");
  const d = beamDirection(angle);
  let best: { id: string; t: number } | undefined;
  for (const target of [...targets].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const ox = origin[0] - target.x;
    const oy = origin[1] - target.y;
    const c = ox * ox + oy * oy - radiusM * radiusM;
    if (c <= 0) continue;
    const b = ox * d[0] + oy * d[1];
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t < 0 || t > maxDistanceM) continue;
    if (!best || t < best.t) best = { id: target.id, t };
  }
  if (!best) return;
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0;
  return {
    id: best.id,
    distanceM: r(best.t),
    point: [r(origin[0] + d[0] * best.t), r(origin[1] + d[1] * best.t)],
  };
}

export interface PowerDevice {
  mountId: string;
  generationKw: number;
  activeKw: number;
  /** Has a flight fitting (drive, RCS, flight computer): draws from the ship's generation. */
  fitted: boolean;
}

/**
 * Share of their rated draw that power-fed flight fittings still receive after generator damage
 * (provisional rule, 2026-09-28): remaining generation (each generator's rated output times its
 * damage-state performance) divided by the fitted devices' rated active draw, capped at 1. A ship
 * with no rated generation, or no fitted draw, is not power-limited by this rule.
 */
export function prefabPowerFactor(
  devices: readonly PowerDevice[],
  performance: (mountId: string) => number,
): number {
  let rated = 0,
    available = 0,
    draw = 0;
  for (const d of devices) {
    rated += d.generationKw;
    available +=
      d.generationKw * Math.max(0, Math.min(1, performance(d.mountId)));
    if (d.fitted) draw += d.activeKw;
  }
  if (!(rated > 0) || !(draw > 0)) return 1;
  return Math.min(1, available / draw);
}
