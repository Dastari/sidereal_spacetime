export const AIM_TIMEOUT_MICROS = 300_000n;
export const RECOVERY_DELAY_MICROS = 1_500_000n;
export function normalizedAim(angle: number): number {
  if (!Number.isFinite(angle)) throw new Error("Invalid aim angle");
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
export function aimIsFresh(
  active: boolean,
  updatedMicros: bigint,
  now: bigint,
): boolean {
  return (
    active && now >= updatedMicros && now - updatedMicros <= AIM_TIMEOUT_MICROS
  );
}
export function recoveredEnergy(
  energy: number,
  capacity: number,
  checkpoint: bigint,
  lastShot: bigint,
  now: bigint,
): number {
  const start =
    checkpoint > lastShot + RECOVERY_DELAY_MICROS
      ? checkpoint
      : lastShot + RECOVERY_DELAY_MICROS;
  return Math.min(
    capacity,
    Math.max(0, energy) + Math.max(0, Number(now - start) / 1e6) * 12,
  );
}
export function validateShot(
  energy: number,
  cost: number,
  cooldownMs: number,
  lastShot: bigint,
  now: bigint,
  hasFired: boolean,
): void {
  if (hasFired && now - lastShot < BigInt(cooldownMs) * 1000n)
    throw new Error("Weapon cooling down");
  if (energy < cost) throw new Error("Insufficient weapon energy");
}

/** Pellet directions: `count` rays spread evenly over a `spreadRad` cone centred on the aim.
 * Deterministic (no randomness), so every client and replay agrees with the server. */
export function pelletAngles(
  angle: number,
  count: number,
  spreadRad: number,
): number[] {
  if (!Number.isFinite(angle) || !Number.isFinite(spreadRad))
    throw new Error("Invalid spread");
  const n = Math.max(1, Math.min(32, Math.floor(count)));
  if (n === 1 || !(spreadRad > 0)) return [normalizedAim(angle)];
  return Array.from({ length: n }, (_, i) =>
    normalizedAim(angle - spreadRad / 2 + (spreadRad * i) / (n - 1)),
  );
}

/** Blast damage at `distanceM` from the centre: full at the centre, falling linearly to
 * `edgeFraction` of it at the radius, none beyond. */
export function blastDamage(
  damage: number,
  distanceM: number,
  radiusM: number,
  edgeFraction: number,
): number {
  if (!(damage > 0) || !(radiusM > 0) || !(distanceM >= 0)) return 0;
  if (distanceM > radiusM) return 0;
  const edge = Math.min(1, Math.max(0, edgeFraction));
  return damage * (1 - (1 - edge) * (distanceM / radiusM));
}

/** A thrown item stops this far short of the obstacle it would hit, so it lands in the room. */
export const THROW_STANDOFF_M = 0.3;
/** Landing point of a throw whose ray reached `hitDistanceM` along `angle` (deck frame: +Y is
 * angle 0, +X is angle pi/2, as the beam). */
export function throwLanding(
  origin: readonly [number, number],
  angle: number,
  hitDistanceM: number,
  struck: boolean,
): { x: number; y: number; distanceM: number } {
  const distanceM = Math.max(
    0,
    struck ? hitDistanceM - THROW_STANDOFF_M : hitDistanceM,
  );
  return {
    x: origin[0] + Math.sin(angle) * distanceM,
    y: origin[1] + Math.cos(angle) * distanceM,
    distanceM,
  };
}

/** A reload started at `now` holds the weapon (no firing) until this server time. */
export function reloadUntil(now: bigint, reloadMs: number): bigint {
  if (!(reloadMs > 0) || !Number.isFinite(reloadMs))
    throw new Error("Weapon cannot reload");
  return now + BigInt(Math.round(reloadMs)) * 1000n;
}
