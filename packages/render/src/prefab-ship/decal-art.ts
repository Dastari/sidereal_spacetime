/**
 * Decal masks for prefab ships (docs/shipyard_player_builder_design.md §12.4): white alpha masks
 * drawn on a 2D canvas (text, and procedural emblems: planet ring, skull, crystal, gear). One mask
 * serves every theme; the ink colour is applied by the material.
 */
import type { EmblemId } from "@sidereal/content/ship-prefab";

type Ctx = CanvasRenderingContext2D;

/** Draw a centred text mask filling the canvas with a small margin. */
export function drawTextMask(ctx: Ctx, w: number, h: number, text: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = Math.floor(h * 0.78);
  const font = (s: number) => `800 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  ctx.font = font(size);
  const maxW = w * 0.92;
  const measured = ctx.measureText(text).width;
  if (measured > maxW) size = Math.max(8, Math.floor((size * maxW) / measured));
  ctx.font = font(size);
  ctx.fillText(text.toUpperCase(), w / 2, h / 2 + size * 0.04);
}

function planet(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.35);
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.98, r * 0.3, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Ring gap in front of the planet.
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.8, r * 0.22, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function skull(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.62, Math.PI * 0.9, Math.PI * 2.1);
  ctx.lineTo(cx + r * 0.42, cy + r * 0.45);
  ctx.lineTo(cx - r * 0.42, cy + r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - r * 0.34, cy + r * 0.4, r * 0.68, r * 0.3);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + s * r * 0.25, cy - r * 0.08, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.12);
  ctx.lineTo(cx - r * 0.08, cy + r * 0.28);
  ctx.lineTo(cx + r * 0.08, cy + r * 0.28);
  ctx.closePath();
  ctx.fill();
  for (const s of [-0.17, 0, 0.17]) ctx.fillRect(cx + s * r - r * 0.025, cy + r * 0.45, r * 0.05, r * 0.25);
  ctx.restore();
  // Crossed bones.
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = "round";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.95, cy + s * r * 0.35 + r * 0.55);
    ctx.lineTo(cx + r * 0.95, cy - s * r * 0.35 + r * 0.55);
    ctx.stroke();
  }
}

function crystal(ctx: Ctx, cx: number, cy: number, r: number) {
  const shard = (x: number, y: number, s: number, lean: number) => {
    ctx.beginPath();
    ctx.moveTo(x + lean * s, y - s);
    ctx.lineTo(x + s * 0.32, y - s * 0.35);
    ctx.lineTo(x + s * 0.22, y + s * 0.6);
    ctx.lineTo(x - s * 0.22, y + s * 0.6);
    ctx.lineTo(x - s * 0.32, y - s * 0.35);
    ctx.closePath();
    ctx.fill();
  };
  shard(cx, cy, r * 0.95, 0);
  shard(cx - r * 0.5, cy + r * 0.25, r * 0.6, -0.35);
  shard(cx + r * 0.5, cy + r * 0.25, r * 0.6, 0.35);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = r * 0.04;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.9);
  ctx.lineTo(cx, cy + r * 0.55);
  ctx.stroke();
  ctx.restore();
}

function gear(ctx: Ctx, cx: number, cy: number, r: number) {
  const teeth = 10;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.72 : r * 0.92;
    ctx.lineTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
    ctx.lineTo(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draw an emblem mask centred in the canvas. */
export function drawEmblemMask(ctx: Ctx, w: number, h: number, emblem: EmblemId) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  const r = Math.min(w, h) * 0.42;
  const draw = { planet, skull, crystal, gear, none: () => undefined }[emblem];
  draw(ctx, w / 2, h / 2, r);
}
