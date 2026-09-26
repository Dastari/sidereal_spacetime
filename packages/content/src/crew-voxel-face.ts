/**
 * Animatable pixel face (FACE_ATLAS_SPEC): pure compositor shared by the runtime and review tools.
 * Mirrors scripts/art_library/crew_voxel/face_atlas.py `compose` exactly (tested against it).
 *
 * Atlas image: RGBA8, one ROW per layer (under, marks, eyes, iris, glint, brows, mouth, over), one
 * COLUMN per frame, 16 x 16 px cells. Output: 16 x 16 RGBA8, row 0 = top, column 0 = character's right.
 */
export const FACE_LAYERS = ["under", "marks", "eyes", "iris", "glint", "brows", "mouth", "over"] as const;
export type FaceLayer = (typeof FACE_LAYERS)[number];

export type FaceExpression = {
  eyes: string;
  iris?: string;
  brows: string;
  mouth: string;
  under?: string;
  over?: string;
};

export type FaceAtlas = {
  cell: number;
  layers: readonly FaceLayer[];
  frames: Record<FaceLayer, readonly string[]>;
  expressions: Record<string, FaceExpression>;
  visemes: Record<string, string>;
  blink: readonly { eyes: string; seconds: number }[];
  blinkSuppressedEyes: readonly string[];
  looks: Record<string, string>;
  animationExpressions?: Record<string, string>;
};

export type FaceState = {
  expression: string;
  viseme?: string | null;
  blinkEyes?: string | null;
  look?: -1 | 0 | 1;
};

export type FaceTints = {
  skin: readonly [number, number, number];
  eye: readonly [number, number, number];
  hair: readonly [number, number, number];
};

export const FACE_DEFAULT_TINTS: FaceTints = {
  skin: [243, 169, 141],
  eye: [70, 110, 200],
  hair: [110, 58, 31],
};

export type FaceAtlasImage = { width: number; height: number; data: Uint8Array | Uint8ClampedArray };

/** Frame name per layer for a state (null = draw nothing on that layer). */
export function faceFrames(atlas: FaceAtlas, state: FaceState): Record<FaceLayer, string | null> {
  const ex = atlas.expressions[state.expression] ?? atlas.expressions.neutral;
  const look = atlas.looks[String(state.look ?? 0)] ?? "c";
  const mouth = state.viseme ? (atlas.visemes[state.viseme] ?? ex.mouth) : ex.mouth;
  const blinking = !!state.blinkEyes && !atlas.blinkSuppressedEyes.includes(ex.eyes);
  const eyes = blinking ? state.blinkEyes! : ex.eyes;
  const iris = ex.iris ?? "open";
  const irisFrame = blinking || iris === "none" ? null : `${iris}@${look}`;
  return {
    under: ex.under ?? "none",
    marks: "none",
    eyes,
    iris: irisFrame,
    glint: irisFrame,
    brows: ex.brows,
    mouth,
    over: ex.over ?? "none",
  };
}

/** Compose the 16 x 16 face texture (RGBA8, opaque). */
export function composeFace(
  atlas: FaceAtlas,
  image: FaceAtlasImage,
  state: FaceState,
  tints: FaceTints = FACE_DEFAULT_TINTS,
): Uint8Array {
  const n = atlas.cell;
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = tints.skin[0];
    out[i * 4 + 1] = tints.skin[1];
    out[i * 4 + 2] = tints.skin[2];
    out[i * 4 + 3] = 255;
  }
  const frames = faceFrames(atlas, state);
  atlas.layers.forEach((layer, row) => {
    const name = frames[layer];
    if (name === null) return;
    const col = atlas.frames[layer].indexOf(name);
    if (col < 0) return;
    let tint: readonly number[] = [1, 1, 1];
    if (layer === "iris") tint = tints.eye.map((c) => c / 255);
    else if (layer === "brows") tint = tints.hair.map((c) => ((c / 255) * 0.6) / (200 / 255));
    for (let r = 0; r < n; r++)
      for (let q = 0; q < n; q++) {
        const si = ((row * n + r) * image.width + col * n + q) * 4;
        const a8 = image.data[si + 3];
        if (a8 === 0) continue;
        const a = a8 / 255;
        const di = (r * n + q) * 4;
        for (let k = 0; k < 3; k++) {
          const src = Math.min(255, image.data[si + k] * tint[k]);
          // Python round() is half-to-even; values here rarely land on .5 exactly
          out[di + k] = Math.round(src * a + out[di + k] * (1 - a));
        }
      }
  });
  return out;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!v) return [255, 255, 255];
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
