export interface LayoutPickingRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Babylon's picking entrypoints divide by hardwareScalingLevel internally.
 * Supply pre-scaled canvas coordinates, including any CSS/framebuffer mismatch. */
export function layoutPickingCoordinates(
  clientX: number,
  clientY: number,
  rect: LayoutPickingRect,
  renderWidth: number,
  renderHeight: number,
  hardwareScalingLevel: number,
): [number, number] | undefined {
  if (
    ![
      clientX,
      clientY,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      renderWidth,
      renderHeight,
      hardwareScalingLevel,
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    renderWidth <= 0 ||
    renderHeight <= 0 ||
    hardwareScalingLevel <= 0
  )
    return undefined;
  return [
    ((clientX - rect.left) * renderWidth * hardwareScalingLevel) / rect.width,
    ((clientY - rect.top) * renderHeight * hardwareScalingLevel) / rect.height,
  ];
}
