/** DOM is only a GPU mount. Chrome, text and interaction are painted by CanvasUI. */
export function mountCanvasOverlay(label: string, covered?: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:10000;display:block;touch-action:none";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", label);
  const previous = document.activeElement as HTMLElement | null;
  const wasInert = covered?.inert ?? false;
  if (covered) covered.inert = true;
  document.body.appendChild(canvas);
  canvas.focus();
  let disposed = false;
  return {
    canvas,
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.remove();
      if (covered) covered.inert = wasInert;
      if (previous?.isConnected) previous.focus();
    },
  };
}
