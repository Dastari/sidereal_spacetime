/** Bound framebuffer work while keeping high-density editor text and mesh edges sharp. */
export function editorRenderScale(
  pixelRatio: number,
  width: number,
  height: number,
): number {
  const density = Number.isFinite(pixelRatio)
    ? Math.max(1, Math.min(2, pixelRatio))
    : 1;
  const area = Math.max(1, width) * Math.max(1, height);
  return 1 / Math.min(density, Math.sqrt(4_000_000 / area));
}
/** A fine placement snap must not allocate thousands of nearly coincident guide lines. */
export function editorGuideStep(snap: number): number {
  return Number.isFinite(snap) ? Math.max(0.5, snap) : 1;
}
/** Fit projected box extents to both axes; portrait canvases cannot use vertical FOV alone. */
export function editorFitRadius(
  size: readonly number[],
  alpha: number,
  beta: number,
  aspect: number,
  fov: number,
): number {
  const [x, y, z] = size.map((value) => Math.abs(value) / 2);
  const horizontal =
    Math.abs(Math.sin(alpha)) * x + Math.abs(Math.cos(alpha)) * z;
  const vertical =
    Math.abs(Math.cos(beta) * Math.cos(alpha)) * x +
    Math.abs(Math.sin(beta)) * y +
    Math.abs(Math.cos(beta) * Math.sin(alpha)) * z;
  const depth =
    Math.abs(Math.sin(beta) * Math.cos(alpha)) * x +
    Math.abs(Math.cos(beta)) * y +
    Math.abs(Math.sin(beta) * Math.sin(alpha)) * z;
  const tangent = Math.tan(fov / 2);
  return Math.max(
    3,
    (Math.max(
      horizontal / (tangent * Math.max(0.1, aspect)),
      vertical / tangent,
    ) +
      depth) *
      1.12,
  );
}
