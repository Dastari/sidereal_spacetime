import type { RenderBackend, RenderBackendSnapshot } from "../../render/src/render-backend";
import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
export interface RenderBackendControls {
  state: RenderBackendSnapshot;
  set(value: RenderBackend): void;
  apply(): void;
}
export const RENDER_BACKEND_MENU_HEIGHT = 190;
export function drawRenderBackendMenu(ui: CanvasUI, r: Rect, controls?: RenderBackendControls) {
  ui.text("Renderer", r.x, r.y, 17, palette.blue);
  if (!controls) {
    ui.text("Renderer controls unavailable", r.x, r.y + 30, 13, palette.muted, r.w);
    return;
  }
  const width = (r.w - 6) / 2;
  (["webgl", "webgpu"] as const).forEach((backend, i) => ui.button(
    "graphics-renderer-" + backend, backend === "webgl" ? "WebGL" : "WebGPU (experimental)",
    {x:r.x+i*(width+6),y:r.y+30,w:width,h:34}, () => controls.set(backend),
    {selected:controls.state.requested === backend},
  ));
  ui.text(`Active: ${controls.state.active === "webgpu" ? "WebGPU" : "WebGL"}`, r.x, r.y+78, 13, palette.muted, r.w);
  if (controls.state.reason) ui.paragraph(controls.state.reason, {...r,y:r.y+101,h:36}, 13);
  if (controls.state.reloadRequired) ui.button("graphics-renderer-apply", "Reload game to apply",
    {...r,y:r.y+143,h:34}, controls.apply);
}
