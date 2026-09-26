/**
 * Voxel crew bundle (CHAR-BODY r004): 1/32 m voxel body, `crew_rig`, sockets and the baked
 * animation library. PROPOSAL ART — not owner-approved. The legacy r008 modular bundle stays
 * the default; the voxel bundle is only selected through `resolveCrewBundle` when a local
 * preview is explicitly enabled, so nothing live changes without owner approval.
 */
export const CREW_BUNDLES = ["legacy", "voxel"] as const;
export type CrewBundle = (typeof CREW_BUNDLES)[number];

export const VOXEL_CREW_REVISION = "r004";
export const VOXEL_CREW_FACE_ATLAS_URL = `/assets/crew/voxel/${VOXEL_CREW_REVISION}/face/face-atlas.json?revision=${VOXEL_CREW_REVISION}`;
export const VOXEL_CREW_FACE_IMAGE_URL = `/assets/crew/voxel/${VOXEL_CREW_REVISION}/face/face-default.png?revision=${VOXEL_CREW_REVISION}`;
export const VOXEL_CREW_ASSET_URL = `/assets/crew/voxel/${VOXEL_CREW_REVISION}/crew-body.glb?revision=${VOXEL_CREW_REVISION}`;

export const VOXEL_CREW_VARIANTS = ["male", "female", "neutral"] as const;
export type VoxelCrewVariant = (typeof VOXEL_CREW_VARIANTS)[number];

/** Exact action names authored on crew_rig (CHARACTER_SPEC v1) plus documented extras. */
export const VOXEL_CREW_ACTIONS = [
  "idle", "idle_armed", "walk", "run", "crouch_idle", "crouch_walk", "aim_rifle", "aim_pistol",
  "shoot_rifle", "shoot_pistol", "reload", "melee_swing", "throw", "pick_up", "carry_idle",
  "carry_walk", "use_interact", "repair_loop", "sit", "sit_idle", "wave", "point", "cheer",
  "thumbs_up", "emote_happy", "emote_sad", "emote_angry", "emote_confused", "celebrate", "hurt",
  "death", "knocked_out", "revive", "jetpack_hover", "climb_ladder",
] as const;
export const VOXEL_CREW_EXTRA_ACTIONS = [
  "idle_pistol", "draw_pistol", "holster_pistol", "draw_rifle", "holster_rifle",
] as const;
export type VoxelCrewAction =
  | (typeof VOXEL_CREW_ACTIONS)[number]
  | (typeof VOXEL_CREW_EXTRA_ACTIONS)[number];

export const VOXEL_CREW_LOOPING: ReadonlySet<VoxelCrewAction> = new Set<VoxelCrewAction>([
  "idle", "idle_armed", "idle_pistol", "walk", "run", "crouch_idle", "crouch_walk", "aim_rifle",
  "aim_pistol", "shoot_rifle", "carry_idle", "carry_walk", "repair_loop", "sit_idle",
  "knocked_out", "jetpack_hover", "climb_ladder",
]);

/** Authored in-place locomotion speeds (m/s) used to scale playback to gameplay speed. */
export const VOXEL_CREW_NOMINAL_SPEED: Partial<Record<VoxelCrewAction, number>> = {
  walk: 2.153,
  run: 3.864,
  crouch_walk: 0.483,
  carry_walk: 0.773,
};

/** Body mesh regions (GEO-crew-<region>-<variant>); outfit layers hide the regions they replace. */
export const VOXEL_CREW_REGIONS = ["base", "hands", "head", "suit", "gear", "hair"] as const;
export type VoxelCrewRegion = (typeof VOXEL_CREW_REGIONS)[number];
export type VoxelCrewOutfit = { suit: boolean; gear: boolean };
export const VOXEL_CREW_DEFAULT_OUTFIT: VoxelCrewOutfit = { suit: true, gear: true };
/** Regions hidden by the outfit: a suit replaces the underwear base body, gear gloves replace hands. */
export function voxelCrewHiddenRegions(outfit: VoxelCrewOutfit): VoxelCrewRegion[] {
  const hidden: VoxelCrewRegion[] = [];
  if (outfit.suit) hidden.push("base");
  else hidden.push("suit");
  if (outfit.gear) hidden.push("hands");
  else hidden.push("gear");
  return hidden;
}

