import { CHARACTER_HAIR_STYLES } from "@sidereal/content/character-components";
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
export const HAIR_COLORS = [
  ["Black", "#211c20"],
  ["Dark brown", "#3b2823"],
  ["Chestnut", "#75422c"],
  ["Auburn", "#a55232"],
  ["Blonde", "#d1aa64"],
  ["Platinum", "#dfded5"],
  ["Silver", "#909baa"],
  ["Teal", "#2a8c95"],
] as const;
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
  for (const [role, title, colors] of [
    ["skin", "Skin tone", SKIN_TONES],
    ["hair", "Hair color", HAIR_COLORS],
  ] as const) {
    const selected = colors.find(
      ([, value]) => value === look[role].toLowerCase(),
    );
    ui.text(
      title + (selected ? " · " + selected[0] : ""),
      r.x,
      y,
      15,
      palette.blue,
      r.w,
    );
    const columns = Math.max(2, Math.min(8, Math.floor(r.w / 43)));
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
    y += 48 + Math.ceil(colors.length / columns) * 44;
  }
  return y - r.y;
}
