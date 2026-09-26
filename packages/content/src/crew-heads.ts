/**
 * Crew head kit v1: the data contract for modular voxel heads.
 *
 * Status: proposal. The art is unsigned and nothing here is wired into the live game yet.
 * `crew-heads.v1.json` is the single source of truth. The Blender generator
 * (scripts/art_library/crew_heads/build.py) reads the same catalog and exports one GLB node per
 * part (see assets/runtime/crew/heads/v1/crew-heads.manifest.json).
 *
 * Every part is authored rigidly in head space: origin at the `head` bone rest head. The runtime
 * parents the part nodes to the head bone. Skin, hair and eye colours, themes and player colours
 * are slot values (materials are named after the 10 slots), not geometry.
 * These cosmetics grant no inventory item, stat or gameplay capability. Helmets, visors and masks
 * are listed here for their visuals only. Equipment authority stays with the inventory/equipment
 * contracts.
 */
import catalog from "./crew-heads.v1.json";

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
] as const;
export type CrewHeadSlot = (typeof CREW_HEAD_SLOTS)[number];
export type SlotValues = Partial<Record<CrewHeadSlot, string>>;

export const HAIR_MODES = ["full", "cap", "fringe", "hidden"] as const;
export type HairMode = (typeof HAIR_MODES)[number];
export type FaceFeature = "eyes" | "brows" | "mouth";
export type HideTarget = "mouth" | "facialHair";

interface Referenced {
  id: string;
  label: string;
  reference?: string[];
}
export interface BaseFace extends Referenced {
  sex: "male" | "female";
  age: "young" | "adult" | "middle" | "older";
}
export interface Expression extends Referenced {
  eyes: string;
  brows: string;
  mouth: string;
}
export interface PaletteEntry extends Referenced {
  hex: string;
  emissive?: boolean;
}
export interface HairStyle extends Referenced {
  group: "short" | "medium" | "long" | "updo";
}
export interface FacialDetail extends Referenced {
  kind: "marking" | "overlay";
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
  };
  files: Record<string, string>;
  baseFaces: BaseFace[];
  faceFeatures: Record<FaceFeature, string[]>;
  expressions: Expression[];
  animationExpressions: Record<string, string>;
  /** Slot values for base head and face nodes: emit = eye catchlights and teeth (soft, not a lamp). */
  faceSlotDefaults: SlotValues;
  faceEmitStrength: number;
  /** Blush is painted with the accent slot on the head node: skin blended toward hex by amount. */
  blush: { hex: string; amount: number };
  blink: { expression: string; intervalSeconds: [number, number]; durationSeconds: number; onlyFrom: string[] };
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

export const CREW_HEAD_CATALOG = catalog as unknown as CrewHeadCatalog;
export const CREW_HEAD_ASSET_BASE = "/assets/crew/heads/v1/";
export const CREW_HEAD_MANIFEST_URL = `${CREW_HEAD_ASSET_BASE}crew-heads.manifest.json`;

/** Persisted head appearance. Colour fields take a palette id or any `#rrggbb` value. */
export interface HeadLoadout {
  baseFace: string;
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
  baseFace: "male_adult",
  skin: "tan",
  hairColor: "dark_brown",
  eyes: "brown",
  hair: "short_waves",
};

const HEX = /^#[0-9a-f]{6}$/i;
const byId = <T extends { id: string }>(items: readonly T[]) =>
  new Map(items.map((item) => [item.id, item]));
const C = CREW_HEAD_CATALOG;
const BASE = byId(C.baseFaces);
const EXPR = byId(C.expressions);
const HAIR = byId(C.hairStyles);
const BEARD = byId(C.facialHair);
const DETAIL = byId(C.details);
const ACC = byId(C.accessories);
const HELMET = byId(C.helmets);
const VISOR = byId(C.visors);
const MASK = byId(C.masks);

/** `ears` covers both single-ear layers so a headset and an earring conflict. */
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

