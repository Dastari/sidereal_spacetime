import type {
  AntialiasingSettings,
  AntialiasingSnapshot,
} from "@sidereal/render/antialiasing-settings";
import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
export interface AntialiasingControls {
  state: AntialiasingSnapshot;
  set(patch: Partial<AntialiasingSettings>): void;
}
export const ANTIALIASING_MENU_HEIGHT = 340;
/** Optional extra Graphics panel. Requested and actual fallback remain distinct. */
export function drawAntialiasingMenu(
  ui: CanvasUI,
  r: Rect,
  controls?: AntialiasingControls,
) {
  ui.text("Antialiasing", r.x, r.y, 17, palette.blue);
  if (!controls) {
    ui.text(
      "Antialiasing controls unavailable",
      r.x,
      r.y + 30,
      13,
      palette.muted,
      r.w,
    );
    return;
  }
  const { state, set } = controls;
  const modes = [
    ["off", "Off"],
    ["msaa", "MSAA"],
    ["fxaa", "FXAA"],
    ["taa", "TAA"],
    ["msaa-fxaa", "MSAA + FXAA"],
    ["ssaa", "SSAA / FSAA"],
  ] as const;
  const width = (r.w - 6) / 2;
  modes.forEach(([mode, label], i) =>
    ui.button(
      "graphics-aa-" + mode,
      label,
      {
        x: r.x + (i % 2) * (width + 6),
        y: r.y + 30 + Math.floor(i / 2) * 38,
        w: width,
        h: 32,
      },
      () => set({ mode }),
      { selected: state.requested.mode === mode },
    ),
  );
  ui.text("MSAA samples", r.x, r.y + 157, 14, palette.muted);
  ([2, 4, 8] as const).forEach((samples, i) =>
    ui.button(
      "graphics-aa-samples-" + samples,
      samples + "×",
      { x: r.x + (i * (r.w + 6)) / 3, y: r.y + 179, w: (r.w - 12) / 3, h: 30 },
      () => set({ samples }),
      {
        selected: state.requested.samples === samples,
        disabled:
          state.requested.mode !== "msaa" &&
          state.requested.mode !== "msaa-fxaa",
      },
    ),
  );
  const effective = state.effective;
  const actual =
    effective.mode === "off"
      ? "Off"
      : effective.mode === "ssaa"
        ? "SSAA · 2× each axis / 4× pixels"
        : effective.mode === "msaa" || effective.mode === "msaa-fxaa"
          ? `${effective.samples}× MSAA${effective.fxaa ? " + FXAA" : ""}`
          : effective.mode.toUpperCase();
  ui.text(
    state.pending ? "Preparing antialiasing…" : `Active: ${actual}`,
    r.x,
    r.y + 226,
    13,
    palette.muted,
    r.w,
  );
  ui.paragraph(
    state.error ??
      effective.reason ??
      (state.requested.mode === "ssaa"
        ? "Full-scene supersampling renders at twice the width and height. Higher GPU cost; display scale stays unchanged."
        : state.requested.mode === "taa"
          ? "Temporal smoothing uses motion history. Camera and scene changes reset that history."
          : "MSAA smooths geometry edges; FXAA also smooths the completed image. Higher samples use more GPU time."),
    { ...r, y: r.y + 252, h: 80 },
    13,
  );
}
