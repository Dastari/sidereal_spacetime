import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
import { drawItemFrame, ITEM_RARITY_PALETTES } from "./item-frame";
import { drawHudIcon, type HudIconKind } from "./hud-icons";
import { itemRarity } from "./character-data";
import type { InventoryDefinition } from "../../content/src/inventory";

export function actionBarRect(width: number, height: number): Rect {
  const w = Math.min(710, width - 24);
  return { x: (width - w) / 2, y: height - 97, w, h: 87 };
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
