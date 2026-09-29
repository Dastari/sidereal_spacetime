import {
  RENDER_BACKEND_CHOICES,
  renderBackendLabel,
  type RenderBackendChoice,
  type RenderBackendSnapshot,
} from "@sidereal/render/render-backend";
import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
export interface RenderBackendControls {
  state: RenderBackendSnapshot;
  set(value: RenderBackendChoice): void;
  apply(): void;
}
export const RENDER_BACKEND_MENU_HEIGHT = 190;
/** Height used by the compact F3 (Visuals tab) variant. */
export const RENDER_BACKEND_COMPACT_HEIGHT = 158;

/** "WebGPU", or "WebGL2 (Auto)" style readout of the active backend and the preference. */
export function renderBackendReadout(state: RenderBackendSnapshot) {
  const active = renderBackendLabel(state.active);
  return state.requested === state.active
    ? active
    : `${active} (${renderBackendLabel(state.requested)})`;
}

/**
 * Auto / WebGPU / WebGL2 device preference. Selecting saves it; a different backend needs
 * a fresh canvas, so applying is an explicit reload. `compact` is the F3 layout, whose
 * scroll viewport registers only hit regions it fully contains (`visible`).
 */
export function drawRenderBackendMenu(
  ui: CanvasUI,
  r: Rect,
  controls?: RenderBackendControls,
  options: { compact?: boolean; visible?: (b: Rect) => boolean } = {},
) {
  const compact = !!options.compact;
  const visible = options.visible ?? (() => true);
  if (compact) ui.text("RENDERER", r.x, r.y, 11, palette.muted, r.w);
  else ui.text("Renderer", r.x, r.y, 17, palette.blue);
  if (!controls) {
    ui.text(
      "Renderer controls unavailable",
      r.x,
      r.y + 30,
      13,
      palette.muted,
      r.w,
    );
    return;
  }
  const top = r.y + (compact ? 22 : 30);
  const h = compact ? 28 : 34;
  const width = (r.w - 12) / 3;
  RENDER_BACKEND_CHOICES.forEach((backend, i) => {
    const b = { x: r.x + i * (width + 6), y: top, w: width, h };
    if (!visible(b)) return;
    ui.button(
      "graphics-renderer-" + backend,
      renderBackendLabel(backend),
      b,
      () => controls.set(backend),
      { selected: controls.state.requested === backend },
    );
  });
  const infoY = top + h + (compact ? 10 : 14);
  ui.text(
    `Active: ${renderBackendReadout(controls.state)}`,
    r.x,
    infoY,
    compact ? 12 : 13,
    palette.blue,
    r.w,
  );
  if (controls.state.reason)
    ui.paragraph(
      controls.state.reason,
      { ...r, y: infoY + 20, h: 36 },
      compact ? 11 : 13,
    );
  if (controls.state.reloadRequired) {
    const b = { ...r, y: infoY + (compact ? 60 : 65), h };
    if (visible(b))
      ui.button(
        "graphics-renderer-apply",
        "Reload game to apply",
        b,
        controls.apply,
      );
  }
}