/** Face expression tracks per action (frame -> expression; "blink" cues a blink). Mirrors anims.py. */
export const VOXEL_CREW_EXPRESSION_TRACKS: Partial<Record<VoxelCrewAction, readonly (readonly [number, string])[]>> = {
  idle: [[0, "neutral"], [30, "blink"], [62, "blink"]],
  emote_happy: [[0, "neutral"], [3, "happy"], [33, "neutral"]],
  emote_sad: [[0, "neutral"], [6, "sad"], [40, "neutral"]],
  emote_angry: [[0, "neutral"], [4, "angry"], [34, "neutral"]],
  emote_confused: [[0, "neutral"], [6, "confused"], [30, "neutral"]],
  hurt: [[0, "hurt"], [14, "neutral"]],
  death: [[0, "hurt"], [14, "scared"], [22, "knocked_out"]],
  knocked_out: [[0, "knocked_out"]],
  revive: [[0, "knocked_out"], [10, "sleepy"], [26, "neutral"]],
  cheer: [[0, "grin"]],
  celebrate: [[0, "determined"], [7, "grin"]],
  wave: [[0, "happy"]],
  thumbs_up: [[0, "neutral"], [5, "wink"], [20, "neutral"]],
  point: [[0, "determined"]],
  aim_rifle: [[0, "determined"]],
  aim_pistol: [[0, "determined"]],
  shoot_rifle: [[0, "determined"]],
  shoot_pistol: [[0, "determined"]],
  melee_swing: [[0, "determined"], [7, "angry"], [20, "determined"]],
  throw: [[0, "determined"]],
  repair_loop: [[0, "determined"]],
  jetpack_hover: [[0, "surprised"]],
  sit_idle: [[0, "neutral"], [40, "blink"]],
  carry_walk: [[0, "determined"]],
  pick_up: [[0, "neutral"], [8, "determined"], [26, "neutral"]],
  climb_ladder: [[0, "determined"]],
};

/** Expression (ignoring blink cues) at `frame` of an action; undefined when the action has no track. */
export function voxelCrewExpressionAt(action: VoxelCrewAction, frame: number): string | undefined {
  const track = VOXEL_CREW_EXPRESSION_TRACKS[action];
  if (!track) return undefined;
  let expression: string | undefined;
  for (const [f, e] of track) if (e !== "blink" && f <= frame) expression = e;
  return expression;
}

/** Socket node names exported in the GLB (children of the crew_rig joints). */
export const VOXEL_CREW_SOCKETS = [
  "socket.head", "socket.face", "socket.eyes", "socket.chest", "socket.back", "socket.belt",
  "socket.shoulder.L", "socket.shoulder.R", "socket.hip.L", "socket.hip.R", "socket.hand.L",
  "socket.hand.R", "socket.foot.L", "socket.foot.R", "socket.glove.L", "socket.glove.R",
] as const;
export type VoxelCrewSocket = (typeof VOXEL_CREW_SOCKETS)[number];

export const VOXEL_CREW_MATERIAL_SLOTS = [
  "skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass", "face",
] as const;
export type VoxelCrewMaterialSlot = (typeof VOXEL_CREW_MATERIAL_SLOTS)[number];

/** Upper-body bones used when an aim/action layer overrides locomotion. */
export const VOXEL_CREW_UPPER_BONES = [
  "spine", "chest", "neck", "head", "shoulder.L", "shoulder.R", "upper_arm.L", "upper_arm.R",
  "forearm.L", "forearm.R", "hand.L", "hand.R",
] as const;

/**
 * Pure selection of the preview bundle. Only an explicit local preview enables the voxel bundle:
 * `enabled` must come from a build-time/dev flag, and the query only chooses among allowed values.
 */
export function resolveCrewBundle(input: {
  previewEnabled: boolean;
  query?: string | null;
}): CrewBundle {
  if (!input.previewEnabled) return "legacy";
  return input.query === "voxel" ? "voxel" : "legacy";
}
