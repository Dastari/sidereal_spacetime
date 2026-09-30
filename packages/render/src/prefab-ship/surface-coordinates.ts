/** Affine face coordinates from global ship lattice CORNERS, never chunk-local/render positions.
 * Whole tiles repeat; these coordinates do not implement atlas-subtile repetition.
 * U=e[(axis+1)%3], V=sign*e[(axis+2)%3], so U cross V equals the signed face normal. */
export function latticeFaceUvs(
  corners: readonly ArrayLike<number>[],
  normal: ArrayLike<number>,
  repeatCells = 16,
): Float32Array {
  if (
    !Number.isSafeInteger(repeatCells) ||
    repeatCells <= 0 ||
    normal.length !== 3
  )
    throw Error("Invalid lattice face mapping");
  const axis = [0, 1, 2].find((a) => Math.abs(normal[a]) === 1);
  if (
    axis === undefined ||
    [0, 1, 2].some((a) => a !== axis && normal[a] !== 0)
  )
    throw Error("Lattice face normal must be a signed axis");
  const u = (axis + 1) % 3,
    v = (axis + 2) % 3;
  const output = new Float32Array(corners.length * 2);
  corners.forEach((corner, i) => {
    if (
      corner.length !== 3 ||
      [0, 1, 2].some((a) => !Number.isSafeInteger(corner[a]))
    )
      throw Error("Lattice face corners must be global integers");
    output[i * 2] = corner[u] / repeatCells;
    output[i * 2 + 1] = (normal[axis] * corner[v]) / repeatCells;
  });
  return output;
}
