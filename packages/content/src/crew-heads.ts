/**
 * Crew head kit v1: the data contract for modular voxel heads with an animatable pixel-art face.
 *
 * Status: proposal. The art is unsigned and nothing here is wired into the live game yet.
 *
 * Sources of truth:
 * - `crew-heads.v1.json`: parts and rules.
 * - `crew-face-atlas.v1.json`: face atlas frames, expressions, visemes and blink.
 * Both are read by the headless Blender and atlas generators in scripts/art_library/crew_heads/.
 *
 * Geometry:
 * - Every part is authored rigidly in head space: origin at the `head` bone rest head, armature axes
 *   (x = character right, y = forward, z = up).
 * - The runtime parents part nodes to the head bone.
 * - The flat front of the skull uses material `crew.face`. Its albedo is a 16x16 px canvas composited
 *   from atlas layers by composeFace(), so expressions, visemes, blinks and looks are a CPU recomposite,
 *   not a mesh swap.
 * - Skin, hair and eye colours, themes and player colours are slot values (`crew.<slot>`), not geometry.
 *
 * These cosmetics grant no inventory item, stat or gameplay capability. Helmets, visors and masks are
 * the visual side of equipment only. Equipment authority stays with the inventory contracts.
 */
import catalog from "./crew-heads.v1.json";
import faceAtlas from "./crew-face-atlas.v1.json";

export const CREW_HEAD_SLOTS = [
  "skin",
  "hair",
  "eye",
  "suit_primary",
  "suit_secondary",
  "accent",
  "metal",
  "dark",
  "emit",
  "glass",
  "face",
] as const;
export type CrewHeadSlot = (typeof CREW_HEAD_SLOTS)[number];
export type SlotValues = Partial<Record<CrewHeadSlot, string>>;

export const HAIR_MODES = ["full", "cap", "fringe", "hidden"] as const;
export type HairMode = (typeof HAIR_MODES)[number];
export type HideTarget = "mouth" | "facialHair";

interface Referenced {
  id: string;
  label: string;
  reference?: string[];
}
export interface PaletteEntry extends Referenced {
  hex: string;
  emissive?: boolean;
}
export interface HairStyle extends Referenced {
  group: "short" | "medium" | "long" | "updo";
}
export interface FacialDetail extends Referenced {
  /** marking = a face-atlas `marks` frame; overlay = a GLB node in details.glb */
  kind: "marking" | "overlay";
  atlasMark?: string;
  zones: string[];
  layers?: string[];
  slotDefaults: SlotValues;
}
export interface Wearable extends Referenced {
  layers: string[];
  hairMode: HairMode;
  hides: HideTarget[];
  slotDefaults: SlotValues;
}
export interface Helmet extends Wearable {
  openFace: boolean;
  visors: string[];
}
export interface Visor extends Referenced {
  glass: string;
  overlay: "hud" | "ar" | null;
}
export interface HeadPreset extends Referenced {
  look: Partial<HeadLoadout>;
}

export interface CrewHeadCatalog {
  schema: "sidereal.crew-heads.v1";
  revision: number;
  status: string;
  voxelMeters: number;
  slots: CrewHeadSlot[];
  space: {
    anchorBone: string;
    origin: string;
    axes: string;
    units: string;
    skullVoxels: number[][];
    sockets: Record<string, number[]>;
    faceCanvas: { px: [number, number]; headSpaceVoxels: { x: number[]; z: number[] }; uv: string };
  };
  files: Record<string, string>;
  heads: Referenced[];
  faceVariants: Array<Referenced & { sex: "male" | "female" }>;
  ages: Array<Referenced & { ageMark: string }>;
  expressions: Referenced[];
  visemes: string[];
  animationExpressions: Record<string, string>;
  blink: { intervalSeconds: [number, number]; frames: Array<{ eyes: string; seconds: number }>; blinkSuppressedEyes: string[] };
  palettes: { skin: PaletteEntry[]; hair: PaletteEntry[]; eye: PaletteEntry[] };
  hairModes: HairMode[];
  hairStyles: HairStyle[];
  facialHair: Referenced[];
  details: FacialDetail[];
  maxDetails: number;
  accessories: Wearable[];
  helmets: Helmet[];
  visors: Visor[];
  masks: Omit<Wearable, "hairMode">[];
  presets: HeadPreset[];
}

