/** Native r009 face atlas order. Existing IDs must never be reordered. */
export const CHARACTER_EXPRESSIONS = [
  "neutral",
  "happy",
  "stern",
  "sad",
  "surprised",
  "wink",
  "grin",
  "determined",
] as const;
export const CHARACTER_FACE_DETAILS = [
  "none",
  "freckles",
  "scar",
  "scratch",
  "tattoo",
  "bandage",
  "dirt",
  "warpaint",
  "cyber",
  "birthmark",
] as const;
export const CHARACTER_FACIAL_HAIR = [
  "none",
  "stubble",
  "short",
  "full",
  "goatee",
  "moustache",
  "handlebar",
  "sideburns",
] as const;
export const CHARACTER_FACE_AGES = [
  "young",
  "adult",
  "mature",
  "elder",
] as const;
export type CharacterExpression = (typeof CHARACTER_EXPRESSIONS)[number];
export type CharacterFaceDetail = (typeof CHARACTER_FACE_DETAILS)[number];
export type CharacterFacialHair = (typeof CHARACTER_FACIAL_HAIR)[number];
export type CharacterFaceAge = (typeof CHARACTER_FACE_AGES)[number];

export const CHARACTER_FACE_DEFAULTS = {
  eyes: "#754c2b",
  expression: "neutral",
  faceDetail: "none",
  facialHair: "none",
  faceAge: "adult",
} as const;

/** Presets are conveniences; the persisted color contract accepts any RGB hex. */
export const CHARACTER_HAIR_COLORS = [
  ["Black", "#211c20"],
  ["Dark brown", "#3b2823"],
  ["Chestnut", "#75422c"],
  ["Auburn", "#a55232"],
  ["Blonde", "#d1aa64"],
  ["Platinum", "#dfded5"],
  ["Silver", "#909baa"],
  ["Teal", "#2a8c95"],
  ["Espresso", "#30221e"],
  ["Chocolate", "#57382b"],
  ["Copper", "#bc683a"],
  ["Strawberry", "#cc9870"],
  ["Honey", "#b88945"],
  ["Ash blonde", "#b3a48c"],
  ["White", "#f1eee6"],
  ["Charcoal", "#505460"],
  ["Hot pink", "#ff2497"],
  ["Electric blue", "#2864ff"],
  ["Cyan", "#20e6ef"],
  ["Orange", "#ff781f"],
  ["Red", "#e82d43"],
  ["Violet", "#9347ff"],
  ["Lime", "#a6ed28"],
  ["Emerald", "#20ad70"],
  ["Magenta", "#d52ee3"],
  ["Lavender", "#c099f0"],
  ["Rose", "#ec9bbc"],
  ["Ice blue", "#a2dfff"],
  ["Mint", "#87e8bf"],
  ["Navy", "#293b85"],
  ["Burgundy", "#7e284d"],
  ["Gold", "#f1ce45"],
] as const;
export const CHARACTER_EYE_COLORS = [
  ["Brown", CHARACTER_FACE_DEFAULTS.eyes],
  ["Blue", "#3b82c4"],
  ["Green", "#56894f"],
  ["Hazel", "#8c823f"],
  ["Grey", "#93a0ad"],
  ["Amber", "#c88a2b"],
  ["Red", "#e3374d"],
  ["Cyan", "#29d9ef"],
] as const;

/** These explicit character choices survive selecting a different uniform. */
export const CHARACTER_PERSONAL_APPEARANCE_KEYS = [
  "bodyType",
  "hairStyle",
  "skin",
  "hair",
  "eyes",
  "expression",
  "faceDetail",
  "facialHair",
  "faceAge",
] as const;
