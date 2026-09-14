import { CHARACTER_HAIR_STYLES } from "@sidereal/content/character-components";
import {
  CHARACTER_EXPRESSIONS,
  CHARACTER_FACE_DETAILS,
  CHARACTER_FACIAL_HAIR,
  CHARACTER_FACE_AGES,
  CHARACTER_HAIR_COLORS,
  CHARACTER_EYE_COLORS,
} from "@sidereal/content/appearance";
import {
  resolveCrewAppearance,
  type CrewAppearance,
} from "@sidereal/render/crew/appearance";
import { CanvasUI, palette } from "./toolkit";
import type { Rect } from "./layout";

export const SKIN_TONES = [
  ["Porcelain", "#edc8ad"],
  ["Light", "#e0b899"],
  ["Olive", "#b59976"],
  ["Tan", "#bc8c68"],
  ["Warm", "#bb805e"],
  ["Brown", "#9c6948"],
  ["Deep", "#764e3b"],
  ["Ebony", "#4b312a"],
] as const;
export const HAIR_COLORS = CHARACTER_HAIR_COLORS;
export const EYE_COLORS = CHARACTER_EYE_COLORS;
const colorColumns = (width: number) =>
  Math.max(2, Math.min(8, Math.floor(width / 43)));
/** Measure before clamping menu scroll, including every responsive palette row. */
export function appearanceControlsHeight(width: number) {
  const columns = colorColumns(width);
  return 248 + [SKIN_TONES, EYE_COLORS, HAIR_COLORS].reduce(
    (height, colors) => height + 40 + Math.ceil(colors.length / columns) * 44,
    0,
  );
}
export function drawAppearanceControls(
  ui: CanvasUI,
  r: Rect,
  appearance: CrewAppearance,
  change: (patch: CrewAppearance) => void,
) {
  const look = resolveCrewAppearance(appearance);
  ui.text("Character appearance", r.x, r.y, 20, palette.blue, r.w);
  const width = (r.w - 8) / 2;
  ui.button(
    "crew-bodyType",
    "Body: " + look.bodyType,
    { x: r.x, y: r.y + 38, w: width, h: 34 },
    () => change({ bodyType: look.bodyType === "male" ? "female" : "male" }),
  );
  ui.button(
    "crew-hairStyle",
    "Hair: " + look.hairStyle,
    { x: r.x + width + 8, y: r.y + 38, w: width, h: 34 },
    () =>
      change({
        hairStyle:
          CHARACTER_HAIR_STYLES[
            (CHARACTER_HAIR_STYLES.indexOf(look.hairStyle) + 1) %
              CHARACTER_HAIR_STYLES.length
          ],
      }),
  );
  let y = r.y + 96;
  const faceChoices = [
    ["expression", "Expression", CHARACTER_EXPRESSIONS],
    ["faceDetail", "Face detail", CHARACTER_FACE_DETAILS],
    ["facialHair", "Facial hair", CHARACTER_FACIAL_HAIR],
    ["faceAge", "Age", CHARACTER_FACE_AGES],
  ] as const;
  faceChoices.forEach(([role, title, choices], i) => {
    const x = r.x + (i % 2) * (width + 8);
    const rowY = y + Math.floor(i / 2) * 72;
    ui.text(title, x, rowY, 15, palette.blue, width);
    const values: readonly string[] = choices;
    const value = look[role];
    ui.button(
      `crew-${role}`,
      choiceLabel(value),
      { x, y: rowY + 24, w: width, h: 34 },
      () =>
        change({ [role]: values[(values.indexOf(value) + 1) % values.length] }),
    );
    ui.hits.at(-1)!.label = `${title}: ${choiceLabel(value)}`;
  });
  y += 152;
  for (const [role, title, colors] of [
    ["skin", "Skin tone", SKIN_TONES],
    ["eyes", "Eye color", EYE_COLORS],
    ["hair", "Hair color", HAIR_COLORS],
  ] as const) {
    const selected = colors.find(
      ([, value]) => value === look[role].toLowerCase(),
    );
    ui.text(
      title + ": " + (selected ? selected[0] : look[role]),
      r.x,
      y,
      15,
      palette.blue,
      r.w,
    );
    const columns = colorColumns(r.w);
    const size = (r.w - (columns - 1) * 7) / columns;
    colors.forEach(([name, color], i) => {
      const box = {
        x: r.x + (i % columns) * (size + 7),
        y: y + 28 + Math.floor(i / columns) * 44,
        w: size,
        h: 34,
      };
      const id = `crew-${role}-color-${i}`;
      ui.button(id, "", box, () => change({ [role]: color }), {
        selected: look[role].toLowerCase() === color,
      });
      ui.hits.at(-1)!.label = title + ": " + name;
      ui.ctx.fillStyle = color;
      ui.ctx.fillRect(box.x + 6, box.y + 6, box.w - 12, box.h - 12);
    });
    y += 40 + Math.ceil(colors.length / columns) * 44;
  }
  return y - r.y;
}

function choiceLabel(value: string) {
  if (value === "warpaint") return "War paint";
  if (value === "cyber") return "Cyber markings";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
