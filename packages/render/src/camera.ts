/** Babylon right-handed orbit orientation: space north-up; cabin bow-left. */
export const cameraAlpha = (heading: number, interior: boolean, orbit = 0) =>
  interior ? Math.PI - heading + orbit : Math.PI / 2;

export const angleDelta = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Wheel input changes a target; presentation converges without overshoot. */
export function easeCameraZoom(current: number, target: number, dt: number) {
  return current + (target - current) * -Math.expm1(-12 * Math.max(0, dt));
}

/** Convert screen intent into the authoritative deck frame using the displayed camera.
 * During a camera transition this remains correct; orbit never rotates the actor/ship. */
export function screenToDeck(
  horizontal: number,
  vertical: number,
  alpha: number,
  heading: number,
) {
  const a = alpha + heading;
  const scale = 1 / Math.max(1, Math.hypot(horizontal, vertical));
  return {
    dx: (horizontal * Math.sin(a) - vertical * Math.cos(a)) * scale,
    dy: (horizontal * Math.cos(a) + vertical * Math.sin(a)) * scale,
  };
}

/** Isometric elevation 35.264 degrees above deck; RPG orbit changes azimuth only. */
export const RPG_BETA = Math.acos(1 / Math.sqrt(3));

/** Local observer preferences are separate from the player's deck/flight cameras. */
export function createObservationCamera() {
  let alpha = 0.45,
    beta = RPG_BETA,
    ratio = 5,
    displayedRatio = 5;
  return {
    reset() {
      alpha = 0.45;
      beta = RPG_BETA;
      ratio = displayedRatio = 5;
    },
    drag(dx: number, dy: number) {
      alpha -= dx * 0.007;
      beta = Math.max(0.12, Math.min(Math.PI - 0.12, beta - dy * 0.005));
    },
    wheel(delta: number) {
      ratio = Math.max(
        1.6,
        Math.min(
          24,
          ratio * Math.exp(Math.max(-300, Math.min(300, delta)) * 0.002),
        ),
      );
    },
    frame(radius: number, dt: number, reducedMotion = false) {
      displayedRatio = reducedMotion
        ? ratio
        : easeCameraZoom(displayedRatio, ratio, dt);
      return { alpha, beta, radius: Math.max(8, radius * displayedRatio) };
    },
  };
}
