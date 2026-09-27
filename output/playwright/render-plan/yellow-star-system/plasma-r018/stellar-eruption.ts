/** Artistic cadence: six-second eruptions separated by twelve seconds of quiet.
 * Presentation time only; no simulation clock or authority writes. */
export function stellarEruptionState(time: number) {
  const elapsed = time - 4;
  const event = Math.floor(elapsed / 18);
  const age = elapsed - event * 18;
  const progress = event >= 0 && age < 6 ? age / 6 : 0;
  return {
    progress,
    strength: Math.sin(Math.PI * progress) ** 2,
    angle:
      (0.9 + ((Math.max(0, event) * 2.3999632297) % (Math.PI * 2))) %
      (Math.PI * 2),
  };
}
