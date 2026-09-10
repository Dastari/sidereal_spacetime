/** Each renderer lifetime owns a canvas and WebGL context. Async disposal of an
 * old engine must never release programs belonging to its replacement. */
export function mountEditorCanvas(host: HTMLDivElement, label: string) {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", label);
  host.appendChild(canvas);
  return canvas;
}
