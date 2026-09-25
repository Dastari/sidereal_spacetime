/**
 * Voxel crew bundle (CHAR-BODY r001): 1/32 m voxel body, `crew_rig`, sockets and the baked
 * animation library. PROPOSAL ART — not owner-approved. The legacy r008 modular bundle stays
 * the default; the voxel bundle is only selected through `resolveCrewBundle` when a local
 * preview is explicitly enabled, so nothing live changes without owner approval.
 */
export const CREW_BUNDLES = ["legacy", "voxel"] as const;
export type CrewBundle = (typeof CREW_BUNDLES)[number];

export const VOXEL_CREW_REVISION = "r001";
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
export const VOXEL_CREW_EXTRA_ACTIONS = ["idle_pistol"] as const;
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
  walk: 1.667,
  run: 3.429,
  crouch_walk: 0.625,
  carry_walk: 1.333,
};

/** Socket node names exported in the GLB (children of the crew_rig joints). */
export const VOXEL_CREW_SOCKETS = [
  "socket.head", "socket.face", "socket.eyes", "socket.chest", "socket.back", "socket.belt",
  "socket.shoulder.L", "socket.shoulder.R", "socket.hip.L", "socket.hip.R", "socket.hand.L",
  "socket.hand.R", "socket.foot.L", "socket.foot.R", "socket.glove.L", "socket.glove.R",
] as const;
export type VoxelCrewSocket = (typeof VOXEL_CREW_SOCKETS)[number];

export const VOXEL_CREW_MATERIAL_SLOTS = [
  "skin", "hair", "eye", "suit_primary", "suit_secondary", "accent", "metal", "dark", "emit", "glass",
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