/** Brows read darker than the hair they match (reference sheet), 0..1 multiplier in sRGB. */
export const BROW_SHADE = 0.6;
export function shadeHex(hex: string, factor: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(a: string, b: string, t: number) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

export interface HeadValidation {
  ok: boolean;
  errors: string[];
}

/** Validates ids, colour values, layer/zone conflicts and helmet/visor/mask pairing. */
export function validateHeadLoadout(l: HeadLoadout): HeadValidation {
  const errors: string[] = [];
  if (!BASE.has(l.baseFace)) errors.push(`unknown baseFace ${l.baseFace}`);
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
  for (const id of details) {
    const d = DETAIL.get(id);
    if (!d) {
      errors.push(`unknown detail ${id}`);
      continue;
    }
    for (const z of d.zones) {
      const prior = zones.get(z);
      if (prior) errors.push(`details ${prior} and ${id} overlap on ${z}`);
      else zones.set(z, id);
    }
  }
  // Worn layers: accessories, helmet and mask exclude each other; face-mounted details only
  // conflict with accessories (they sit inside helmet cavities without touching the shell).
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
    else {
      if (helmet && !helmet.openFace) errors.push(`mask ${m.id} needs an open-face helmet or none`);
      else claim(m.layers, `mask ${m.id}`);
    }
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

/** The three swappable face nodes for an expression (animations switch these by visibility). */
export function expressionNodes(baseFace: string, expression: string) {
  const e = EXPR.get(expression) ?? EXPR.get("neutral")!;
  return {
    eyes: `face.${baseFace}.eyes.${e.eyes}`,
    brows: `face.${baseFace}.brows.${e.brows}`,
    mouth: `face.${baseFace}.mouth.${e.mouth}`,
  };
}

export type HeadPartRole =
  | "head"
  | "eyes"
  | "brows"
  | "mouth"
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
  /** Key into CREW_HEAD_CATALOG.files. */
  file: string;
  role: HeadPartRole;
  /** Slot values for this node's material instances (hex, or a glass preset id for `glass`). */
  slots: SlotValues;
  /** Slots whose value is emissive (cyber eyes). */
  emissiveSlots: CrewHeadSlot[];
  /** Emission strength for the emit slot when it is a soft face highlight rather than a lamp. */
  emitStrength?: number;
}
export interface ResolvedHead {
  nodes: ResolvedHeadNode[];
  hairMode: HairMode;
  hidden: HideTarget[];
}

/**
 * Nodes to show for a loadout and expression, with their slot values. `theme` recolours the suit
 * roles (suit_primary, suit_secondary, accent) of worn items, for example to apply player colours.
 * Throws on an invalid loadout. Validate first when the input is untrusted.
 */
export function resolveHeadLoadout(
  l: HeadLoadout,
  expression = "neutral",
  theme: SlotValues = {},
): ResolvedHead {
  const v = validateHeadLoadout(l);
  if (!v.ok) throw new Error(`invalid head loadout: ${v.errors.join("; ")}`);
  const skin = resolvePaletteColor("skin", l.skin)!;
  const hair = resolvePaletteColor("hair", l.hairColor)!;
  const beard = l.facialHairColor ? resolvePaletteColor("hair", l.facialHairColor)! : hair;
  const eye = resolvePaletteColor("eye", l.eyes)!;
  const person: SlotValues = { skin: skin.hex, hair: hair.hex, eye: eye.hex };
  const emissive: CrewHeadSlot[] = eye.emissive ? ["eye"] : [];
  const worn: Array<{ hides: HideTarget[] }> = [
    ...(l.accessories ?? []).map((id) => ACC.get(id)!),
    ...(l.helmet ? [HELMET.get(l.helmet)!] : []),
    ...(l.mask ? [MASK.get(l.mask)!] : []),
  ];
  const hidden = [...new Set(worn.flatMap((w) => w.hides))];
  const hairMode = hairModeFor(l);
  const face = expressionNodes(l.baseFace, expression);
  const nodes: ResolvedHeadNode[] = [];
  const add = (node: string, file: string, role: HeadPartRole, slots: SlotValues) =>
    nodes.push({ node, file, role, slots, emissiveSlots: emissive });
  const facePart = (node: string, role: HeadPartRole, slots: SlotValues) =>
    nodes.push({ node, file: "heads", role, slots: { ...slots, ...C.faceSlotDefaults, accent: mixHex(skin.hex, C.blush.hex, C.blush.amount) }, emissiveSlots: emissive, emitStrength: C.faceEmitStrength });
  facePart(`head.${l.baseFace}`, "head", person);
  facePart(face.eyes, "eyes", person);
  facePart(face.brows, "brows", { ...person, hair: shadeHex(beard.hex, BROW_SHADE) });
  if (!hidden.includes("mouth")) facePart(face.mouth, "mouth", person);
  if (l.hair && hairMode !== "hidden") add(`hair.${l.hair}.${hairMode}`, "hair", "hair", person);
  if (l.facialHair && !hidden.includes("facialHair"))
    add(`facialhair.${l.facialHair}`, "facial-hair", "facialHair", { ...person, hair: beard.hex });
  for (const id of l.details ?? [])
    add(`detail.${id}`, "details", "detail", { ...person, ...DETAIL.get(id)!.slotDefaults });
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
  return { nodes, hairMode, hidden };
}

/** Every GLB node a complete kit must contain, derived from the catalog (used by tests and loaders). */
export function expectedHeadNodes(): string[] {
  const out: string[] = [];
  for (const b of C.baseFaces) {
    out.push(`head.${b.id}`);
    for (const f of ["eyes", "brows", "mouth"] as const)
      for (const s of C.faceFeatures[f]) out.push(`face.${b.id}.${f}.${s}`);
  }
  for (const h of C.hairStyles) for (const m of ["full", "cap", "fringe"]) out.push(`hair.${h.id}.${m}`);
  for (const f of C.facialHair) out.push(`facialhair.${f.id}`);
  for (const d of C.details) out.push(`detail.${d.id}`);
  for (const a of C.accessories) out.push(`acc.${a.id}`);
  for (const h of C.helmets) {
    out.push(`helmet.${h.id}`);
    for (const v of h.visors) out.push(`visor.${h.id}.${v}`);
  }
  for (const m of C.masks) out.push(`mask.${m.id}`);
  return out;
}

export function crewHeadAssetUrl(fileKey: string) {
  const file = C.files[fileKey];
  if (!file) throw new Error(`unknown crew head file ${fileKey}`);
  return `${CREW_HEAD_ASSET_BASE}${file}?revision=r${String(C.revision).padStart(3, "0")}`;
}
