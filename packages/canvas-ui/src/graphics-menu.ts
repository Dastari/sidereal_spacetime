import {
  drawAntialiasingMenu,
  ANTIALIASING_MENU_HEIGHT,
  type AntialiasingControls,
} from "./antialiasing-menu";
import {
  LOCAL_LIGHT_LIMITS,
  type LocalLightLimit,
} from "@sidereal/render/local-light-budget";
import {
  GRAPHICS_DEFAULTS,
  GRAPHICS_RANGES,
  type GraphicsSettings,
} from "@sidereal/render/graphics-settings";
import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
export function drawGraphicsMenu(
  ui: CanvasUI,
  r: Rect,
  settings: GraphicsSettings | undefined,
  set: ((patch: Partial<GraphicsSettings>) => void) | undefined,
  reset: (() => void) | undefined,
  localLimit: LocalLightLimit = "all",
  setLocalLimit?: (limit: LocalLightLimit) => void,
  antialiasing?: AntialiasingControls,
) {
  ui.text("Graphics", r.x, r.y, 22, palette.blue);
  ui.paragraph(
    "Adjust the game image. Saved on this device.",
    { ...r, y: r.y + 33, h: 40 },
    14,
  );
  const value = settings ?? GRAPHICS_DEFAULTS;
  (Object.keys(GRAPHICS_DEFAULTS) as (keyof GraphicsSettings)[]).forEach(
    (key, i) => {
      const [lo, hi] = GRAPHICS_RANGES[key];
      ui.slider(
        "graphics-" + key,
        key[0].toUpperCase() + key.slice(1),
        (value[key] - lo) / (hi - lo),
        { ...r, y: r.y + 83 + i * 68, h: 53 },
        (v) => set?.({ [key]: Math.round((lo + v * (hi - lo)) * 100) / 100 }),
        `${Math.round(value[key] * 100)}%`,
      );
    },
  );
  ui.text("Local lights", r.x, r.y + 371, 17, palette.blue);
  const width = (r.w - 25) / 6;
  LOCAL_LIGHT_LIMITS.forEach((limit, i) =>
    ui.button(
      "graphics-local-lights-" + limit,
      limit === "all" ? "All" : limit === 0 ? "Off" : String(limit),
      { x: r.x + i * (width + 5), y: r.y + 400, w: width, h: 34 },
      () => setLocalLimit?.(limit),
      { selected: localLimit === limit, disabled: !setLocalLimit },
    ),
  );
  ui.paragraph(
    "Cabin and equipment lights. Sun and planet lighting stay separate.",
    { ...r, y: r.y + 447, h: 42 },
    13,
  );
  drawAntialiasingMenu(ui, { ...r, y: r.y + 505 }, antialiasing);
  ui.button(
    "graphics-reset",
    "Reset graphics",
    { ...r, y: r.y + 505 + ANTIALIASING_MENU_HEIGHT, h: 38 },
    () => reset?.(),
    {
      disabled:
        !reset ||
        (Object.values(value).every((v) => v === 1) &&
          localLimit === "all" &&
          (!antialiasing ||
            (antialiasing.state.requested.mode === "msaa" &&
              antialiasing.state.requested.samples === 4))),
    },
  );
  if (!set)
    ui.text(
      "Graphics controls unavailable",
      r.x,
      r.y + 550,
      13,
      palette.muted,
      r.w,
    );
}

export const GRAPHICS_MENU_HEIGHT = 570 + ANTIALIASING_MENU_HEIGHT;
