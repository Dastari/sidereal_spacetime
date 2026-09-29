import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
import { drawItemFrame, ITEM_RARITY_PALETTES } from "./item-frame";
import { drawHudIcon, type HudIconKind } from "./hud-icons";
import { itemRarity } from "./character-data";
import type { InventoryDefinition } from "../../content/src/inventory";

const STATUS_EDGE = 16,
  STATUS_WIDTH = 233,
  STATUS_GAP = 12,
  /** Narrowest action bar kept beside the status panel (47 px slots). */
  MIN_BESIDE_BAR = 560;
const statusWidth = (width: number) => Math.min(STATUS_WIDTH, width - 32);
/** The action bar is centred; when the centred bar would run into the
 * bottom-left player status it starts after it (narrowing to fit), and only
 * narrow screens keep it centred with the status stacked above. */
export function actionBarRect(width: number, height: number): Rect {
  const full = Math.min(710, width - 24),
    centred = (width - full) / 2,
    reserve = STATUS_EDGE + statusWidth(width) + STATUS_GAP,
    beside = Math.min(710, width - reserve - 12);
  if (centred >= reserve || beside < MIN_BESIDE_BAR)
    return { x: centred, y: height - 97, w: full, h: 87 };
  return { x: reserve, y: height - 97, w: beside, h: 87 };
}
export const PLAYER_STATUS_HEIGHT = 150;
/** Player status (name, vitals) sits bottom-left beside the action bar, sharing
 * its bottom edge; on narrow screens it stacks above the bar instead. */
export function playerStatusRect(width: number, height: number): Rect {
  const bar = actionBarRect(width, height),
    w = statusWidth(width);
  return bar.x >= STATUS_EDGE + w + STATUS_GAP
    ? {
        x: STATUS_EDGE,
        y: bar.y + bar.h - PLAYER_STATUS_HEIGHT,
        w,
        h: PLAYER_STATUS_HEIGHT,
      }
    : {
        x: STATUS_EDGE,
        y: Math.max(70, bar.y - STATUS_GAP - PLAYER_STATUS_HEIGHT),
        w,
        h: PLAYER_STATUS_HEIGHT,
      };
}
type Entry =
  | { id: string; definition: InventoryDefinition; equipped: boolean }
  | undefined;
/** Eight action positions and two distinct quick-item positions. Only assigned
 * server slots invoke action intents; future slots stay explicitly disabled. */
export function drawActionBar(
  ui: CanvasUI,
  r: Rect,
  options: {
    entries: Entry[];
    quick: Entry[];
    pending: boolean;
    assign: boolean;
    icon: (ui: CanvasUI, d: InventoryDefinition, r: Rect) => void;
    activate: (index: number) => void;
    clear: (index: number) => void;
    activateQuick: (index: number) => void;
  },
) {
  const gap = 5,
    size = Math.max(18, Math.min(62, (r.w - 86) / 10));
  const mainW = 8 * size + 7 * gap + 18,
    quickX = r.x + mainW + 10,
    quickW = 2 * size + gap + 18;
  const main = { x: r.x, y: r.y, w: mainW, h: r.h },
    quick = { x: quickX, y: r.y, w: quickW, h: r.h };
  ui.panel(main, true);
  ui.panel(quick, true);
  ui.text("ACTION BAR", main.x + 10, main.y + 6, 10, palette.blue);
  ui.text(
    "QUICK SLOTS",
    quick.x + 9,
    quick.y + 6,
    9,
    palette.blue,
    quick.w - 16,
  );
  const glyphs: HudIconKind[] = [
    "dash",
    "crosshair",
    "shield",
    "scan",
    "medkit",
    "emp",
    "gear",
    "bolt",
  ];
  function cell(entry: Entry, box: Rect, index: number, isQuick = false) {
    const id = isQuick ? "quick-slot-" + index : "tool-" + index,
      key = isQuick ? (index ? "0" : "9") : String(index + 1);
    const disabled = options.pending || (!isQuick && index >= 5);
    drawItemFrame(ui, box, {
      rarity: entry ? itemRarity(entry.definition.id) : "common",
      selected: entry?.equipped,
      hovered: ui.hover === id,
      focused: ui.focus === id,
      disabled,
      empty: !entry,
    });
    if (entry)
      options.icon(ui, entry.definition, {
        x: box.x + 7,
        y: box.y + 9,
        w: box.w - 14,
        h: box.h - 15,
      });
    else if (!isQuick && index < 5) {
      ui.ctx.save();
      ui.ctx.globalAlpha = 0.75;
      drawHudIcon(
        ui,
        {
          x: box.x + size * 0.28,
          y: box.y + size * 0.23,
          w: size * 0.44,
          h: size * 0.44,
        },
        glyphs[index],
        { color: palette.blue },
      );
      ui.ctx.restore();
      if (size >= 40)
        ui.text(
          "ASSIGN",
          box.x + 6,
          box.y + box.h - 13,
          8,
          palette.muted,
          box.w - 12,
        );
    }
    ui.text(key, box.x + 5, box.y + 3, 10, disabled ? "#62809c" : palette.text);
    if (entry?.equipped)
      ui.text("◆", box.x + box.w - 13, box.y + box.h - 15, 10, palette.blue);
    const label = isQuick
      ? `${key}: ${entry?.definition.name ?? "empty quick slot"}; ${options.assign ? "bind selected item" : "inspect item"}`
      : `${key}: ${entry?.definition.name ?? (index >= 5 ? "reserved action slot" : "unassigned action")}${options.assign && index < 5 ? "; assign selected item" : ""}`;
    ui.hits.push({
      id,
      label:
        label +
        (entry
          ? " · " + ITEM_RARITY_PALETTES[itemRarity(entry.definition.id)].label
          : ""),
      rect: box,
      disabled,
      action: () =>
        isQuick ? options.activateQuick(index) : options.activate(index),
    });
    if (options.assign && entry && !isQuick && index < 5)
      ui.button(
        "clear-tool-" + index,
        "×",
        { x: box.x + box.w - 15, y: box.y + box.h - 16, w: 15, h: 15 },
        () => options.clear(index),
        { disabled: options.pending },
      );
  }
  for (let i = 0; i < 8; i++)
    cell(
      options.entries[i],
      { x: main.x + 9 + i * (size + gap), y: main.y + 21, w: size, h: size },
      i,
    );
  for (let i = 0; i < 2; i++)
    cell(
      options.quick[i],
      { x: quick.x + 9 + i * (size + gap), y: quick.y + 21, w: size, h: size },
      i,
      true,
    );
}