/** Layer order of the face atlas (CHAR-BODY r004 schema `sidereal.crew.face-atlas/1`). */
export const FACE_LAYERS = ["under", "marks", "eyes", "iris", "glint", "brows", "mouth", "over"] as const;
export type FaceLayer = (typeof FACE_LAYERS)[number];
export interface FaceAtlasVariant {
  label: string;
  sex: "male" | "female";
  /** atlas PNG and its per-variant JSON (drop-in for CHAR-BODY `crew.face.setAtlas`) */
  file: string;
  json: string;
  size: [number, number];
  frames: Record<FaceLayer, string[]>;
}
export interface FaceExpression {
  eyes: string;
  /** base eyes frame whose iris/glint shows (`none` when the eyes are closed shapes) */
  iris: string;
  brows: string;
  mouth: string;
  under: string;
  over: string;
}
export interface FaceAtlas {
  schema: "sidereal.crew.face-atlas/1";
  cell: number;
  layers: FaceLayer[];
  /** look -1 | 0 | 1 -> suffix; r = character right, l = character left */
  looks: Record<string, string>;
  browShade: number;
  expressions: Record<string, FaceExpression>;
  visemes: Record<string, string>;
  blink: Array<{ eyes: string; seconds: number }>;
  blinkSuppressedEyes: string[];
  marksCompose: { ages: string[]; marks: string[] };
  variants: Record<string, FaceAtlasVariant>;
}

export const CREW_HEAD_CATALOG = catalog as unknown as CrewHeadCatalog;
export const CREW_FACE_ATLAS = faceAtlas as unknown as FaceAtlas;
export const CREW_HEAD_ASSET_BASE = "/assets/crew/heads/v1/";
export const CREW_HEAD_MANIFEST_URL = `${CREW_HEAD_ASSET_BASE}crew-heads.manifest.json`;

/** Persisted head appearance. Colour fields take a palette id or any `#rrggbb` value. */
export interface HeadLoadout {
  head: string;
  faceVariant: string;
  age: string;
  skin: string;
  hairColor: string;
  eyes: string;
  hair: string | null;
  facialHair?: string | null;
  facialHairColor?: string | null;
  details?: string[];
  accessories?: string[];
  helmet?: string | null;
  visor?: string | null;
  mask?: string | null;
}

export const DEFAULT_HEAD_LOADOUT: HeadLoadout = {
  head: "male",
  faceVariant: "m_classic",
  age: "adult",
  skin: "tan",
  hairColor: "dark_brown",
  eyes: "brown",
  hair: "short_waves",
};

const HEX = /^#[0-9a-f]{6}$/i;
const byId = <T extends { id: string }>(items: readonly T[]) =>
  new Map(items.map((item) => [item.id, item]));
const C = CREW_HEAD_CATALOG;
const A = CREW_FACE_ATLAS;
const HEADS = byId(C.heads);
const AGES = byId(C.ages);
const HAIR = byId(C.hairStyles);
const BEARD = byId(C.facialHair);
const DETAIL = byId(C.details);
const ACC = byId(C.accessories);
const HELMET = byId(C.helmets);
const VISOR = byId(C.visors);
const MASK = byId(C.masks);

/** `ears` covers both single-ear layers, so a headset and an earring conflict. */
function expandLayers(layers: readonly string[]) {
  return layers.flatMap((l) => (l === "ears" ? ["ear.L", "ear.R"] : [l]));
}

export interface PaletteColor {
  hex: string;
  emissive: boolean;
}
export function resolvePaletteColor(
  kind: keyof CrewHeadCatalog["palettes"],
  value: string,
): PaletteColor | undefined {
  const entry = C.palettes[kind].find((p) => p.id === value);
  if (entry) return { hex: entry.hex, emissive: !!entry.emissive };
  return HEX.test(value) ? { hex: value.toLowerCase(), emissive: false } : undefined;
}

