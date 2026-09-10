/** Presentation discontinuities invalidate temporal samples, continuous motion does not. */
export interface TemporalSceneState {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  localX: number;
  localY: number;
  interior: boolean;
  inspect: boolean;
  constructionDeckId?: string;
  vistaId?: string;
  seated?: boolean;
}
export function invalidatesTemporalHistory(
  before: TemporalSceneState,
  after: TemporalSceneState,
  elapsedMs: number,
): boolean {
  if (
    elapsedMs > 1000 ||
    before.interior !== after.interior ||
    before.inspect !== after.inspect ||
    before.constructionDeckId !== after.constructionDeckId ||
    before.vistaId !== after.vistaId ||
    before.seated !== after.seated
  )
    return true;
  const seconds = Math.max(0, elapsedMs) / 1000;
  const speed = Math.max(
    Math.hypot(before.vx ?? 0, before.vy ?? 0),
    Math.hypot(after.vx ?? 0, after.vy ?? 0),
  );
  // World origin follows the ship continuously. Allow its reported travel, but
  // reject a jump beyond that envelope; deck walking has a separate envelope.
  return (
    Math.hypot(after.x - before.x, after.y - before.y) > 32 + speed * seconds ||
    Math.hypot(after.localX - before.localX, after.localY - before.localY) >
      4 + 20 * seconds
  );
}
