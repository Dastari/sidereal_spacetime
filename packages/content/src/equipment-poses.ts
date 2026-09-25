/** Versioned PRESENTATION data. Metres/radians; no weapon stats or collision authority. */
export type PoseVector = readonly [number, number, number];
export type EquipmentPoseType =
  | "RIFLE"
  | "LONG_RIFLE"
  | "HEAVY_WEAPON"
  | "PISTOL_TWO_HAND"
  | "PISTOL_ONE_HAND"
  | "FLASHLIGHT"
  | "HANDHELD_DEVICE"
  | "TOOL";
export type EquipmentSocket =
  | "Grip.Primary"
  | "Grip.Secondary"
  | "SupportHandContact"
  | "Contact.Shoulder"
  | "Aim.Muzzle"
  | "Aim.Direction"
  | "Sight.Primary"
  | "Sight.EyeReference"
  | "Interaction.Contact"
  | "Display.Reference";
export interface PoseBox {
  name: string;
  center: PoseVector;
  half: PoseVector;
}
export interface EquipmentPoseProfile {
  version: 1;
  type: EquipmentPoseType;
  primaryHand: "R" | "L";
  secondaryHandMode: "foregrip" | "primary-hand" | "free";
  aimPivot: "shoulder" | "primary-grip";
  requiresShoulderContact: boolean;
  requiresEyeAlignment: boolean;
  deviceMode: "DIRECTED_DEVICE" | "VIEW_SCREEN_DEVICE";
  maxUpperBodyYaw: number;
  maxUpperBodyPitch: number;
  torsoAimContribution: number;
  hipAimContribution: number;
  turnStart: number;
  turnFull: number;
  rootRate: number;
  aimRate: number;
  acquireSeconds: number;
  releaseSeconds: number;
  recoilRadians: number;
  recoilMeters: number;
  maxStockContactCompressionM: number;
  maxShoulderGirdleM: number;
  elbowBendLimits: readonly [number, number];
  screenGripOffset: PoseVector;
  screenRoll: number;
  stanceYaw: number;
  shoulderPocketOffset: PoseVector;
  gripOffset: PoseVector;
  supportExtension: number;
  freeArmOffset: PoseVector;
  clearanceMargin: number;
  maxShoulderSeparation: number;
  maxCorrections: number;
  basePose: string;
  aimPoseSet: string;
  locomotionPoseSet: readonly string[];
}
const rad = (n: number) => (n * Math.PI) / 180;
const locomotion = ["Idle", "Walk", "Sprint", "Seated"] as const;
const common = {
  version: 1,
  primaryHand: "R",
  deviceMode: "DIRECTED_DEVICE",
  maxUpperBodyYaw: rad(45),
  maxUpperBodyPitch: rad(60),
  torsoAimContribution: 0.55,
  hipAimContribution: 0.18,
  turnStart: rad(35),
  turnFull: rad(65),
  rootRate: rad(160),
  aimRate: rad(190),
  acquireSeconds: 0.24,
  releaseSeconds: 0.22,
  recoilRadians: rad(3),
  recoilMeters: 0.018,
  supportExtension: 0,
  freeArmOffset: [-0.3, 1.04, -0.18],
  clearanceMargin: 0.012,
  maxShoulderSeparation: 0.13,
  maxCorrections: 12,
  locomotionPoseSet: locomotion,
} as const;
function profile(
  type: EquipmentPoseType,
  overrides: Partial<EquipmentPoseProfile>,
): EquipmentPoseProfile {
  return {
    ...common,
    type,
    secondaryHandMode: "free",
    aimPivot: "primary-grip",
    requiresShoulderContact: false,
    requiresEyeAlignment: false,
    maxStockContactCompressionM: 0.008,
    maxShoulderGirdleM: 0.045,
    elbowBendLimits: [0.08, 2.85],
    screenGripOffset: [0.27, 0.96, -0.36],
    screenRoll: 0,
    stanceYaw: 0.08,
    shoulderPocketOffset: [0.065, -0.01, -0.12],
    gripOffset: [0.26, 1.18, -0.36],
    basePose: `${type}.Aim.0.0`,
    aimPoseSet: `${type}.Aim`,
    locomotionPoseSet: locomotion.map(
      (name) => name + (type.includes("RIFLE") ? "-Rifle" : "-Pistol"),
    ),
    ...overrides,
  };
}
export const EQUIPMENT_POSE_PROFILES: Readonly<
  Record<EquipmentPoseType, EquipmentPoseProfile>
