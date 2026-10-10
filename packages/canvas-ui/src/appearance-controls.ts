import { CHARACTER_HAIR_STYLES } from "@sidereal/content/character-components";
import {
  CHARACTER_EXPRESSIONS,
  CHARACTER_FACE_DETAILS,
  CHARACTER_FACIAL_HAIR,
  CHARACTER_FACE_AGES,
  CHARACTER_FACE_VARIANTS,
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
const HAIR_PAGE_SIZE = 8;
const controlState = new WeakMap<
  CanvasUI,
  {
    page: number;
    colors: Partial<
      Record<"skin" | "eyes" | "hair", { accepted: string; draft: string }>
    >;
  }
>();
const colorColumns = (width: number) =>
  Math.max(2, Math.min(8, Math.floor(width / 43)));
/** Measure before clamping menu scroll, including every responsive palette row. */
export function appearanceControlsHeight(width: number) {
  const columns = colorColumns(width);
  return (
    544 +
    [SKIN_TONES, EYE_COLORS, HAIR_COLORS].reduce(
      (height, colors) => height + 84 + Math.ceil(colors.length / columns) * 44,
      0,
    )
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
    "Hair: " + hairLabel(look.hairStyle),
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
  let state = controlState.get(ui);
  if (!state) {
    state = {
      page: Math.floor(
        Math.max(0, CHARACTER_HAIR_STYLES.indexOf(look.hairStyle)) /
          HAIR_PAGE_SIZE,
      ),
      colors: {},
    };
    controlState.set(ui, state);
  }
  let y = r.y + 96;
  ui.text("Hairstyles for every body", r.x, y, 15, palette.blue, r.w);
  const pages = Math.ceil(CHARACTER_HAIR_STYLES.length / HAIR_PAGE_SIZE);
  const pageState = state;
  for (let i = 0; i < HAIR_PAGE_SIZE; i++) {
    const style = CHARACTER_HAIR_STYLES[state.page * HAIR_PAGE_SIZE + i];
    if (!style) break;
    ui.button(
      `crew-hair-choice-${style}`,
      hairLabel(style),
      {
        x: r.x + (i % 2) * (width + 8),
        y: y + 26 + Math.floor(i / 2) * 38,
        w: width,
        h: 34,
      },
      () => change({ hairStyle: style }),
      { selected: style === look.hairStyle },
    );
    ui.hits.at(-1)!.label = `Hairstyle: ${hairLabel(style)}`;
  }
  ui.button(
    "crew-hair-previous",
    "Previous",
    { x: r.x, y: y + 182, w: width, h: 34 },
    () => {
      pageState.page = (pageState.page + pages - 1) % pages;
    },
  );
  ui.button(
    "crew-hair-next",
    `Next (${state.page + 1}/${pages})`,
    { x: r.x + width + 8, y: y + 182, w: width, h: 34 },
    () => {
      pageState.page = (pageState.page + 1) % pages;
    },
  );
  y += 224;
  const faceChoices = [
    ["expression", "Expression", CHARACTER_EXPRESSIONS],
    ["faceDetail", "Face detail", CHARACTER_FACE_DETAILS],
    ["facialHair", "Facial hair", CHARACTER_FACIAL_HAIR],
    ["faceAge", "Age", CHARACTER_FACE_AGES],
    ["faceVariant", "Face shape", CHARACTER_FACE_VARIANTS],
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
  y += 224;
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
    const inputY = y + 28 + Math.ceil(colors.length / columns) * 44;
    let colorState = state.colors[role];
    if (!colorState || colorState.accepted !== look[role].toLowerCase()) {
      colorState = {
        accepted: look[role].toLowerCase(),
        draft: look[role].toLowerCase(),
      };
      state.colors[role] = colorState;
    }
    const draftState = colorState;
    ui.input(
      `crew-${role}-custom`,
      `${title}: custom RGB hex`,
      draftState.draft,
      { x: r.x, y: inputY, w: r.w, h: 34 },
      (value) => {
        draftState.draft = value;
        if (/^#[0-9a-f]{6}$/i.test(value)) {
          draftState.accepted = value.toLowerCase();
          change({ [role]: draftState.accepted });
        }
      },
      7,
    );
    y += 84 + Math.ceil(colors.length / columns) * 44;
  }
  return y - r.y;
}

function choiceLabel(value: string) {
  if (value === "warpaint") return "War paint";
  if (value === "cyber") return "Cyber markings";
  const faceNames: Record<string, string> = {
    m_classic: "Classic I",
    m_bold: "Bold",
    m_bright: "Bright I",
    f_classic: "Classic II",
    f_bright: "Bright II",
    f_sharp: "Sharp",
  };
  return (
    faceNames[value] ??
    value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
  );
}

function hairLabel(value: string) {
  const name = value.replace(/^(hair|groom)\./, "");
  return choiceLabel(name) + (value.startsWith("groom.") ? " (sculpted)" : "");
}
