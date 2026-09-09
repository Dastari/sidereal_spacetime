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
