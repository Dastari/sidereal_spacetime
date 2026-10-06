/** Exact study face compositor and PNG decoder, imported from source dc619472 (read-only). */
export type RGB255 = readonly [number, number, number];

export interface CrewFaceExpression {
  eyes: string;
  iris?: string;
  brows: string;
  mouth: string;
  under?: string;
  over?: string;
}

export interface CrewFaceAtlas {
  schema?: string;
  variant?: string;
  cell: number;
  layers: readonly string[];
  frames: Readonly<Record<string, readonly string[]>>;
  expressions: Readonly<Record<string, CrewFaceExpression>>;
  aliases?: Readonly<Record<string, string>>;
  visemes: Readonly<Record<string, string>>;
  blink: readonly { eyes: string; seconds: number }[];
  blinkSuppressedEyes: readonly string[];
  looks: Readonly<Record<string, string>>;
}

export interface CrewFaceImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface CrewFaceState {
  expression?: string;
  viseme?: string | null;
  blinkEyes?: string | null;
  look?: -1 | 0 | 1;
  /** Face detail on the `marks` layer (live CHARACTER_FACE_DETAILS id), default "none". */
  detail?: string;
  /** Age lines on the `age` layer: "none" | "lines" | "older" (mature -> lines, elder -> older). */
  age?: string;
}

export interface CrewFaceTints {
  skin: RGB255;
  /** Iris colour. */
  eye: RGB255;
  /** Hair colour; brows are tinted hair x 0.6. */
  hair: RGB255;
}

/** compose()'s defaults in src/cr/face_atlas.py. */
export const CREW_FACE_DEFAULT_TINTS: CrewFaceTints = {
  skin: [240, 180, 143],
  eye: [52, 46, 120],
  hair: [91, 47, 176],
};

/** Python round(): half to even (exact pixel parity with the reference compositor). */
export function roundHalfEven(x: number) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Frame name per layer for a state (null = draw nothing on that layer), mirroring compose(). */
export function crewFaceFrames(
  atlas: CrewFaceAtlas,
  state: CrewFaceState,
): Record<string, string | null> {
  const requested = state.expression ?? "neutral";
  const name = atlas.aliases?.[requested] ?? requested;
  const ex = atlas.expressions[name] ?? atlas.expressions.neutral;
  const look = atlas.looks[String(state.look ?? 0)] ?? "c";
  const mouth = state.viseme
    ? (atlas.visemes[state.viseme] ?? ex.mouth)
    : ex.mouth;
  const blinking =
    !!state.blinkEyes && !atlas.blinkSuppressedEyes.includes(ex.eyes);
  const iris = ex.iris ?? "open";
  const irisFrame = blinking || iris === "none" ? "none" : `${iris}@${look}`;
  const out: Record<string, string | null> = {};
  for (const layer of atlas.layers) {
    switch (layer) {
      case "marks":
        out[layer] = state.detail ?? "none";
        break;
      case "age":
        out[layer] = state.age ?? "none";
        break;
      case "iris":
      case "glint":
        out[layer] = irisFrame;
        break;
      case "eyes":
        out[layer] = blinking ? state.blinkEyes! : ex.eyes;
        break;
      case "mouth":
        out[layer] = mouth;
        break;
      default:
        out[layer] = ((ex as unknown as Record<string, string | undefined>)[
          layer
        ] ?? "none") as string;
    }
  }
  return out;
}

/** Compose the face canvas (RGBA8, opaque, row 0 = top). Exact port of cr.face_atlas.compose(). */
export function composeCrewFace(
  atlas: CrewFaceAtlas,
  image: CrewFaceImage,
  state: CrewFaceState,
  tints: CrewFaceTints = CREW_FACE_DEFAULT_TINTS,
  out = new Uint8Array(atlas.cell * atlas.cell * 4),
) {
  const n = atlas.cell;
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = tints.skin[0];
    out[i * 4 + 1] = tints.skin[1];
    out[i * 4 + 2] = tints.skin[2];
    out[i * 4 + 3] = 255;
  }
  const frames = crewFaceFrames(atlas, state);
  const irisTint = [tints.eye[0] / 255, tints.eye[1] / 255, tints.eye[2] / 255];
  const browTint = tints.hair.map((c) => ((c / 255) * 0.6) / (200 / 255));
  atlas.layers.forEach((layer, row) => {
    const name = frames[layer];
    if (name === null || name === undefined) return;
    const col = atlas.frames[layer]?.indexOf(name) ?? -1;
    if (col < 0) return;
    const tint =
      layer === "iris" ? irisTint : layer === "brows" ? browTint : null;
    for (let r = 0; r < n; r++)
      for (let q = 0; q < n; q++) {
        const si = ((row * n + r) * image.width + col * n + q) * 4;
        const a8 = image.data[si + 3];
        if (a8 === 0) continue;
        const a = a8 / 255;
        const di = (r * n + q) * 4;
        for (let k = 0; k < 3; k++) {
          const src = tint
            ? Math.min(255, image.data[si + k] * tint[k])
            : Math.min(255, image.data[si + k]);
          out[di + k] = roundHalfEven(src * a + out[di + k] * (1 - a));
        }
      }
  });
  return out;
}

export const hexToRgb255 = (hex: string): [number, number, number] => {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? "ffffff";
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
};

/** zlib inflate through the browser's DecompressionStream ("deflate" = zlib-wrapped). */
async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Exact PNG decode (8-bit RGB/RGBA, non-interlaced) to straight-alpha RGBA. A 2D canvas round trip
 * (createImageBitmap + getImageData) premultiplies and loses up to 1 LSB on semi-transparent pixels (blush,
 * tears, sweat), which breaks parity with the reference compositor; this decoder does not.
 */
export async function decodeCrewFacePng(
  bytes: Uint8Array,
  inflate: (data: Uint8Array) => Promise<Uint8Array> | Uint8Array = inflateZlib,
): Promise<CrewFaceImage> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat: Uint8Array[] = [];
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(
      bytes[off + 4],
      bytes[off + 5],
      bytes[off + 6],
      bytes[off + 7],
    );
    if (type === "IHDR") {
      width = dv.getUint32(off + 8);
      height = dv.getUint32(off + 12);
      colorType = bytes[off + 17];
      if (
        bytes[off + 16] !== 8 ||
        (colorType !== 6 && colorType !== 2) ||
        bytes[off + 20] !== 0
      )
        throw new Error("face atlas PNG must be 8-bit RGB(A), non-interlaced");
    } else if (type === "IDAT")
      idat.push(bytes.subarray(off + 8, off + 8 + len));
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  idat.reduce((o, c) => (joined.set(c, o), o + c.length), 0);
  const raw = await inflate(joined);
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const pix = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pix[y * stride + x - bpp] : 0;
      const b = y > 0 ? pix[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pix[(y - 1) * stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pix[y * stride + x] = v & 255;
    }
  }
  if (bpp === 4) return { width, height, data: pix };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba.set(pix.subarray(i * 3, i * 3 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, data: rgba };
}

/** Fetch + exact decode of a face atlas PNG (straight alpha, no colour conversion). */
export async function loadCrewFaceImage(url: string): Promise<CrewFaceImage> {
  return decodeCrewFacePng(
    new Uint8Array(await (await fetch(url)).arrayBuffer()),
  );
}

export async function loadCrewFaceAtlas(jsonUrl: string, pngUrl: string) {
  const [atlas, image] = await Promise.all([
    fetch(jsonUrl).then((r) => r.json() as Promise<CrewFaceAtlas>),
    loadCrewFaceImage(pngUrl),
  ]);
  return { atlas, image };
}
