import { crewWardrobeItem } from "./crew-wardrobe";

/**
 * Voxel crew bundle (CHAR-BODY r005): 1/32 m voxel body, `crew_rig`, sockets and the baked
 * animation library. Accepted as a first revision (wiki: Decisions/2026-09-27 First Revision Art
 * Acceptance) together with the head kit, weapons and armour r006; it is the game's only crew
 * (the r008 modular bundle and its `?crew=legacy` fallback were retired on 2026-09-29).
 */

export const VOXEL_CREW_REVISION = "r005";
export const VOXEL_CREW_FACE_ATLAS_URL = `/assets/crew/voxel/${VOXEL_CREW_REVISION}/face/face-atlas.json?revision=${VOXEL_CREW_REVISION}`;
export const VOXEL_CREW_FACE_IMAGE_URL = `/assets/crew/voxel/${VOXEL_CREW_REVISION}/face/face-default.png?revision=${VOXEL_CREW_REVISION}`;
export const VOXEL_CREW_ASSET_URL = `/assets/crew/voxel/${VOXEL_CREW_REVISION}/crew-body.glb?revision=${VOXEL_CREW_REVISION}`;

export const VOXEL_CREW_VARIANTS = ["male", "female", "neutral"] as const;
export type VoxelCrewVariant = (typeof VOXEL_CREW_VARIANTS)[number];

/** Exact action names authored on crew_rig (CHARACTER_SPEC v1) plus documented extras. */
export const VOXEL_CREW_ACTIONS = [
  "idle",
  "idle_armed",
  "walk",
  "run",
  "crouch_idle",
  "crouch_walk",
  "aim_rifle",
  "aim_pistol",
  "shoot_rifle",
  "shoot_pistol",
  "reload",
  "melee_swing",
  "throw",
  "pick_up",
  "carry_idle",
  "carry_walk",
  "use_interact",
  "repair_loop",
  "sit",
  "sit_idle",
  "wave",
  "point",
  "cheer",
  "thumbs_up",
  "emote_happy",
  "emote_sad",
  "emote_angry",
  "emote_confused",
  "celebrate",
  "hurt",
  "death",
  "knocked_out",
  "revive",
  "jetpack_hover",
  "climb_ladder",
] as const;
export const VOXEL_CREW_EXTRA_ACTIONS = [
  "idle_pistol",
  "draw_pistol",
  "holster_pistol",
  "draw_rifle",
  "holster_rifle",
  "ZeroG_Prone",
  "ZeroG_Flight",
  "ZeroG_Swim",
  "ZeroG_Locomotion_Prone",
  "ZeroG_Enter",
  "ZeroG_Exit",
  "Maglock_Walk",
  "Maglock_Idle",
] as const;
/**
 * EVA clips (owner names, 2026-09-29; contract `_shared/ZEROG_ANIMS_NOTICE.md`), authored in
 * parallel. The runtime plays them when the bundle has them and falls back otherwise.
 */
export const VOXEL_CREW_EVA_ACTIONS = [
  "ZeroG_Prone",
  "ZeroG_Flight",
  "ZeroG_Swim",
  "ZeroG_Locomotion_Prone",
  "ZeroG_Enter",
  "ZeroG_Exit",
  "Maglock_Idle",
  "Maglock_Walk",
] as const;
export type VoxelCrewAction =
  | (typeof VOXEL_CREW_ACTIONS)[number]
  | (typeof VOXEL_CREW_EXTRA_ACTIONS)[number]
  | (typeof VOXEL_CREW_EVA_ACTIONS)[number];
/** Clip played while an EVA clip is missing from the loaded bundle. */
export const VOXEL_CREW_CLIP_FALLBACK: Partial<
  Record<VoxelCrewAction, VoxelCrewAction>
> = {
  ZeroG_Prone: "idle",
  ZeroG_Swim: "idle",
  ZeroG_Flight: "jetpack_hover",
  ZeroG_Locomotion_Prone: "jetpack_hover",
  Maglock_Idle: "idle",
  Maglock_Walk: "walk",
};
/** Zero-g loops that show the body prone (belly-down); the runtime pitches the model itself only
 * while such a clip is missing (the authored clips bake the prone pose in). */
