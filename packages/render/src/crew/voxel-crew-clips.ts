import {
  VOXEL_CREW_LOOPING,
  VOXEL_CREW_NOMINAL_SPEED,
  type VoxelCrewAction,
} from "@sidereal/content/crew-voxel-bundle";
import { SPRINT_SPEED_MPS, WALK_SPEED_MPS } from "@sidereal/sim";

/** Presentation state for the voxel crew. Every field is optional except the legacy basics. */
export type VoxelCrewMotion = {
  moving: boolean;
  seated: boolean;
  combat?: boolean;
  sprinting?: boolean;
  /** Legacy semantic: playback-rate multiplier (1 = gameplay walk/sprint speed). */
  speed?: number;
  reducedMotion?: boolean;
  weaponPose?: "none" | "one-handed" | "rifle";
  crouching?: boolean;
  carrying?: boolean;
  climbing?: boolean;
  hovering?: boolean;
  downed?: boolean;
  dead?: boolean;
  /** Increments per accepted shot; a change plays one shoot action over the aim layer. */
  shotSequence?: number | bigint;
  /** One-shot actions (emotes, reload, interact...); a new sequence plays the action once. */
  action?: { name: VoxelCrewAction; sequence: number };
};

export type VoxelCrewWeapon = "none" | "pistol" | "rifle";

/** Either one full-body clip, or a lower (locomotion) clip with an upper-body override. */
export type VoxelCrewLayers =
  | { full: VoxelCrewAction; speedRatio: number }
  | { lower: VoxelCrewAction; upper: VoxelCrewAction; speedRatio: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function voxelCrewWeapon(motion: VoxelCrewMotion, fallback: VoxelCrewWeapon): VoxelCrewWeapon {
  if (motion.weaponPose === "rifle") return "rifle";
  if (motion.weaponPose === "one-handed") return "pistol";
  if (motion.weaponPose === "none") return "none";
  return fallback;
}

/** Locomotion playback rate so the authored in-place stride roughly matches gameplay speed. */
export function voxelCrewSpeedRatio(clip: VoxelCrewAction, motion: VoxelCrewMotion) {
  const nominal = VOXEL_CREW_NOMINAL_SPEED[clip];
  if (!nominal) return 1;
  const gameplay = clip === "run" ? SPRINT_SPEED_MPS : WALK_SPEED_MPS;
  const multiplier = Number.isFinite(motion.speed) ? motion.speed! : 1;
  const scale = clip === "crouch_walk" || clip === "carry_walk" ? 0.6 : 1;
  return clamp(((gameplay * scale) / nominal) * multiplier, 0.6, 1.6);
}

/** Pure mapping from gameplay presentation state to the voxel crew's animation layers. */
export function selectVoxelCrewLayers(
  motion: VoxelCrewMotion,
  weapon: VoxelCrewWeapon,
): VoxelCrewLayers {
  const full = (clip: VoxelCrewAction): VoxelCrewLayers => ({
    full: clip,
    speedRatio: voxelCrewSpeedRatio(clip, motion),
  });
  if (motion.dead) return full("death");
  if (motion.downed) return full("knocked_out");
  if (motion.seated) return full("sit_idle");
  if (motion.climbing) return full("climb_ladder");
  if (motion.hovering) return full("jetpack_hover");
  const armed = weapon !== "none" && !motion.carrying;
  const upper: VoxelCrewAction =
    weapon === "rifle"
      ? motion.combat && !motion.sprinting
        ? "aim_rifle"
        : "idle_armed"
      : motion.combat && !motion.sprinting
        ? "aim_pistol"
        : "idle_pistol";
  if (motion.moving) {
    const loco: VoxelCrewAction = motion.sprinting
      ? "run"
      : motion.crouching
        ? "crouch_walk"
        : motion.carrying
          ? "carry_walk"
          : "walk";
    if (!armed) return full(loco);
    return { lower: loco, upper, speedRatio: voxelCrewSpeedRatio(loco, motion) };
  }
  if (motion.carrying) return full("carry_idle");
  if (motion.crouching)
    return armed ? { lower: "crouch_idle", upper, speedRatio: 1 } : full("crouch_idle");
  return armed ? full(upper) : full("idle");
}

/** Actions that override only the upper body while the character keeps moving. */
const UPPER_BODY_ACTIONS = new Set<VoxelCrewAction>([
  "shoot_rifle", "shoot_pistol", "reload", "use_interact", "melee_swing", "throw", "wave", "point",
  "thumbs_up",
]);

export function voxelCrewActionLayer(action: VoxelCrewAction, moving: boolean): "upper" | "full" {
  if (action.startsWith("shoot")) return "upper";
  return moving && UPPER_BODY_ACTIONS.has(action) ? "upper" : "full";
}

export const voxelCrewLoops = (clip: VoxelCrewAction) => VOXEL_CREW_LOOPING.has(clip);

export function voxelCrewBlendDuration(previous: string, next: string) {
  if (previous === next) return 0;
  if (/sit|death|knocked|revive/.test(previous + next)) return 0.3;
  if (/shoot/.test(next)) return 0.04;
  if (/aim|armed|pistol/.test(previous + next)) return 0.16;
  return 0.2;
}
