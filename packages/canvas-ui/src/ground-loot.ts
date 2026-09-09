import type { GroundItemLabel } from "../../render/src/ground-items";
import { INVENTORY_DEFINITIONS } from "../../content/src/inventory";
import { itemRarity } from "./character-data";
import { ITEM_RARITY_PALETTES } from "./item-frame";
import type { CanvasUI } from "./toolkit";
import { drawItemTooltip } from "./item-details";
import { drawInventoryIcon } from "./inventory";
/** Label visibility is a local preference, never a permission or discovery rule. */
export function drawGroundLoot(
  ui: CanvasUI,
  rows: readonly GroundItemLabel[],
  pickup: (id: string) => void,
  pending: boolean,
) {
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
    ui.text(d.name, r.x + 10, r.y + 6, 12, color.bright, r.w - 20);
    c.restore();
    const id = "ground-pickup-" + row.id;
    ui.hits.push({
      id,
      label: `${d.name}: ${row.reachable ? "pick up" : "move closer to pick up"}`,
      rect: r,
      disabled: pending || !row.reachable,
      action: () => pickup(row.id),
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
  if (hover) drawItemTooltip(ui, hover.d, hover.r, drawInventoryIcon);
}