export const VOXEL_CREW_PRONE_ACTIONS: ReadonlySet<VoxelCrewAction> =
  new Set<VoxelCrewAction>([
    "ZeroG_Prone",
    "ZeroG_Flight",
    "ZeroG_Swim",
    "ZeroG_Locomotion_Prone",
  ]);

export const VOXEL_CREW_LOOPING: ReadonlySet<VoxelCrewAction> =
  new Set<VoxelCrewAction>([
    "idle",
    "idle_armed",
    "idle_pistol",
    "walk",
    "run",
    "crouch_idle",
    "crouch_walk",
    "aim_rifle",
    "aim_pistol",
    "shoot_rifle",
    "carry_idle",
    "carry_walk",
    "repair_loop",
    "sit_idle",
    "knocked_out",
    "jetpack_hover",
    "climb_ladder",
    "ZeroG_Prone",
    "ZeroG_Flight",
    "ZeroG_Swim",
    "ZeroG_Locomotion_Prone",
    "Maglock_Walk",
    "Maglock_Idle",
  ]);

/** Ankle joint height above the deck at rest (CHARACTER_SPEC_BODY r005 `ankleVox` 3 × 1/32 m). */
export const VOXEL_CREW_ANKLE_HEIGHT_M = 3 / 32;

/**
 * Authored in-place locomotion speeds (m/s): the planted foot's backward speed in the body frame,
 * measured from the r005 clips (voxel-crew-stride.test.ts keeps these within 5 %). Playback rate =
 * gameplay speed / nominal, so a planted foot stays put on the deck.
 */
export const VOXEL_CREW_NOMINAL_SPEED: Partial<
  Record<VoxelCrewAction, number>
> = {
  walk: 1.791,
  run: 6.124,
  crouch_walk: 0.403,
  carry_walk: 0.643,
  Maglock_Walk: 0.9,
};

/** Body mesh regions (GEO-crew-<region>-<variant>); outfit layers hide the regions they replace. */
export const VOXEL_CREW_REGIONS = [
  "base",
  "hands",
  "head",
  "suit",
  "gear",
  "hair",
] as const;
export type VoxelCrewRegion = (typeof VOXEL_CREW_REGIONS)[number];
export type VoxelCrewOutfit = { suit: boolean; gear: boolean };
/**
 * Nothing equipped draws the base body: privacy shorts, plus a sports bra on the
 * feminine body (owner rule 2026-09-29; replaces the #52 jumpsuit default).
 */
export const VOXEL_CREW_DEFAULT_OUTFIT: VoxelCrewOutfit = {
  suit: false,
  gear: false,
};
/**
 * The whole jumpsuit appears with a valid equipped uniform (which tints it).
 * Loaded armor separately owns regional cloth through the renderer assembly helper.
 * The body's built-in "gear" layer
 * (harness, pads, gloves, back plate) is never drawn: armour, gloves and packs come
 * from their own equipped parts (crew-armor), so an empty slot shows nothing.
 */
export function voxelCrewOutfitFor(
  equipped: Readonly<Partial<Record<string, string | undefined>>> | undefined,
): VoxelCrewOutfit {
  const uniform = equipped?.uniform
    ? crewWardrobeItem(equipped.uniform)
    : undefined;
  return { suit: uniform?.slot === "uniform" && !!uniform.suit, gear: false };
}
/** Regions hidden by the outfit: a suit replaces the underwear base body, gear gloves replace hands. */
export function voxelCrewHiddenRegions(
  outfit: VoxelCrewOutfit,
): VoxelCrewRegion[] {
  const hidden: VoxelCrewRegion[] = [];
  if (outfit.suit) hidden.push("base");
  else hidden.push("suit");
  if (outfit.gear) hidden.push("hands");
  else hidden.push("gear");
  return hidden;
}