> = {
  // Retain the previous broad braced stance explicitly for future drills/miniguns.
  HEAVY_WEAPON: profile("HEAVY_WEAPON", {
    secondaryHandMode: "foregrip",
    aimPivot: "shoulder",
    requiresShoulderContact: true,
    hipAimContribution: 0.65,
    stanceYaw: 1.3,
    shoulderPocketOffset: [0.06, -0.08, 0.28],
    gripOffset: [0.25, 1.21, -0.18],
    aimPoseSet: "RIFLE.Aim",
  }),
  RIFLE: profile("RIFLE", {
    maxStockContactCompressionM: 0.01,
    secondaryHandMode: "foregrip",
    aimPivot: "shoulder",
    requiresShoulderContact: true,
    hipAimContribution: 0.2,
    stanceYaw: 0.35,
    shoulderPocketOffset: [0.24, 0.015, 0.24],
    maxShoulderGirdleM: 0.075,
    gripOffset: [0.25, 1.21, -0.18],
    turnStart: rad(10),
    turnFull: rad(40),
  }),
  LONG_RIFLE: profile("LONG_RIFLE", {
    secondaryHandMode: "foregrip",
    aimPivot: "shoulder",
    requiresShoulderContact: true,
    requiresEyeAlignment: true,
    hipAimContribution: 0.2,
    stanceYaw: 0.6,
    shoulderPocketOffset: [0.28, 0, 0.24],
    maxShoulderGirdleM: 0.075,
    supportExtension: 0.07,
    torsoAimContribution: 0.65,
    gripOffset: [0.25, 1.24, -0.19],
    turnStart: rad(10),
    turnFull: rad(40),
  }),
  PISTOL_TWO_HAND: profile("PISTOL_TWO_HAND", {
    secondaryHandMode: "primary-hand",
    gripOffset: [0, 1.18, -0.41],
  }),
  PISTOL_ONE_HAND: profile("PISTOL_ONE_HAND", {
    gripOffset: [0.29, 1.23, -0.42],
    freeArmOffset: [-0.32, 0.78, 0.04],
  }),
  FLASHLIGHT: profile("FLASHLIGHT", {
    gripOffset: [0.3, 1.16, -0.3],
    recoilRadians: 0,
    recoilMeters: 0,
  }),
  HANDHELD_DEVICE: profile("HANDHELD_DEVICE", {
    screenRoll: -0.6,
    screenGripOffset: [0.2, 1.05, -0.32],
    gripOffset: [0.22, 1.12, -0.32],
    recoilRadians: 0,
    recoilMeters: 0,
  }),
  TOOL: profile("TOOL", {
    gripOffset: [0.28, 1.1, -0.34],
    recoilRadians: 0,
    recoilMeters: 0,
  }),
};
export interface EquipmentPoseItem {
  version: 1;
  assetId: string;
  profile: EquipmentPoseType;
  /** glTF authored right-handed frame: +X right,+Y up,-Z forward. */
  sockets: Partial<Record<EquipmentSocket, PoseVector>>;
  clearance: readonly PoseBox[];
  deviceMode?: EquipmentPoseProfile["deviceMode"];
}
const gun = (
  assetId: string,
  profile: EquipmentPoseType,
  length: number,
): EquipmentPoseItem => ({
  version: 1,
  assetId,
  profile,
  sockets: {
    "Grip.Primary": [0, 0, 0],
    "Grip.Secondary": [0, 0, -0.23],
    "Contact.Shoulder": [0, 0.075, 0.4315],
    "Aim.Muzzle": [0, 0.13, -length - 0.02],
    "Sight.Primary": [0, 0.25, 0.045],
  },
  clearance: [
    {
      name: "receiver",
      center: [0, 0.105, -0.13],
      half: [0.096, 0.08, length * 0.285],
    },
    {
      name: "slide",
      center: [0, 0.2, -length * 0.26],
      half: [0.06, 0.033, length * 0.36],
    },
    {
      name: "charging-handle",
      center: [0.105, 0.19, -0.08],
      half: [0.045, 0.018, 0.025],
    },
    { name: "grip", center: [0, -0.01, 0], half: [0.044, 0.094, 0.055] },
    { name: "stock", center: [0, 0.075, 0.31], half: [0.073, 0.11, 0.1215] },
    {
      name: "barrel",
      center: [0, 0.13, -length * 0.7],
      half: [0.085, 0.07, length * 0.25],
    },
  ],
});
const pistol = (
  assetId: string,
  profile: EquipmentPoseType,
  length: number,
): EquipmentPoseItem => ({
  version: 1,
  assetId,
  profile,
  sockets: {
    "Grip.Primary": [0, 0, 0],
    SupportHandContact: [-0.065, -0.012, 0.015],
    "Aim.Muzzle": [0, 0.13, -length - 0.02],
    "Sight.Primary": [0, 0.25, 0.045],
  },
  clearance: [
    {
      name: "receiver",
      center: [0, 0.12, -0.14],
      half: [0.14, 0.15, length * 0.5],
    },
  ],
});
/** Measured from preserved equipment-kit source; explicit compatibility metadata, not invented foregrips. */
export const EQUIPMENT_POSE_ITEMS: Readonly<Record<string, EquipmentPoseItem>> =
  {
    carbine: gun("carbine", "RIFLE", 0.76),
    "long-rifle": {
      ...gun("long-rifle", "LONG_RIFLE", 1.1),
      clearance: [
        ...gun("long-rifle", "LONG_RIFLE", 1.1).clearance,
        {
          name: "optic",
          center: [0, 0.309, -0.18],
          half: [0.044, 0.043, 0.12],
        },
      ],
      sockets: {
        ...gun("long-rifle", "LONG_RIFLE", 1.1).sockets,
        "Grip.Secondary": [0, 0, -0.3],
        "Sight.Primary": [0, 0.309, -0.06],
        "Sight.EyeReference": [0, 0.309, 0.04],
      },
    },
    "compact-pistol": pistol("compact-pistol", "PISTOL_ONE_HAND", 0.37),
    "heavy-handgun": pistol("heavy-handgun", "PISTOL_TWO_HAND", 0.47),
    "plasma-cutter": {
      version: 1,
      assetId: "plasma-cutter",
      profile: "TOOL",
      sockets: {
        "Grip.Primary": [0, 0, 0],
        "Aim.Direction": [0, 0.13, -0.5],
        "Interaction.Contact": [0, 0.13, -0.5],
      },
      clearance: [
        {
          name: "device-body",
          center: [0, 0.12, -0.13],
          half: [0.151, 0.14, 0.17],
        },
        { name: "forks", center: [0, 0.13, -0.38], half: [0.105, 0.045, 0.12] },
      ],
    },
    "sample-scanner": {
      version: 1,
      assetId: "sample-scanner",
      profile: "HANDHELD_DEVICE",
      deviceMode: "VIEW_SCREEN_DEVICE",
      sockets: {
        "Grip.Primary": [0, 0, 0],
        "Aim.Direction": [0.085, 0.35, -0.19],
        "Display.Reference": [0, 0.19, -0.251],
      },
      clearance: [
        {
          name: "device-body",
          center: [0, 0.12, -0.055],
          half: [0.1, 0.085, 0.085],
        },
        {
          name: "display",
          center: [0, 0.19, -0.19],
          half: [0.11, 0.125, 0.065],
        },
        {
          name: "antenna",
          center: [0.085, 0.35, -0.19],
          half: [0.015, 0.065, 0.02],
        },
      ],
    },
  };
