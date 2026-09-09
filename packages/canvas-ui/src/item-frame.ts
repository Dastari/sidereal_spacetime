import type { Rect } from "./layout";
import type { CanvasUI } from "./toolkit";

/** Presentation rarity. The server-owned item definition remains the authority. */
export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface ItemRarityPalette {
  label: string;
  edge: string;
  bright: string;
  shade: string;
  glow: string;
  wash: string;
}

/** Common is deliberately neutral silver; blue is reserved for rare equipment. */
export const ITEM_RARITY_PALETTES: Readonly<
  Record<ItemRarity, ItemRarityPalette>
> = {
  common: {
    label: "Common",
    edge: "#9db5d0",
    bright: "#e3ecfa",
    shade: "#31485f",
    glow: "rgba(159,186,221,0.28)",
    wash: "rgba(157,181,208,0.08)",
  },
  uncommon: {
    label: "Uncommon",
    edge: "#33e894",
    bright: "#b4ffdc",
    shade: "#12573e",
    glow: "rgba(26,235,137,0.48)",
    wash: "rgba(33,209,117,0.13)",
  },
  rare: {
    label: "Rare",
    edge: "#27cfff",
    bright: "#c1f7ff",
    shade: "#155b93",
    glow: "rgba(0,148,255,0.64)",
    wash: "rgba(0,116,250,0.14)",
  },
  epic: {
    label: "Epic",
    edge: "#c065ff",
    bright: "#f1ccff",
    shade: "#622791",
    glow: "rgba(161,45,255,0.58)",
    wash: "rgba(149,36,222,0.15)",
  },
  legendary: {
    label: "Legendary",
    edge: "#ffcc42",
    bright: "#fff4b0",
    shade: "#786024",
    glow: "rgba(255,193,35,0.58)",
    wash: "rgba(221,156,18,0.15)",
  },
};

export interface ItemFrameOptions {
  rarity: ItemRarity;
  selected?: boolean;
  hovered?: boolean;
  focused?: boolean;
  disabled?: boolean;
  empty?: boolean;
  /** Optional elapsed seconds, supplied only by a caller that permits animation. */
  time?: number;
}

function chamfer(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
) {
  c.beginPath();
  c.moveTo(x + cut, y);
  c.lineTo(x + w - cut, y);
  c.lineTo(x + w, y + cut);
  c.lineTo(x + w, y + h - cut);
  c.lineTo(x + w - cut, y + h);
  c.lineTo(x + cut, y + h);
  c.lineTo(x, y + h - cut);
  c.lineTo(x, y + cut);
  c.closePath();
}

/**
 * Reference-led, clipped-corner equipment chrome. Draw before the item image.
 * The well, narrow dark gutter and second inset remain distinct at a 40 px size.
 * This function creates no hit regions and changes no inventory/game state.
 */
