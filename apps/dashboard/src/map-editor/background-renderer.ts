/** One in-flight frame and one replaceable pending view. Keep showing the last
 * completed frame while images/worker work are pending; never clear on input. */
export function backgroundRenderer<View, Frame>(
  prepare: (view: View) => Promise<Frame>,
  send: (frame: Frame) => void,
  paint: (frame: Frame, pixels: Uint8ClampedArray) => void,
) {
  let pending: View | undefined;
  let current: Frame | undefined;
  let busy = false;
  let disposed = false;
  async function next() {
    if (disposed || busy || pending === undefined) return;
    const view = pending;
    pending = undefined;
    busy = true;
    try {
      const frame = await prepare(view);
      if (disposed) return;
      // Skip a camera view superseded while its images were loading.
      if (pending !== undefined) {
        busy = false;
        void next();
        return;
      }
      current = frame;
      send(frame);
    } catch {
      busy = false;
      current = undefined;
      void next();
    }
  }
  return {
    update(view: View) {
      if (disposed) return;
      pending = view;
      void next();
    },
    complete(pixels: Uint8ClampedArray) {
      if (disposed || current === undefined) return;
      paint(current, pixels);
      current = undefined;
      busy = false;
      void next();
    },
    dispose() {
      disposed = true;
      pending = undefined;
      current = undefined;
    },
  };
}
