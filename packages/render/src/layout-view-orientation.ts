/** Explicit view changes select an orientation. Document edits and manual orbit
 * within the same named view must not reset the camera. World north maps to -Z. */
export function layoutViewOrientation(previous: string, next: string) {
  if (previous === next) return undefined;
  switch (next) {
    case "Top":
      return { alpha: Math.PI / 2, beta: 0.03 };
    case "Side":
      return { alpha: -Math.PI / 2, beta: Math.PI / 2 };
    case "Front":
      return { alpha: 0, beta: Math.PI / 2 };
    case "3D":
      return { alpha: -Math.PI / 2.6, beta: Math.PI / 3.2 };
    default:
      return undefined;
  }
}