export function drawItemFrame(
  ui: CanvasUI,
  rect: Rect,
  options: ItemFrameOptions,
) {
  if (
    !Number.isFinite(rect.x + rect.y + rect.w + rect.h) ||
    rect.w < 10 ||
    rect.h < 10
  )
    return;
  const c = ui.ctx;
  const p = ITEM_RARITY_PALETTES[options.rarity];
  const unit = Math.min(1.35, Math.max(0.8, Math.min(rect.w, rect.h) / 50));
  const cut = Math.min(9, Math.max(4, Math.min(rect.w, rect.h) * 0.11));
  const x = rect.x + 0.5;
  const y = rect.y + 0.5;
  const w = rect.w - 1;
  const h = rect.h - 1;
  const inset = 3 * unit;
  const innerCut = Math.max(2, cut - inset * 0.58);
  const empty = !!options.empty;
  const active =
    !options.disabled &&
    (options.selected || options.hovered || options.focused);

  c.save();
  // Keep a hotbar halo out of neighbouring slots and numerical labels.
  c.beginPath();
  c.rect(rect.x - 3, rect.y - 3, rect.w + 6, rect.h + 6);
  c.clip();
  const inheritedAlpha = c.globalAlpha;
  if (options.disabled) c.globalAlpha *= 0.46;
  c.lineJoin = "miter";
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 0;

  chamfer(c, x, y, w, h, cut);
  const shell = c.createLinearGradient(x, y, x, y + h);
  shell.addColorStop(0, empty ? "rgba(16,41,68,0.86)" : "rgba(20,40,64,0.97)");
  shell.addColorStop(1, "rgba(3,12,26,0.94)");
  c.fillStyle = shell;
  c.fill();
  c.strokeStyle = empty ? "#274f76" : p.shade;
  c.lineWidth = 1;
  c.stroke();

  // Outer luminous trace, then a dark separation before the second inset trace.
  const rimInset = 1.2 * unit;
  chamfer(
    c,
    x + rimInset,
    y + rimInset,
    w - rimInset * 2,
    h - rimInset * 2,
    cut - rimInset * 0.5,
  );
  c.strokeStyle = empty ? "#35638e" : p.edge;
  c.lineWidth = active ? 1.55 : 1.05;
  if (!empty) {
    c.shadowColor = p.glow;
    c.shadowBlur = active ? 7 : 3;
  }
  c.stroke();
  c.shadowBlur = 0;

  chamfer(c, x + inset, y + inset, w - inset * 2, h - inset * 2, innerCut);
  const well = c.createLinearGradient(x, y, x + w * 0.35, y + h);
  well.addColorStop(0, "rgba(2,12,25,0.94)");
  well.addColorStop(0.55, "rgba(4,15,29,0.96)");
  well.addColorStop(1, empty ? "rgba(6,23,43,0.96)" : p.wash);
  c.fillStyle = well;
  c.fill();
  c.strokeStyle = empty ? "rgba(55,92,126,0.42)" : p.shade;
  c.lineWidth = 1;
  c.stroke();

  // A separate highlight inside the inset: the reference's paired chiseled edge.
  if (!empty) {
    const a = inset + 1.55 * unit;
    const b = Math.max(2, cut - a * 0.45);
    chamfer(c, x + a, y + a, w - a * 2, h - a * 2, b);
    const inner = c.createLinearGradient(x, y, x + w, y + h);
    inner.addColorStop(0, p.edge);
    inner.addColorStop(0.28, p.shade);
    inner.addColorStop(0.7, p.shade);
    inner.addColorStop(1, p.edge);
    c.strokeStyle = inner;
    c.lineWidth = 0.8;
    c.stroke();

    // Two opposed beveled corner shoulders catch the light without a broad blur.
    const shoulder = Math.min(12 * unit, w * 0.2, h * 0.2);
    const aX = x + rimInset,
      aY = y + rimInset;
    const bX = x + w - rimInset,
      bY = y + h - rimInset;
    const bevel = cut - rimInset * 0.5;
    c.beginPath();
    c.moveTo(aX, aY + bevel + shoulder);
    c.lineTo(aX, aY + bevel);
    c.lineTo(aX + bevel, aY);
    c.lineTo(aX + bevel + shoulder, aY);
    c.moveTo(bX, bY - bevel - shoulder);
    c.lineTo(bX, bY - bevel);
    c.lineTo(bX - bevel, bY);
    c.lineTo(bX - bevel - shoulder, bY);
    c.strokeStyle = active ? "#f4fcff" : p.bright;
    c.lineWidth = active ? 1.7 : 1.35;
    c.stroke();
  } else {
    // Quiet empty-slot diagonals stop well before the inset, like the references.
    const d = Math.min(w, h) * 0.25;
    c.beginPath();
    c.moveTo(x + w / 2 - d, y + h / 2 - d);
    c.lineTo(x + w / 2 + d, y + h / 2 + d);
    c.moveTo(x + w / 2 + d, y + h / 2 - d);
    c.lineTo(x + w / 2 - d, y + h / 2 + d);
    c.strokeStyle = "rgba(51,99,142,0.34)";
    c.lineWidth = 0.8;
    c.stroke();
  }

  if (options.selected && !options.disabled) {
    // Colour remains the item's rarity; selection is also indicated by a bright tab.
    const tab = Math.min(16, w * 0.3);
    c.fillStyle = p.bright;
    c.globalAlpha *=
      options.time === undefined
        ? 1
        : 0.88 + Math.sin(options.time * 2.5) * 0.12;
    c.fillRect(x + (w - tab) / 2, y + h - 2.4 * unit, tab, 1.5 * unit);
  }
  if (options.focused && !options.disabled) {
    c.globalAlpha = inheritedAlpha;
    c.setLineDash([3, 2]);
    chamfer(c, x - 1.5, y - 1.5, w + 3, h + 3, cut + 0.5);
    c.strokeStyle = "#f4fcff";
    c.lineWidth = 1;
    c.stroke();
  }
  c.restore();
}
