import type { GroundItemLabel } from "@sidereal/render/ground-items";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import { itemRarity } from "./character-data";
import { ITEM_RARITY_PALETTES } from "./item-frame";
import type { CanvasUI } from "./toolkit";
import { drawItemTooltip } from "./item-details";
import { drawInventoryIcon } from "./inventory";
const menus = new WeakMap<CanvasUI, { itemId: string; x: number; y: number }>();
export function dismissGroundLootMenu(ui: CanvasUI) {
  menus.delete(ui);
  if (ui.focus.startsWith("ground-menu-")) {
    ui.focus = "";
    ui.keyboard = false;
  }
}
/** Label visibility is a local preference, never a permission or discovery rule. */
export function drawGroundLoot(
  ui: CanvasUI,
  rows: readonly GroundItemLabel[],
  pickup: (id: string) => void,
  pending: boolean,
  equipment?: { equip?: (id: string) => void; backpackEquipped?: boolean },
) {
  const closeMenu = () => {
    menus.delete(ui);
    ui.focus = "";
    ui.keyboard = false;
    ui.invalidate();
  };
  if (!ui.focus.startsWith("ground-menu-")) menus.delete(ui);
  const used: { x: number; y: number; w: number; h: number }[] = [];
  let hover:
    | {
        d: (typeof INVENTORY_DEFINITIONS)[number];
        r: { x: number; y: number; w: number; h: number };
      }
    | undefined;
  let overflow = 0;
  for (const row of rows) {
    const d = INVENTORY_DEFINITIONS.find((d) => d.id === row.definitionId);
    if (!d) continue;
    const point = { x: row.x / ui.scale, y: row.y / ui.scale };
    if (point.x < 0 || point.x > ui.width || point.y < 0 || point.y > ui.height)
      continue;
    const color = ITEM_RARITY_PALETTES[itemRarity(d.id)];
    const w = Math.min(
      228,
      ui.width - 16,
      Math.max(142, d.name.length * 6 + 30),
    );
    const anchorX = Math.max(8, Math.min(point.x - w / 2, ui.width - w - 8));
    const anchorY = Math.max(55, Math.min(point.y - 24, ui.height - 130));
    let r: { x: number; y: number; w: number; h: number } | undefined;
    placement: for (
      let column = 0;
      column <= Math.ceil(ui.width / (w + 6));
      column++
    )
      for (const direction of column ? [-1, 1] : [0])
        for (let step = 0; step <= Math.ceil(ui.height / 30); step++)
          for (const vertical of step ? [-1, 1] : [0]) {
            const box = {
              x: anchorX + column * direction * (w + 6),
              y: anchorY + step * vertical * 30,
              w,
              h: 26,
            };
            if (
              box.x < 8 ||
              box.x + w > ui.width - 8 ||
              box.y < 55 ||
              box.y + 26 > ui.height - 104
            )
              continue;
            if (
              !used.some(
                (b) =>
                  box.x < b.x + b.w + 3 &&
                  box.x + w + 3 > b.x &&
                  box.y < b.y + b.h + 3 &&
                  box.y + 29 > b.y,
              )
            ) {
              r = box;
              break placement;
            }
          }
    if (!r) {
      overflow++;
      continue;
    }
    used.push(r);
    const c = ui.ctx;
    c.save();
    c.strokeStyle = color.edge;
    c.shadowColor = color.edge;
    c.shadowBlur = 9;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(point.x, point.y + 12);
    c.lineTo(r.x + r.w / 2, r.y + r.h);
    c.stroke();
    c.fillStyle = "rgba(2,17,37,.88)";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ui.text(
      d.name.toUpperCase(),
      r.x + 10,
      r.y + 6,
      12,
      color.bright,
      r.w - 20,
    );
    c.restore();
    const id = "ground-pickup-" + row.id;
    ui.hits.push({
      id,
      label: `${d.name}: ${row.reachable ? "pick up" : "move closer to pick up"}`,
      rect: r,
      disabled: pending || !row.reachable,
      action: () => {
        closeMenu();
        pickup(row.id);
      },
      ...(d.equipSlot === "back" && equipment?.equip
        ? {
            context: (event: { x: number; y: number }) => {
              menus.set(ui, { itemId: row.id, x: event.x, y: event.y });
              ui.focus = "ground-menu-equip";
              ui.keyboard = true;
              ui.invalidate();
            },
          }
        : {}),
    });
    if (ui.hover === id) hover = { d, r };
  }
  if (overflow)
    ui.text(
      `+${overflow} more nearby · collect items to reveal`,
      12,
      ui.height - 99,
      11,
      "#8cd9ec",
    );
  const menu = menus.get(ui);
  const target = menu && rows.find((row) => row.id === menu.itemId);
  if (menu && target && equipment?.equip) {
    const r = {
      x: Math.max(8, Math.min(menu.x, ui.width - 226)),
      y: Math.max(8, Math.min(menu.y, ui.height - 130)),
      w: 218,
      h: 122,
    };
    ui.panel(r, true);
    const disabled = pending || !target.reachable;
    ui.button(
      "ground-menu-equip",
      equipment.backpackEquipped ? "Swap backpack" : "Equip backpack",
      { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: 30 },
      () => {
        closeMenu();
        equipment.equip!(target.id);
      },
      { disabled },
    );
    ui.button(
      "ground-menu-pickup",
      "Pick up",
      { x: r.x + 8, y: r.y + 46, w: r.w - 16, h: 30 },
      () => {
        closeMenu();
        pickup(target.id);
      },
      { disabled },
    );
    ui.button(
      "ground-menu-cancel",
      "Cancel",
      { x: r.x + 8, y: r.y + 84, w: r.w - 16, h: 30 },
      closeMenu,
    );
  } else {
    dismissGroundLootMenu(ui);
    if (hover) drawItemTooltip(ui, hover.d, hover.r, drawInventoryIcon);
  }
}