/** Face expression tracks per action (frame -> expression; "blink" cues a blink). Mirrors anims.py. */
export const VOXEL_CREW_EXPRESSION_TRACKS: Partial<
  Record<VoxelCrewAction, readonly (readonly [number, string])[]>
> = {
  idle: [
    [0, "neutral"],
    [30, "blink"],
    [62, "blink"],
  ],
  emote_happy: [
    [0, "neutral"],
    [3, "happy"],
    [33, "neutral"],
  ],
  emote_sad: [
    [0, "neutral"],
    [6, "sad"],
    [40, "neutral"],
  ],
  emote_angry: [
    [0, "neutral"],
    [4, "angry"],
    [34, "neutral"],
  ],
  emote_confused: [
    [0, "neutral"],
    [6, "confused"],
    [30, "neutral"],
  ],
  hurt: [
    [0, "hurt"],
    [14, "neutral"],
  ],
  death: [
    [0, "hurt"],
    [14, "scared"],
    [22, "knocked_out"],
  ],
  knocked_out: [[0, "knocked_out"]],
  revive: [
    [0, "knocked_out"],
    [10, "sleepy"],
    [26, "neutral"],
  ],
  cheer: [[0, "grin"]],
  celebrate: [
    [0, "determined"],
    [7, "grin"],
  ],
  wave: [[0, "happy"]],
  thumbs_up: [
    [0, "neutral"],
    [5, "wink"],
    [20, "neutral"],
  ],
  point: [[0, "determined"]],
  aim_rifle: [[0, "determined"]],
  aim_pistol: [[0, "determined"]],
  shoot_rifle: [[0, "determined"]],
  shoot_pistol: [[0, "determined"]],
  melee_swing: [
    [0, "determined"],
    [7, "angry"],
    [20, "determined"],
  ],
  throw: [[0, "determined"]],
  repair_loop: [[0, "determined"]],
  jetpack_hover: [[0, "surprised"]],
  sit_idle: [
    [0, "neutral"],
    [40, "blink"],
  ],
  carry_walk: [[0, "determined"]],
  pick_up: [
    [0, "neutral"],
    [8, "determined"],
    [26, "neutral"],
  ],
  climb_ladder: [[0, "determined"]],
};

/** Expression (ignoring blink cues) at `frame` of an action; undefined when the action has no track. */
export function voxelCrewExpressionAt(
  action: VoxelCrewAction,
  frame: number,
): string | undefined {
  const track = VOXEL_CREW_EXPRESSION_TRACKS[action];
  if (!track) return undefined;
  let expression: string | undefined;
  for (const [f, e] of track) if (e !== "blink" && f <= frame) expression = e;
  return expression;
}

/** Socket node names exported in the GLB (children of the crew_rig joints). */
export const VOXEL_CREW_SOCKETS = [
  "socket.head",
  "socket.face",
  "socket.eyes",
  "socket.chest",
  "socket.back",
  "socket.jetpack.exhaust.L",
  "socket.jetpack.exhaust.R",
  "socket.belt",
  "socket.shoulder.L",
  "socket.shoulder.R",
  "socket.hip.L",
  "socket.hip.R",
  "socket.hand.L",
  "socket.hand.R",
  "socket.foot.L",
  "socket.foot.R",
  "socket.glove.L",
  "socket.glove.R",
] as const;
export type VoxelCrewSocket = (typeof VOXEL_CREW_SOCKETS)[number];

export const VOXEL_CREW_MATERIAL_SLOTS = [
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
export type VoxelCrewMaterialSlot = (typeof VOXEL_CREW_MATERIAL_SLOTS)[number];

/** Upper-body bones used when an aim/action layer overrides locomotion. */
export const VOXEL_CREW_UPPER_BONES = [
  "spine",
  "chest",
  "neck",
  "head",
  "shoulder.L",
  "shoulder.R",
  "upper_arm.L",
  "upper_arm.R",
  "forearm.L",
  "forearm.R",
  "hand.L",
  "hand.R",
] as const;