export function validatePoseItem(
  item: EquipmentPoseItem,
  profile = EQUIPMENT_POSE_PROFILES[item.profile],
): void {
  if (item.version !== 1 || !profile || profile.version !== 1)
    throw new Error("Unsupported equipment pose version/profile");
  const required: EquipmentSocket[] = ["Grip.Primary"];
  required.push(
    item.deviceMode === "VIEW_SCREEN_DEVICE"
      ? "Display.Reference"
      : item.sockets["Aim.Muzzle"]
        ? "Aim.Muzzle"
        : "Aim.Direction",
  );
  if (profile.requiresShoulderContact) required.push("Contact.Shoulder");
  if (profile.requiresEyeAlignment)
    required.push("Sight.Primary", "Sight.EyeReference");
  if (profile.secondaryHandMode === "foregrip") required.push("Grip.Secondary");
  if (profile.secondaryHandMode === "primary-hand")
    required.push("SupportHandContact");
  if (item.version !== 1 || !profile || profile.version !== 1)
    throw new Error("Unsupported equipment pose version/profile");
  for (const name of required)
    if (!item.sockets[name])
      throw new Error(`${item.assetId}: missing ${name}`);
  for (const p of Object.values(item.sockets))
    if (p.length !== 3 || !p.every(Number.isFinite))
      throw new Error(`${item.assetId}: invalid socket`);
  if (!item.clearance.length)
    throw new Error(`${item.assetId}: missing clearance`);
  for (const b of item.clearance)
    if (
      ![...b.center, ...b.half].every(Number.isFinite) ||
      b.half.some((n) => n <= 0)
    )
      throw new Error(`${item.assetId}: invalid clearance`);
}
