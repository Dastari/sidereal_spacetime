import type { Rect } from "./layout";
import type { CanvasUI } from "./toolkit";

type Point = readonly [number, number];
const armor = {
  outline: "#101c30",
  joint: "#263348",
  shadow: "#566783",
  edge: "#8c9bb4",
  panel: "#cbd5e8",
  light: "#f1f5ff",
  inset: "#354964",
  glass: "#0d438b",
  cyan: "#40dcff",
  cyanLight: "#b0f5ff",
  gold: "#e0ae54",
};

/**
 * Original, small equipment silhouettes for cosmetic anatomy slots.
 * Authored at 56 × 40 logical units so the complete silhouette fits a 36 px
 * tall slot image. Molded shell facets and cyan seams match the crew's finish;
 * these images describe anatomy and confer no inventory or equipment state.
 */
export function drawAppearanceIcon(ui: CanvasUI, rect: Rect, kind: string) {
  if (
    rect.w <= 0 ||
    rect.h <= 0 ||
    !Number.isFinite(rect.x + rect.y + rect.w + rect.h)
  )
    return;
  const c = ui.ctx;
  const scale = Math.min(rect.w / 56, rect.h / 40);
  c.save();
  c.beginPath();
  c.rect(rect.x, rect.y, rect.w, rect.h);
  c.clip();
  c.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  c.scale(scale, scale);
  c.lineJoin = "round";
  c.lineCap = "round";
  c.shadowBlur = 0;
  c.shadowOffsetX = c.shadowOffsetY = 0;

  const shape = (
    points: readonly Point[],
    color: string,
    stroke = armor.outline,
    width = 1.2,
  ) => {
    c.beginPath();
    points.forEach(([x, y], index) =>
      index ? c.lineTo(x, y) : c.moveTo(x, y),
    );
    c.closePath();
    c.fillStyle = color;
    c.fill();
    if (width) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  };
  const seam = (points: readonly Point[], color = armor.cyan, width = 1.15) => {
    c.beginPath();
    points.forEach(([x, y], index) =>
      index ? c.lineTo(x, y) : c.moveTo(x, y),
    );
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  const pane = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    bevel = 2,
  ) => {
    shape(
      [
        [x + bevel, y],
        [x + w - bevel, y],
        [x + w, y + bevel],
        [x + w, y + h - bevel],
        [x + w - bevel, y + h],
        [x + bevel, y + h],
        [x, y + h - bevel],
        [x, y + bevel],
      ],
      color,
    );
  };
  const mirrored = (draw: () => void) => {
    draw();
    c.save();
    c.scale(-1, 1);
    draw();
    c.restore();
  };

  switch (kind.toLowerCase().replace(/[\s_-]/g, "")) {
    case "helmet":
      shape(
        [
          [-18, -9],
          [-12, -17],
          [10, -17],
          [18, -9],
          [19, 8],
          [10, 17],
          [-10, 17],
          [-18, 9],
        ],
        armor.shadow,
      );
      shape(
        [
          [-12, -17],
          [10, -17],
          [15, -11],
          [-17, -11],
        ],
        armor.light,
      );
      shape(
        [
          [-16, -10],
          [11, -10],
          [14, -5],
          [13, 7],
          [8, 14],
          [-9, 14],
          [-15, 7],
        ],
        armor.panel,
      );
      shape(
        [
          [12, -9],
          [18, -6],
          [18, 8],
          [11, 15],
          [11, 5],
        ],
        armor.edge,
      );
      shape(
        [
          [-13, -6],
          [10, -6],
          [12, -2],
          [9, 6],
          [-10, 6],
          [-13, 1],
        ],
        armor.outline,
      );
      shape(
        [
          [-11, -4],
          [9, -4],
          [9, 1],
          [6, 4],
          [-9, 4],
        ],
        armor.glass,
        armor.glass,
        0,
      );
      shape(
        [
          [-11, -4],
          [9, -4],
          [7, -1],
          [-10, 0],
        ],
        armor.cyan,
        armor.cyan,
        0,
      );
      seam(
        [
          [-10, -4],
          [7, -4],
        ],
        armor.cyanLight,
        1,
      );
      shape(
        [
          [-8, 8],
          [-3, 10],
          [5, 8],
          [7, 12],
          [3, 15],
          [-6, 14],
        ],
        armor.light,
      );
      pane(-19, -3, 5, 10, armor.joint, 1);
      seam(
        [
          [-17, -1],
          [-17, 2],
        ],
        armor.gold,
        1.6,
      );
      pane(-4, -19, 11, 8, "#b73351", 1.5);
      seam(
        [
          [-2, -17],
          [4, -17],
        ],
        "#ff8da0",
        1.5,
      );
      break;

    case "visor":
      shape(
        [
          [-25, -6],
          [24, -6],
          [25, 4],
          [18, 7],
          [-20, 7],
          [-25, 3],
        ],
        armor.joint,
      );
      pane(-21, -11, 41, 22, armor.shadow, 4);
      shape(
        [
          [-17, -9],
          [15, -9],
          [19, -5],
          [15, -3],
          [-17, -3],
          [-20, -6],
        ],
        armor.panel,
      );
      shape(
        [
          [-18, -3],
          [17, -3],
          [16, 7],
          [8, 10],
          [3, 6],
          [-3, 6],
          [-7, 10],
          [-17, 7],
        ],
        armor.outline,
      );
      shape(
        [
          [-15, -1],
          [-3, -1],
          [-4, 5],
          [-8, 7],
          [-14, 5],
        ],
        armor.glass,
        armor.glass,
        0,
      );
      shape(
        [
          [3, -1],
          [14, -1],
          [13, 5],
          [8, 7],
          [4, 4],
        ],
        armor.glass,
        armor.glass,
        0,
      );
      seam(
        [
          [-15, 0],
          [-5, 0],
        ],
        armor.cyan,
        2.6,
      );
      seam(
        [
          [4, 0],
          [13, 0],
        ],
        armor.cyan,
        2.6,
      );
      pane(18, -4, 7, 11, armor.inset, 1.5);
      seam(
        [
          [21, -1],
          [21, 3],
        ],
        armor.cyanLight,
        1.5,
      );
      break;

    case "shoulder":
    case "shoulders":
      mirrored(() => {
        shape(
          [
            [-24, -6],
            [-18, -14],
            [-9, -12],
            [-5, -4],
            [-8, 10],
            [-17, 13],
            [-25, 6],
          ],
          armor.joint,
        );
        shape(
          [
            [-23, -7],
            [-17, -14],
            [-10, -12],
            [-7, -7],
            [-10, 2],
            [-22, 4],
            [-25, 0],
          ],
          armor.panel,
        );
        shape(
          [
            [-23, -7],
            [-17, -14],
            [-10, -12],
            [-8, -9],
            [-17, -9],
          ],
          armor.light,
        );
        shape(
          [
            [-23, 3],
            [-11, 1],
            [-10, 6],
            [-17, 10],
            [-23, 6],
          ],
          armor.shadow,
        );
        seam(
          [
            [-22, -3],
            [-13, -5],
          ],
          armor.cyan,
          1.8,
        );
        seam(
          [
            [-20, 6],
            [-15, 6],
          ],
          armor.edge,
          1,
        );
      });
      // The open central gap identifies a pair of shoulder caps, not a torso.
      break;

    case "chest":
    case "chestarmor":
    case "torso":
      shape(
        [
          [-20, -13],
          [-9, -18],
          [-5, -12],
          [5, -12],
          [10, -18],
          [20, -13],
          [16, 2],
          [14, 17],
          [-14, 17],
          [-16, 2],
        ],
        armor.joint,
      );
      mirrored(() => {
        shape(
          [
            [-18, -12],
            [-10, -16],
            [-6, -10],
            [-1, -9],
            [-2, 2],
            [-13, 3],
            [-17, -2],
          ],
          armor.panel,
        );
        seam(
          [
            [-17, -10],
            [-10, -13],
            [-6, -8],
          ],
          armor.light,
          1.4,
        );
        shape(
          [
            [-13, 5],
            [-2, 4],
            [-2, 15],
            [-12, 15],
            [-15, 10],
          ],
          armor.edge,
        );
        seam(
          [
            [-12, 7],
            [-5, 7],
          ],
          armor.cyan,
          1.5,
        );
      });
      pane(-4, -7, 8, 13, armor.inset, 1);
      seam(
        [
          [0, -4],
          [0, 0],
        ],
        armor.cyanLight,
        2,
      );
      shape(
        [
          [-11, 16],
          [11, 16],
          [7, 19],
          [-7, 19],
        ],
        armor.shadow,
      );
      break;

    case "glove":
    case "gloves":
      mirrored(() => {
        shape(
          [
            [-23, -7],
            [-21, -16],
            [-10, -16],
            [-8, -7],
            [-9, 4],
            [-4, 9],
            [-5, 13],
            [-9, 12],
            [-11, 17],
            [-20, 18],
            [-24, 11],
          ],
          armor.joint,
        );
        pane(-23, -16, 15, 12, armor.panel, 2);
        shape(
          [
            [-22, -3],
            [-10, -3],
            [-10, 6],
            [-13, 11],
            [-21, 10],
            [-24, 5],
          ],
          armor.edge,
        );
        shape(
          [
            [-21, 2],
            [-11, 2],
            [-11, 7],
            [-21, 7],
          ],
          armor.panel,
        );
        seam(
          [
            [-21, -11],
            [-11, -11],
          ],
          armor.cyan,
          1.8,
        );
        seam(
          [
            [-20, 11],
            [-19, 15],
          ],
          armor.edge,
          1.7,
        );
        seam(
          [
            [-16, 12],
            [-16, 16],
          ],
          armor.edge,
          1.7,
        );
        seam(
          [
            [-12, 11],
            [-13, 15],
          ],
          armor.edge,
          1.6,
        );
      });
      break;

    case "belt":
      shape(
        [
          [-26, -6],
          [-20, -10],
          [-9, -7],
          [9, -7],
          [20, -10],
          [26, -6],
          [25, 8],
          [19, 12],
          [8, 8],
          [-8, 8],
          [-19, 12],
          [-25, 8],
        ],
        armor.joint,
      );
      pane(-23, -8, 12, 17, armor.shadow, 2);
      pane(11, -8, 12, 17, armor.shadow, 2);
      pane(-19, -7, 7, 10, armor.panel, 1);
      pane(12, -7, 7, 10, armor.panel, 1);
      pane(-8, -8, 16, 17, armor.gold, 3);
      pane(-4, -4, 8, 9, armor.inset, 1);
      seam(
        [
          [-2, 0],
          [2, 0],
        ],
        armor.cyanLight,
        2,
      );
      seam(
        [
          [-22, 6],
          [-14, 6],
        ],
        armor.cyan,
        1.3,
      );
      seam(
        [
          [14, 6],
          [22, 6],
        ],
        armor.cyan,
        1.3,
      );
      break;

    case "leg":
    case "legs":
    case "greaves":
      mirrored(() => {
        shape(
          [
            [-18, -18],
            [-5, -18],
            [-4, -6],
            [-7, 2],
            [-6, 15],
            [-10, 19],
            [-20, 17],
            [-18, 4],
            [-21, -6],
          ],
          armor.joint,
        );
        shape(
          [
            [-18, -17],
            [-7, -17],
            [-6, -7],
            [-9, -3],
            [-18, -5],
            [-20, -11],
          ],
          armor.panel,
        );
        shape(
          [
            [-18, -2],
            [-9, -2],
            [-7, 3],
            [-11, 7],
            [-18, 5],
            [-20, 2],
          ],
          armor.shadow,
        );
        shape(
          [
            [-18, 6],
            [-9, 8],
            [-8, 15],
            [-11, 18],
            [-19, 16],
          ],
          armor.panel,
        );
        seam(
          [
            [-17, -12],
            [-9, -12],
          ],
          armor.cyan,
          1.6,
        );
        seam(
          [
            [-15, 9],
            [-15, 14],
          ],
          armor.cyan,
          1.4,
        );
        seam(
          [
            [-17, -16],
            [-9, -16],
          ],
          armor.light,
          1.2,
        );
      });
      break;

    case "boot":
    case "boots":
      mirrored(() => {
        shape(
          [
            [-19, -17],
            [-7, -17],
            [-6, -8],
            [-9, 1],
            [-8, 8],
            [-3, 11],
            [-2, 17],
            [-8, 19],
            [-24, 19],
            [-26, 14],
            [-24, 6],
            [-21, 2],
          ],
          armor.joint,
        );
        shape(
          [
            [-18, -15],
            [-8, -15],
            [-8, -6],
            [-11, 0],
            [-19, -1],
            [-21, -5],
          ],
          armor.panel,
        );
        shape(
          [
            [-20, 1],
            [-11, 2],
            [-10, 8],
            [-5, 12],
            [-9, 15],
            [-23, 14],
            [-23, 7],
          ],
          armor.panel,
        );
        shape(
          [
            [-24, 14],
            [-8, 15],
            [-4, 12],
            [-3, 17],
            [-8, 19],
            [-24, 18],
          ],
          armor.shadow,
        );
        pane(-24, -9, 5, 12, armor.inset, 1);
        seam(
          [
            [-21.5, -6],
            [-21.5, -2],
          ],
          armor.cyan,
          1.6,
        );
        seam(
          [
            [-21, 9],
            [-13, 10],
          ],
          armor.cyan,
          1.6,
        );
        seam(
          [
            [-17, -13],
            [-10, -13],
          ],
          armor.light,
          1.3,
        );
      });
      break;

    default:
      // An unrecognised anatomy label stays visually unassigned.
      seam(
        [
          [-9, -7],
          [9, 7],
        ],
        armor.shadow,
        1.2,
      );
      seam(
        [
          [9, -7],
          [-9, 7],
        ],
        armor.shadow,
        1.2,
      );
  }
  c.restore();
}
