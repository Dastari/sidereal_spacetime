/** Presentation-only gate. The caller keeps its existing scheduler and disposal ownership. */
export function createPresentationFrameGate(isSuspended?: () => boolean) {
  let usableFrameDelivered = false;
  return {
    /** Call only after first usable-frame notification has completed. */
    ready() {
      usableFrameDelivered = true;
    },
    wrap(renderFrame: () => void) {
      return () => {
        if (usableFrameDelivered && isSuspended?.()) return;
        renderFrame();
      };
    },
  };
}