export function shadeHex(hex: string, factor: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.min(255, Math.round(((n >> shift) & 255) * factor));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

export interface HeadValidation {
  ok: boolean;
  errors: string[];
}

/** Validates ids, colour values, layer/zone conflicts and helmet/visor/mask pairing. */
export function validateHeadLoadout(l: HeadLoadout): HeadValidation {
  const errors: string[] = [];
  if (!HEADS.has(l.head)) errors.push(`unknown head ${l.head}`);
  if (!A.variants[l.faceVariant]) errors.push(`unknown faceVariant ${l.faceVariant}`);
  if (!AGES.has(l.age)) errors.push(`unknown age ${l.age}`);
  if (!resolvePaletteColor("skin", l.skin)) errors.push(`bad skin ${l.skin}`);
  if (!resolvePaletteColor("hair", l.hairColor)) errors.push(`bad hairColor ${l.hairColor}`);
  if (l.facialHairColor && !resolvePaletteColor("hair", l.facialHairColor))
    errors.push(`bad facialHairColor ${l.facialHairColor}`);
  if (!resolvePaletteColor("eye", l.eyes)) errors.push(`bad eyes ${l.eyes}`);
  if (l.hair !== null && !HAIR.has(l.hair)) errors.push(`unknown hair ${l.hair}`);
  if (l.facialHair && !BEARD.has(l.facialHair)) errors.push(`unknown facialHair ${l.facialHair}`);
  const details = l.details ?? [];
  const accessories = l.accessories ?? [];
  if (new Set(details).size !== details.length) errors.push("duplicate detail");
  if (new Set(accessories).size !== accessories.length) errors.push("duplicate accessory");
  if (details.length > C.maxDetails) errors.push(`more than ${C.maxDetails} details`);
  const zones = new Map<string, string>();
  let markings = 0;
  for (const id of details) {
    const d = DETAIL.get(id);
    if (!d) {
      errors.push(`unknown detail ${id}`);
      continue;
    }
    if (d.kind === "marking" && ++markings > 1) errors.push("only one face marking at a time (one atlas marks layer)");
    for (const z of d.zones) {
      const prior = zones.get(z);
      if (prior) errors.push(`details ${prior} and ${id} overlap on ${z}`);
      else zones.set(z, id);
    }
  }
  // Worn layers: accessories, helmet and mask exclude each other. Face-mounted details only conflict
  // with accessories (they sit inside helmet cavities without touching the shell).
  const worn = new Map<string, string>();
  const claim = (layers: readonly string[], owner: string) => {
    for (const layer of expandLayers(layers)) {
      const prior = worn.get(layer);
      if (prior) errors.push(`${prior} and ${owner} both occupy ${layer}`);
      else worn.set(layer, owner);
    }
  };
  for (const id of accessories) {
    const a = ACC.get(id);
    if (!a) errors.push(`unknown accessory ${id}`);
    else claim(a.layers, id);
  }
  const accessoryLayers = new Map(worn);
  for (const id of details) {
    for (const layer of expandLayers(DETAIL.get(id)?.layers ?? [])) {
      const prior = accessoryLayers.get(layer);
      if (prior) errors.push(`${prior} and ${id} both occupy ${layer}`);
    }
  }
  const helmet = l.helmet ? HELMET.get(l.helmet) : undefined;
  if (l.helmet && !helmet) errors.push(`unknown helmet ${l.helmet}`);
  if (helmet) claim(helmet.layers, `helmet ${helmet.id}`);
  if (l.visor) {
    if (!VISOR.has(l.visor)) errors.push(`unknown visor ${l.visor}`);
    else if (!helmet) errors.push("visor needs a helmet");
    else if (!helmet.visors.includes(l.visor))
      errors.push(`helmet ${helmet.id} has no ${l.visor} visor`);
  }
  if (l.mask) {
    const m = MASK.get(l.mask);
    if (!m) errors.push(`unknown mask ${l.mask}`);
    else if (helmet && !helmet.openFace) errors.push(`mask ${m.id} needs an open-face helmet or none`);
    else claim(m.layers, `mask ${m.id}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Most restrictive hair variant across everything worn. */
export function hairModeFor(l: HeadLoadout): HairMode {
  let mode: HairMode = "full";
  const modes: HairMode[] = [
    ...(l.accessories ?? []).map((id) => ACC.get(id)?.hairMode ?? "full"),
    ...(l.helmet ? [HELMET.get(l.helmet)?.hairMode ?? "full"] : []),
  ];
  for (const m of modes) if (HAIR_MODES.indexOf(m) > HAIR_MODES.indexOf(mode)) mode = m;
  return mode;
}

export function expressionForAnimation(animation: string): string {
  return C.animationExpressions[animation] ?? "neutral";
}

// ============================================================================ animated face
/** Runtime face state. The static part (age, marking) comes from the loadout. */
export interface FaceState {
  expression: string;
  /** Talk viseme: closed, A, E, O, MB. Replaces the expression's mouth while set. */
  viseme?: string | null;
  /** Blink frame (from `blink.frames`); ignored while the expression's eyes are already shut. */
  blink?: string | null;
  /** -1 = character right, 0 = centre, 1 = character left (CHAR-BODY convention) */
  look?: -1 | 0 | 1;
}

/** `marks` frames combine the age treatment and one marking: "<age>+<mark>", `none` parts omitted. */
export function marksFrame(age: string, mark: string) {
  return [age, mark].filter((p) => p && p !== "none").join("+") || "none";
}

/** Frame name per atlas layer for a loadout's static marks plus a live face state. */
export function resolveFaceFrames(
  l: Pick<HeadLoadout, "age" | "details">,
  s: FaceState,
  mouthHidden = false,
): Record<FaceLayer, string> {
  const ex = A.expressions[s.expression] ?? A.expressions.neutral;
  const blinking = !!s.blink && !A.blinkSuppressedEyes.includes(ex.eyes);
  const eyes = blinking ? s.blink! : ex.eyes;
  const irisBase = blinking ? s.blink! : ex.iris;
  const mouth = s.viseme ? (A.visemes[s.viseme] ?? ex.mouth) : ex.mouth;
  const look = A.looks[String(s.look ?? 0)] ?? "c";
  const iris = irisBase === "none" ? "none" : `${irisBase}@${look}`;
  const mark = (l.details ?? []).map((id) => DETAIL.get(id)).find((d) => d?.kind === "marking")?.atlasMark ?? "none";
  return {
    under: ex.under,
    marks: marksFrame(AGES.get(l.age)?.ageMark ?? "none", mark),
    eyes,
    iris,
    glint: iris,
    brows: ex.brows,
    mouth: mouthHidden ? "none" : mouth,
    over: ex.over,
  };
}

export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Composite the 16x16 face canvas (RGBA, row 0 = top, column 0 = character right). The runtime uploads it
 * as the `crew.face` albedo (nearest sampling). The result is deterministic, so the runtime and review
 * renders agree (scripts/art_library/crew_heads/face_atlas.py compose()).
 */
export function composeFace(
  atlas: RGBAImage,
  variant: string,
  frames: Record<FaceLayer, string>,
  tints: { skin: string; eye: string; hair: string },
): Uint8ClampedArray {
  const v = A.variants[variant];
  if (!v) throw new Error(`unknown face variant ${variant}`);
  const N = A.cell;
  const out = new Uint8ClampedArray(N * N * 4);
  const skin = rgb(tints.skin);
  for (let i = 0; i < N * N; i++) out.set([...skin, 255], i * 4);
  const tint: Partial<Record<FaceLayer, number[]>> = {
    iris: rgb(tints.eye),
    brows: rgb(tints.hair).map((c) => Math.round(c * A.browShade)),
  };
  A.layers.forEach((layer, row) => {
    const col = v.frames[layer].indexOf(frames[layer]);
    if (col < 0) throw new Error(`variant ${variant} has no ${layer} frame ${frames[layer]}`);
    const t = tint[layer];
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const s = ((row * N + r) * atlas.width + col * N + c) * 4;
        const a = atlas.data[s + 3] / 255;
        if (!a) continue;
        const o = (r * N + c) * 4;
        for (let k = 0; k < 3; k++) {
          const src = t ? Math.floor((atlas.data[s + k] * t[k]) / 255) : atlas.data[s + k];
          out[o + k] = Math.round(out[o + k] * (1 - a) + src * a);
        }
      }
  });
  return out;
}

/** Blink timing helper: the next idle blink delay in seconds for a uniform random sample u in [0,1). */
export function nextBlinkDelay(u: number) {
  const [lo, hi] = C.blink.intervalSeconds;
  return lo + (hi - lo) * Math.min(Math.max(u, 0), 0.999999);
}

// ============================================================================ node resolution
export type HeadPartRole =
  | "head"
  | "hair"
  | "facialHair"
  | "detail"
  | "accessory"
  | "helmet"
  | "visor"
  | "mask";
export interface ResolvedHeadNode {
  /** GLB node name (see the manifest). */
  node: string;
  /** GLB key: a key of CREW_HEAD_CATALOG.files, or `hair/<style>` (one GLB per hair style). */
  file: string;
  role: HeadPartRole;
  /** Slot values for this node's material instances (hex, or a glass preset id for `glass`). */
  slots: SlotValues;
}
export interface ResolvedHead {
  nodes: ResolvedHeadNode[];
  hairMode: HairMode;
  hidden: HideTarget[];
  /** Face canvas inputs: variant, tints and whether the mouth is hidden (masks). */
  face: { variant: string; tints: { skin: string; eye: string; hair: string }; eyeEmissive: boolean; mouthHidden: boolean };
}

/**
 * Nodes to show for a loadout, with their slot values. `theme` recolours the suit roles of worn items
 * (suit_primary, suit_secondary, accent), for example for player colours. Throws on an invalid loadout,
 * so validate first when the input is untrusted.
 */
export function resolveHeadLoadout(l: HeadLoadout, theme: SlotValues = {}): ResolvedHead {
  const v = validateHeadLoadout(l);
  if (!v.ok) throw new Error(`invalid head loadout: ${v.errors.join("; ")}`);
  const skin = resolvePaletteColor("skin", l.skin)!;
  const hair = resolvePaletteColor("hair", l.hairColor)!;
  const beard = l.facialHairColor ? resolvePaletteColor("hair", l.facialHairColor)! : hair;
  const eye = resolvePaletteColor("eye", l.eyes)!;
  const person: SlotValues = { skin: skin.hex, hair: hair.hex, eye: eye.hex };
  const worn: Array<{ hides: HideTarget[] }> = [
    ...(l.accessories ?? []).map((id) => ACC.get(id)!),
    ...(l.helmet ? [HELMET.get(l.helmet)!] : []),
    ...(l.mask ? [MASK.get(l.mask)!] : []),
  ];
  const hidden = [...new Set(worn.flatMap((w) => w.hides))];
  const hairMode = hairModeFor(l);
  const nodes: ResolvedHeadNode[] = [];
  const add = (node: string, file: string, role: HeadPartRole, slots: SlotValues) =>
    nodes.push({ node, file, role, slots });
  add(`head.${l.head}`, "heads", "head", person);
  if (l.hair && hairMode !== "hidden") add(`hair.${l.hair}.${hairMode}`, `hair/${l.hair}`, "hair", person);
  if (l.facialHair && !hidden.includes("facialHair"))
    add(`facialhair.${l.facialHair}`, "facial-hair", "facialHair", { ...person, hair: beard.hex });
  for (const id of l.details ?? []) {
    const d = DETAIL.get(id)!;
    if (d.kind === "overlay") add(`detail.${id}`, "details", "detail", { ...person, ...d.slotDefaults });
  }
  for (const id of l.accessories ?? [])
    add(`acc.${id}`, "accessories", "accessory", { ...person, ...ACC.get(id)!.slotDefaults, ...theme });
  if (l.helmet) {
    const h = HELMET.get(l.helmet)!;
    add(`helmet.${h.id}`, "helmets", "helmet", { ...person, ...h.slotDefaults, ...theme });
    if (l.visor) {
      const vis = VISOR.get(l.visor)!;
      add(`visor.${h.id}.${vis.id}`, "helmets", "visor", { ...person, ...h.slotDefaults, ...theme, glass: vis.glass });
    }
  }
  if (l.mask) {
    const m = MASK.get(l.mask)!;
    add(`mask.${m.id}`, "masks", "mask", { ...person, ...m.slotDefaults, ...theme });
  }
  return {
    nodes,
    hairMode,
    hidden,
    face: {
      variant: l.faceVariant,
      tints: { skin: skin.hex, eye: eye.hex, hair: beard.hex },
      eyeEmissive: eye.emissive,
      mouthHidden: hidden.includes("mouth"),
    },
  };
}

/** Every GLB node a complete kit must contain, derived from the catalog (used by tests and loaders). */
export function expectedHeadNodes(): string[] {
  const out: string[] = C.heads.map((h) => `head.${h.id}`);
  for (const h of C.hairStyles)
    for (const m of ["full", "cap", "fringe"]) out.push(`hair.${h.id}.${m}`, `hair.${h.id}.${m}.lod1`);
  for (const f of C.facialHair) out.push(`facialhair.${f.id}`);
  for (const d of C.details) if (d.kind === "overlay") out.push(`detail.${d.id}`);
  for (const a of C.accessories) out.push(`acc.${a.id}`);
  for (const h of C.helmets) {
    out.push(`helmet.${h.id}`);
    for (const v of h.visors) out.push(`visor.${h.id}.${v}`);
  }
  for (const m of C.masks) out.push(`mask.${m.id}`);
  return out;
}

/** Hair nodes have a `.lod1` twin (merged strands, no bevel) for distant crew. */
export const HAIR_LOD_SUFFIX = ".lod1";

export function crewHeadAssetUrl(fileKey: string) {
  const style = fileKey.startsWith("hair/") ? fileKey.slice(5) : null;
  const file = style ? (HAIR.has(style) ? C.files.hair.replace("{style}", style) : undefined) : C.files[fileKey];
  if (!file) throw new Error(`unknown crew head file ${fileKey}`);
  return `${CREW_HEAD_ASSET_BASE}${file}?revision=r${String(C.revision).padStart(3, "0")}`;
}

export function crewFaceAtlasUrl(variant: string) {
  const v = A.variants[variant];
  if (!v) throw new Error(`unknown face variant ${variant}`);
  return `${CREW_HEAD_ASSET_BASE}face/${v.file}?revision=r${String(C.revision).padStart(3, "0")}`;
}
