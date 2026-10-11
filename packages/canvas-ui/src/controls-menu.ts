import { type CanvasUI, palette } from "./toolkit";
import type { Rect } from "./layout";
import { type SteeringStyle, STEERING_DEFAULT } from "./control-settings";
export const STEERING_CONTROLS_HEIGHT = 172;
/** Shared game setting; features supply state and intent callbacks, never custom controls. */
export function drawSteeringControls(
  ui: CanvasUI,
  rect: Rect,
  style: SteeringStyle = STEERING_DEFAULT,
  change?: (style: SteeringStyle) => void,
) {
  ui.text("Ship and EVA steering", rect.x, rect.y, 18, palette.text, rect.w);
  ["cursor", "keyboard"].forEach((value, i) =>
    ui.button(
      "steering-" + value,
      value === "cursor" ? "Cursor following" : "WASD steering",
      { ...rect, y: rect.y + 30 + i * 44, h: 36 },
      () => change?.(value as SteeringStyle),
      { selected: style === value, disabled: !change },
    ),
  );
  ui.paragraph(
    style === "cursor"
      ? "Point to steer. W/S forward/reverse. EVA A/D strafe; helm A/D overrides the cursor."
      : "A/D rotate. W/S forward/reverse. EVA Shift+A/D strafe.",
    { ...rect, y: rect.y + 120, h: 46 },
    13,
    palette.muted,
  );
}
