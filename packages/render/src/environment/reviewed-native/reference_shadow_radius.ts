/** Worker-only tight origin-centred envelope of the actual composed vertices. */
export function referenceShadowRadius(positions: ArrayLike<number>): number {
  let squared = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const value =
      positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2;
    if (!Number.isFinite(value))
      throw new Error("Non-finite planet shadow bound");
    squared = Math.max(squared, value);
  }
  return Math.sqrt(squared);
}
