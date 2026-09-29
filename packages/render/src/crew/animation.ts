export const blendProgress = (elapsed: number, duration: number) => {
  const t = Math.max(0, Math.min(1, elapsed / duration));
  return t * t * (3 - 2 * t);
};
