import { crewWardrobeItem } from "./crew-wardrobe";
import {
  DEFAULT_HEAD_LOADOUT,
  validateHeadLoadout,
  type HeadLoadout,
} from "./crew-heads";
import type { EquippedCharacterComponents } from "./character-components";

/**
 * Presentation mapping from the persisted character appearance (r008 cosmetic fields) and the
 * equipped helmet/visor items to a CHAR-HEADS loadout for the voxel crew. Nothing here writes or
 * validates authority: the appearance row and the inventory projection stay unchanged, so the
 * original values survive any future head-kit persistence.
 */
export interface VoxelHeadAppearance {
  bodyType?: string;
  skin?: string;
  hair?: string;
  eyes?: string;
  hairStyle?: string;
  facialHair?: string;
  faceDetail?: string;
  faceAge?: string;
  equippedComponents?: EquippedCharacterComponents;
}

/** r008 hair styles -> CHAR-HEADS styles, per body type (male, female). */
const HAIR: Readonly<Record<string, readonly [string | null, string | null]>> =
  {
    none: [null, null],
    swept: ["swept_quiff", "long_side_fringe"],
    cropped: ["close_crop", "straight_bob"],
    crest: ["tall_crest", "side_bob"],
    scientist: ["swept_quiff", "silver_bob"],
    bob: ["layered_bob", "layered_bob"],
    ponytail: ["long_gathered", "long_gathered"],
    bun: ["high_bun", "high_bun"],
    braids: ["hanging_locks", "gathered_fringe"],
  };
const FACIAL_HAIR: Readonly<Record<string, string | null>> = {
  none: null,
  stubble: "stubble",
  short: "short_beard",
  full: "full_beard",
  goatee: "goatee",
  moustache: "moustache",
  handlebar: "handlebar",
  sideburns: "sideburns",
};
const DETAIL: Readonly<Record<string, string>> = {
  freckles: "freckles",
  scar: "scars",
  scratch: "scratch",
  tattoo: "tattoo",
  bandage: "bandage",
  dirt: "dirt",
  warpaint: "warpaint",
  cyber: "cyber",
  birthmark: "birthmark",
};
const AGE: Readonly<Record<string, string>> = {
  young: "young",
  adult: "adult",
  mature: "middle",
  elder: "older",
};

/**
 * r008 helmet items -> head-kit wear. Caps and open helmets keep the face visible; enclosed helmets
 * take the item's visor. Items keep their inventory identity; this is only the visual.
 */
export const VOXEL_HELMET_VISUALS: Readonly<
  Record<string, { helmet?: string; accessory?: string }>
> = {
  "captain-helmet": { accessory: "officer_cap" },
  "security-helmet": { accessory: "cap" },
  "mechanic-helmet": { accessory: "hard_hat" },
  "engineer-helmet": { helmet: "open" },
  "medic-helmet": { helmet: "hazmat" },
  "pilot-helmet": { helmet: "pilot" },
  "marine-helmet": { helmet: "tactical" },
  "salvage-helmet": { helmet: "mining" },
  "recon-helmet": { accessory: "hood" },
};
/** r008 visor items -> visor glass on an enclosed helmet (or goggles without one). */
export const VOXEL_VISOR_VISUALS: Readonly<Record<string, string>> = {
  "engineer-visor": "hud",
  "medic-visor": "tinted",
  "pilot-visor": "tinted",
  "marine-visor": "tinted",
  "salvage-visor": "mirrored",
  "recon-visor": "ar",
};

function helmetVisual(id: string | undefined) {
  if (!id) return undefined;
  // Wardrobe helmets (EVA suit) name their head-kit helmet directly.
  const wardrobe = crewWardrobeItem(id);
  if (wardrobe?.slot === "helmet" && wardrobe.helmet)
    return { helmet: wardrobe.helmet };
  return VOXEL_HELMET_VISUALS[id.replace(/^crew-/, "")];
}

/** Build a valid CHAR-HEADS loadout; any part that would make it invalid is dropped, never the head. */
export function voxelHeadLoadoutFromAppearance(
  appearance: VoxelHeadAppearance,
): HeadLoadout {
  const female = appearance.bodyType === "female";
  const hair = HAIR[appearance.hairStyle ?? ""];
  const base: HeadLoadout = {
    ...DEFAULT_HEAD_LOADOUT,
    head: female ? "female" : "male",
    faceVariant: female ? "f_classic" : "m_classic",
    hair: hair
      ? hair[female ? 1 : 0]
      : female
        ? "long_bob"
        : DEFAULT_HEAD_LOADOUT.hair,
    age: AGE[appearance.faceAge ?? ""] ?? DEFAULT_HEAD_LOADOUT.age,
  };
  const colour = (value: string | undefined) =>
    value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
  const skin = colour(appearance.skin);
  const hairColor = colour(appearance.hair);
  const eyes = colour(appearance.eyes);
  if (skin) base.skin = skin;
  if (hairColor) base.hairColor = hairColor;
  if (eyes) base.eyes = eyes;
  const facialHair = FACIAL_HAIR[appearance.facialHair ?? ""];
  const detail = DETAIL[appearance.faceDetail ?? ""];
  const equipped = appearance.equippedComponents ?? {};
  const worn = helmetVisual(equipped.helmet);
  const visorKey = equipped.visor?.replace(/^crew-/, "");
  const visor = visorKey ? VOXEL_VISOR_VISUALS[visorKey] : undefined;
  let loadout = base;
  const tryAdd = (patch: Partial<HeadLoadout>) => {
    const next = { ...loadout, ...patch };
    if (validateHeadLoadout(next).ok) loadout = next;
  };
  if (!female && facialHair) tryAdd({ facialHair });
  if (detail) tryAdd({ details: [detail] });
  if (worn?.helmet) tryAdd({ helmet: worn.helmet });
  if (worn?.accessory)
    tryAdd({ accessories: [...(loadout.accessories ?? []), worn.accessory] });
  if (visor) {
    if (loadout.helmet) tryAdd({ visor });
    else
      tryAdd({
        accessories: [...(loadout.accessories ?? []), "goggles_down"],
      });
  }
  return loadout;
}
