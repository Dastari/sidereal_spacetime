/** Local surface-neighbour approximation, not a global illumination solver. */
export function terrainContactOcclusion(
  height: number,
  neighbors: readonly number[],
  cellWidth: number,
) {
  if (!(cellWidth > 0) || !Number.isFinite(height)) return 1;
  const obstruction =
    neighbors.reduce(
      (sum, h) => sum + Math.min(1, Math.max(0, h - height) / cellWidth),
      0,
    ) / Math.max(1, neighbors.length);
  return Math.max(0.48, 1 - obstruction * 0.65);
}

/** Only the immediately adjacent, unblocked molten cell lights this cliff edge. */
export function adjacentLavaRadiance(
  lava: boolean,
  sourceHeight: number,
  receiverHeight: number,
  cellWidth: number,
  emission: number,
): [number, number, number] {
  if (!lava || !(emission > 0) || !(cellWidth > 0)) return [0, 0, 0];
  const horizontal = cellWidth * 0.5;
  const distance = Math.hypot(horizontal, receiverHeight - sourceHeight);
  const facing = horizontal / Math.max(0.0001, distance);
  const strength =
    (Math.min(4, emission) * 0.9 * facing) / (1 + (distance / 0.065) ** 2);
  return [strength, strength * 0.15, strength * 0.018];
}
