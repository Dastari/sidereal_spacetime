/** Actual canvas appearance controls; offline fixture, no account or world writes. */
import { CanvasUI, palette } from "../../packages/canvas-ui/src/toolkit";
import {
  drawAppearanceControls,
  appearanceControlsHeight,
} from "../../packages/canvas-ui/src/appearance-controls";
import {
  mergeCrewAppearance,
  type CrewAppearance,
} from "@sidereal/render/crew/appearance";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-condensed/600.css";
const canvas = document.createElement("canvas");
canvas.style.cssText =
  "position:fixed;inset:0;width:100%;height:100%;display:block";
canvas.tabIndex = 0;
document.body.style.margin = "0";
document.body.style.background = "#080f18";
document.body.appendChild(canvas);
const ui = new CanvasUI(canvas, undefined, {
  label:
    "Crew appearance review. Provisional. Scroll for colours. F6 focuses controls.",
});
let appearance: CrewAppearance = {
  bodyType: "female",
  hairStyle: "groom.twin_tails",
  equippedComponents: {},
};
let scroll = 0;
ui.draw = () => {
  const width = Math.min(430, ui.width - 40);
  const viewport = { x: 20, y: 48, w: width, h: ui.height - 68 };
  ui.text("Provisional crew review", 20, 15, 15, palette.orange, width);
  scroll = Math.max(
    0,
    Math.min(scroll, appearanceControlsHeight(width) - viewport.h),
  );
  ui.scrollRegion(viewport, () =>
    drawAppearanceControls(
      ui,
      { ...viewport, y: viewport.y - scroll },
      appearance,
      (patch) => {
        appearance = mergeCrewAppearance(appearance, patch);
        ui.invalidate();
      },
    ),
  );
};
ui.scroll = (delta) => {
  scroll += delta;
  ui.invalidate();
};
ui.paint();
Object.assign(window, {
  __appearance: {
    snapshot: () => ({
      appearance,
      scroll,
      controls: ui.hits.map(({ id, label, rect }) => ({ id, label, rect })),
    }),
    scroll: (next: number) => {
      scroll = next;
      ui.invalidate();
    },
  },
});
