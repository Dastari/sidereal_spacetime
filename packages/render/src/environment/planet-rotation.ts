/** Render-only axial phase. Seed changes speed/direction, never world authority. */
export function planetAxialAngle(seed: number, elapsedSeconds: number) {
  const bits = Math.imul((seed >>> 0) ^ 0x6d2b79f5, 0x45d9f3b) >>> 0;
  const speed = (0.006 + (bits / 4294967296) * 0.004) * (bits & 1 ? -1 : 1);
  const phase =
    Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0) * speed;
  return ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

/** Absolute monotonic time avoids frame-rate dependence and accumulated angle drift. */
export function createPlanetRotationClock() {
  let previous: number | undefined,
    elapsed = 0,
    wasPaused = false;
  return {
    step(nowMilliseconds: number, paused: boolean) {
      if (!Number.isFinite(nowMilliseconds)) return elapsed;
      if (previous !== undefined && !paused && !wasPaused)
        elapsed += Math.max(0, nowMilliseconds - previous) / 1000;
      previous = nowMilliseconds;
      wasPaused = paused;
      return elapsed;
    },
  };
}
