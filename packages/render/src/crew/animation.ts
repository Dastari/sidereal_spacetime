/** Keep walk/run feet in the same gait phase when weapons or speed change. */
export function strideFrame(
  source: { from: number; to: number; frame: number },
  target: { from: number; to: number },
) {
  const duration = source.to - source.from;
  const phase =
    duration > 0
      ? Math.max(0, Math.min(1, (source.frame - source.from) / duration))
      : 0;
  return target.from + phase * (target.to - target.from);
}
export function crewBlendDuration(previous: string, next: string) {
  if (previous.startsWith("Seated") !== next.startsWith("Seated")) return 0.28;
  if (previous.split("-")[1] !== next.split("-")[1]) return 0.24;
  return 0.18;
}
export const blendProgress = (elapsed: number, duration: number) => {
  const t = Math.max(0, Math.min(1, elapsed / duration));
  return t * t * (3 - 2 * t);
};
