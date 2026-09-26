import { Scene } from "@babylonjs/core/scene";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  FACE_DEFAULT_TINTS,
  composeFace,
  type FaceAtlas,
  type FaceAtlasImage,
  type FaceState,
  type FaceTints,
} from "@sidereal/content/crew-voxel-face";

export type VoxelFaceLook = -1 | 0 | 1;

/**
 * Presentation-only animatable pixel face (FACE_ATLAS_SPEC). Composes the 16 x 16 face texture on
 * the CPU from atlas state and uploads it only when the state changes (expression, viseme, blink
 * frame, look, tints). Idle auto-blink every 2-6 s. Precedence: explicit expression > action track.
 */
export type VoxelFaceComposer = (state: FaceState) => Uint8Array | Uint8ClampedArray;
const DEFAULT_BLINK = [
  { eyes: "half", seconds: 1 / 24 },
  { eyes: "closed", seconds: 1 / 24 },
  { eyes: "half", seconds: 1 / 24 },
] as const;

export function createVoxelFace(scene: Scene, initialMaterial: PBRMaterial | undefined, random: () => number = Math.random) {
  let material = initialMaterial;
  let composer: VoxelFaceComposer | undefined;
  let atlas: FaceAtlas | undefined;
  let image: FaceAtlasImage | undefined;
  let tints: FaceTints = FACE_DEFAULT_TINTS;
  let explicit: string | null = null;
  let track: string | undefined;
  let viseme: string | null = null;
  let look: VoxelFaceLook = 0;
  let blinkIndex = -1;
  let blinkElapsed = 0;
  let nextBlink = 2 + random() * 4;
  let autoBlink = true;
  let texture: RawTexture | undefined;
  let lastKey = "";
  let uploads = 0;

  const blinkSeq = () => (composer ? DEFAULT_BLINK : atlas?.blink ?? DEFAULT_BLINK);
  const state = (): FaceState => ({
    expression: explicit ?? track ?? "neutral",
    viseme,
    blinkEyes: blinkIndex >= 0 ? blinkSeq()[blinkIndex]?.eyes ?? null : null,
    look,
  });

  const refresh = () => {
    if (!material || (!composer && (!atlas || !image))) return;
    const s = state();
    const key = JSON.stringify([s, tints, !!composer]);
    if (key === lastKey) return;
    lastKey = key;
    const pixels = composer ? composer(s) : composeFace(atlas!, image!, s, tints);
    // RawTexture rows start at the bottom; the face canvas row 0 is the top.
    const flipped = new Uint8Array(pixels.length);
    const n = Math.round(Math.sqrt(pixels.length / 4));
    for (let r = 0; r < n; r++) flipped.set(pixels.subarray(r * n * 4, (r + 1) * n * 4), (n - 1 - r) * n * 4);
    if (!texture) {
      texture = RawTexture.CreateRGBATexture(flipped, n, n, scene, false, false, Texture.NEAREST_SAMPLINGMODE,
        Engine.TEXTURETYPE_UNSIGNED_BYTE);
      texture.name = "crew-face";
      texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
      material.albedoTexture = texture;
      material.albedoColor = Color3.White();
    } else texture.update(flipped);
    uploads++;
  };

  const tick = (dt: number) => {
    if (!atlas && !composer) return;
    if (blinkIndex >= 0) {
      blinkElapsed += dt;
      const seq = blinkSeq();
      while (blinkIndex >= 0 && blinkElapsed >= seq[blinkIndex].seconds) {
        blinkElapsed -= seq[blinkIndex].seconds;
        blinkIndex = blinkIndex + 1 < seq.length ? blinkIndex + 1 : -1;
      }
      refresh();
    } else if (autoBlink) {
      nextBlink -= dt;
      if (nextBlink <= 0) {
        nextBlink = 2 + random() * 4;
        blink();
      }
    }
  };

  const blink = () => {
    if (!atlas && !composer) return;
    blinkIndex = 0;
    blinkElapsed = 0;
    refresh();
  };

  return {
    setAtlas(next: FaceAtlas, nextImage: FaceAtlasImage) {
      atlas = next;
      image = nextImage;
      lastKey = "";
      refresh();
    },
    /**
     * Drive another face material (e.g. a CHAR-HEADS head) with an external compositor. The
     * expression / viseme / blink / look state and tracks keep working unchanged.
     */
    setComposer(target: PBRMaterial, compose: VoxelFaceComposer) {
      if (texture && material && material.albedoTexture === texture) material.albedoTexture = null;
      texture?.dispose();
      texture = undefined;
      material = target;
      composer = compose;
      lastKey = "";
      refresh();
    },
    setTints(next: Partial<FaceTints>) {
      tints = { ...tints, ...next };
      refresh();
    },
    /** Explicit expression (null returns control to the playing action's expression track). */
    setExpression(id: string | null) {
      explicit = id;
      refresh();
    },
    /** Driven by the animation layer each frame; ignored while an explicit expression is set. */
    setTrackExpression(id: string | undefined) {
      if (id === track) return;
      track = id;
      refresh();
    },
    setViseme(id: string | null) {
      viseme = id;
      refresh();
    },
    setLook(value: VoxelFaceLook) {
      look = value;
      refresh();
    },
    setAutoBlink(enabled: boolean) {
      autoBlink = enabled;
    },
    blink,
    tick,
    get state() {
      return state();
    },
    get ready() {
      return !!material && (!!composer || (!!atlas && !!image));
    },
    get uploads() {
      return uploads;
    },
    dispose() {
      texture?.dispose();
      texture = undefined;
    },
  };
}

/** Browser RGBA decode of a PNG (straight alpha, no colour conversion). */
export async function loadRgbaImage(url: string): Promise<FaceAtlasImage> {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

/** Browser loader for the atlas JSON + PNG (decoded to RGBA through a 2D canvas). */
export async function loadVoxelFaceAtlas(jsonUrl: string, imageUrl: string) {
  const atlas = (await (await fetch(jsonUrl)).json()) as FaceAtlas;
  const blob = await (await fetch(imageUrl)).blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  return { atlas, image: { width: bitmap.width, height: bitmap.height, data } satisfies FaceAtlasImage };
}
