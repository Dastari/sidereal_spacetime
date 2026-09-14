/** A screen-up gesture raises a component in the ship's up axis, including in
 * top view where ray/plane intersection cannot provide a vertical drag. */
export function verticalDragMetresPerPixel(
  viewportHeight: number,
  distance: number,
  fieldOfView: number,
): number {
  if (
    ![viewportHeight, distance, fieldOfView].every(Number.isFinite) ||
    viewportHeight <= 0 ||
    distance <= 0 ||
    fieldOfView <= 0 ||
    fieldOfView >= Math.PI
  )
    throw Error("Invalid vertical drag view");
  return (2 * distance * Math.tan(fieldOfView / 2)) / viewportHeight;
}

/** Snap the displacement, retaining an authored floor/mount datum and preserving
 * east/north exactly. The axis and scale are fixed when the pointer goes down. */
export function verticalDragPosition(
  origin: readonly [number, number, number],
  pointerDeltaY: number,
  metresPerPixel: number,
  spacing: number,
): [number, number, number] {
  if (
    ![...origin, pointerDeltaY, metresPerPixel, spacing].every(
      Number.isFinite,
    ) ||
    metresPerPixel <= 0 ||
    spacing < 1 / 32
  )
    throw Error("Invalid vertical drag");
  return [
    origin[0],
    origin[1],
    origin[2] +
      Math.round((-pointerDeltaY * metresPerPixel) / spacing) * spacing,
  ];
}
