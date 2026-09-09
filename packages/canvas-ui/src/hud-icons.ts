import type { Rect } from "./layout";
import type { CanvasUI } from "./toolkit";

export type HudIcon =
  | "heart"
  | "shield"
  | "bolt"
  | "stamina"
  | "scan"
  | "repair"
  | "dash"
  | "crosshair"
  | "medkit"
  | "cargo"
  | "flame"
  | "radiation"
  | "emp"
  | "corrosion"
  | "kinetic"
  | "gear";

export type HudIconKind = HudIcon;

export interface HudIconOptions {
  color?: string;
  glow?: boolean;
  filled?: boolean;
}

/** Original vector glyphs for stats and actions; no font symbols or image dependencies. */
export function drawHudIcon(
  ui: CanvasUI,
  rect: Rect,
  kind: HudIcon,
  options: HudIconOptions = {},
) {
  if (rect.w <= 0 || rect.h <= 0) return;
  const c = ui.ctx;
  const size = Math.min(rect.w, rect.h);
  c.save();
  c.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  c.scale(size / 24, size / 24);
  c.strokeStyle = c.fillStyle = options.color ?? "#61dfff";
  c.lineWidth = 1.8;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (options.glow) {
    c.shadowColor = options.color ?? "#27bfff";
    c.shadowBlur = Math.min(5, size * 0.18);
  }
  const line = (points: number[][], close = false, fill = false) => {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (close) c.closePath();
    if (fill) c.fill();
    else c.stroke();
  };
  const circle = (x: number, y: number, r: number, fill = false) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    fill ? c.fill() : c.stroke();
  };
  switch (kind) {
    case "heart":
      c.beginPath();
      c.moveTo(0, 9);
      c.bezierCurveTo(-3, 6, -10, 1, -10, -4);
      c.bezierCurveTo(-10, -10, -3, -11, 0, -5);
      c.bezierCurveTo(3, -11, 10, -10, 10, -4);
      c.bezierCurveTo(10, 1, 3, 6, 0, 9);
      c.closePath();
      options.filled === false ? c.stroke() : c.fill();
      break;
    case "shield":
      c.beginPath();
      c.moveTo(0, -10);
      c.lineTo(8, -7);
      c.lineTo(7, 2);
      c.quadraticCurveTo(6, 7, 0, 10);
      c.quadraticCurveTo(-6, 7, -7, 2);
      c.lineTo(-8, -7);
      c.closePath();
      c.stroke();
      line(
        [
          [0, -6],
          [4, -4],
          [3, 2],
          [0, 5],
          [-3, 2],
          [-4, -4],
        ],
        true,
        options.filled !== false,
      );
      break;
    case "bolt":
    case "emp":
      line(
        [
          [1, -11],
          [-8, 2],
          [-1, 2],
          [-4, 11],
          [9, -3],
          [2, -3],
          [5, -11],
        ],
        true,
        options.filled !== false,
      );
      break;
    case "stamina":
      circle(4, -8, 2.1, true);
      line([
        [-6, -1],
        [-3, -5],
        [1, -3],
        [4, 1],
        [8, 0],
      ]);
      line([
        [1, -3],
        [-2, 3],
        [3, 5],
        [1, 10],
      ]);
      line([
        [-2, 3],
        [-5, 7],
        [-10, 6],
      ]);
      break;
    case "scan":
      circle(0, 0, 8);
      circle(0, 0, 3);
      line([
        [0, -11],
        [0, -6],
      ]);
      line([
        [0, 6],
        [0, 11],
      ]);
      line([
        [-11, 0],
        [-6, 0],
      ]);
      line([
        [6, 0],
        [11, 0],
      ]);
      c.beginPath();
      c.arc(0, 0, 5.5, -Math.PI * 0.4, 0);
      c.stroke();
      break;
    case "repair":
      c.beginPath();
      c.moveTo(2, -3);
      c.lineTo(2, -8);
      c.lineTo(5, -11);
      c.lineTo(5, -6);
      c.lineTo(8, -5);
      c.lineTo(11, -8);
      c.lineTo(10, -2);
      c.lineTo(6, 1);
      c.lineTo(3, 1);
      c.lineTo(-6, 10);
      c.quadraticCurveTo(-8, 12, -10, 9);
      c.quadraticCurveTo(-11, 7, -9, 5);
      c.closePath();
      c.stroke();
      circle(-7.5, 7.5, 0.8, true);
      break;
    case "dash":
      line(
        [
          [-6, -9],
          [4, 0],
          [-6, 9],
          [-1, 9],
          [10, 0],
          [-1, -9],
        ],
        true,
        options.filled !== false,
      );
      line([
        [-11, -6],
        [-5, 0],
        [-11, 6],
      ]);
      break;
    case "crosshair":
      circle(0, 0, 7);
      circle(0, 0, 1.5, true);
      line([
        [0, -11],
        [0, -5],
      ]);
      line([
        [0, 5],
        [0, 11],
      ]);
      line([
        [-11, 0],
        [-5, 0],
      ]);
      line([
        [5, 0],
        [11, 0],
      ]);
      break;
    case "medkit":
      line(
        [
          [-3, -9],
          [3, -9],
          [3, -3],
          [9, -3],
          [9, 3],
          [3, 3],
          [3, 9],
          [-3, 9],
          [-3, 3],
          [-9, 3],
          [-9, -3],
          [-3, -3],
        ],
        true,
        options.filled !== false,
      );
      break;
    case "cargo":
      line(
        [
          [0, -10],
          [9, -5],
          [9, 5],
          [0, 10],
          [-9, 5],
          [-9, -5],
        ],
        true,
      );
      line([
        [-9, -5],
        [0, 0],
        [9, -5],
      ]);
      line([
        [0, 0],
        [0, 10],
      ]);
      line([
        [-4, -7.5],
        [5, -2.5],
        [5, 1.5],
      ]);
      break;
    case "flame":
      c.beginPath();
      c.moveTo(1, -11);
      c.bezierCurveTo(3, -4, 10, -2, 8, 5);
      c.bezierCurveTo(6, 13, -8, 12, -8, 3);
      c.bezierCurveTo(-8, -1, -4, -4, -3, -7);
      c.lineTo(-2, -1);
      c.bezierCurveTo(2, -3, 3, -5, 1, -11);
      c.closePath();
      if (options.filled === false) c.stroke();
      else {
        // An even-odd counter preserves the HUD underneath the open flame centre.
        c.moveTo(1, 0);
        c.quadraticCurveTo(-5, 4, -2, 7);
        c.quadraticCurveTo(4, 10, 4, 5);
        c.quadraticCurveTo(1, 6, 1, 0);
        c.closePath();
        c.fill("evenodd");
      }
      break;
    case "radiation":
      circle(0, 0, 1.7, true);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        c.beginPath();
        c.arc(0, 0, 9.5, angle - 0.5, angle + 0.5);
        c.arc(0, 0, 3.2, angle + 0.5, angle - 0.5, true);
        c.closePath();
        c.fill();
      }
      break;
    case "corrosion":
      circle(0, 0, 9);
      c.beginPath();
      c.moveTo(0, -7);
      c.bezierCurveTo(-1, -3, -5, 0, -4, 3);
      c.bezierCurveTo(-3, 7, 4, 7, 4, 2);
      c.quadraticCurveTo(4, 0, 0, -7);
      c.closePath();
      c.fill();
      break;
    case "kinetic":
      line(
        [
          [-10, 2],
          [-1, -7],
          [3, -3],
          [-6, 6],
        ],
        true,
        true,
      );
      line(
        [
          [-3, 8],
          [6, -1],
          [10, 3],
          [1, 12],
        ],
        true,
        true,
      );
      line([
        [-10, -4],
        [-6, -8],
      ]);
      line([
        [3, -8],
        [6, -11],
      ]);
      break;
    case "gear":
      for (let i = 0; i < 8; i++) {
        c.save();
        c.rotate((i / 8) * Math.PI * 2);
        c.fillRect(-1.6, -10, 3.2, 4);
        c.restore();
      }
      circle(0, 0, 6.5);
      circle(0, 0, 2.4);
      break;
  }
  c.restore();
}
