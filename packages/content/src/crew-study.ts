/** Immutable catalogue revision; provisional, not owner-approved. Existing inventory identities remain authoritative. */
import raw from "./crew-study.catalog.json";
import refit from "./crew-refit.catalog.json";
import { characterComponent } from "./character-components";
import { crewWardrobeItem } from "./crew-wardrobe";

export type StudyFile = { file: string; sha256: string; bytes: number };
export type StudyPart = {
  slot: string;
  palette: Record<string, string>;
  families?: Record<string, string>;
  covers: string[];
  covers_by_mode?: Record<string, string[]>;
  hair_mode?: string | null;
  files: Record<string, StudyFile>;
};
export type StudyClip = {
  loop: boolean;
  frames: number;
  fps: number;
  nominalSpeed?: number;
  expressionTrack?: [number, string][];
  grabFrame?: number;
  supportIK?: [number, number][];
  sight?: string;
};
export type StudyItem = {
  class?: string;
  two_handed?: boolean;
  holster?: string;
  files: Record<string, StudyFile>;
  palette: Record<string, string>;
  families?: Record<string, string>;
};
export const CREW_STUDY = raw as unknown as {
  revision: string;
  sourceCommit: string;
  manifestSha256: string;
  body: StudyFile;
  animation: StudyFile;
  parts: Record<string, StudyPart>;
  items: Record<string, StudyItem>;
  face: Record<string, { png: string; json: string; sha256: string }>;
  clips: Record<string, StudyClip>;
  holsters: Record<
    string,
    {
      socket: string;
      offsetM: number[];
      itemForward: number[];
      itemUp: number[];
    }
  >;
};
export const CREW_STUDY_SCALE = 0.9;
/** Sit-idle pelvis underside in unscaled source metres, verified against both pinned bodies. */
export const CREW_STUDY_SEATED_PELVIS_UNDERSIDE_M = 0.28369;
export const CREW_STUDY_SEATED_PELVIS_REAR_M = 0.24133;
/** Pinned native pilot-chair geometry, not the external study's experimental station hardware. */
export const CREW_STUDY_PILOT_CHAIR = {
  piece: "prop.props_bridge.pilot_chair",
  sha256: "9dc2f7b54152816516b8a992597af5194895b2c7c22a124c61ea33e4c0b8887e",
  width: 0.844,
  depth: 0.7988,
  height: 1.3796,
  cushionTop: 0.515,
  // Flat rear seat-pan vertices + source bounds-centre displacement along glTF Z.
  cushionRear: 0.0531 + 0.0086,
  footBaseTop: 0.08325,
  footBaseForward: 0.295,
} as const;
export const CREW_STUDY_BASE = `/assets/crew/${CREW_STUDY.revision}/`;
/** Game-owned Blender refit; the imported study snapshots remain byte-exact. Provisional. */
export const CREW_REFIT = refit;
/** Encode filename fragments (#/@) as path data, never browser URL fragments. */
export const crewStudyUrl = (file: string) =>
  (Object.hasOwn(CREW_REFIT.files, file)
    ? `/assets/crew/${CREW_REFIT.revision}/`
    : CREW_STUDY_BASE) + file.split("/").map(encodeURIComponent).join("/");
export type StudyPartRequest = { id: string; regions?: string[] };

export function crewStudyPartFile(
  id: string,
  female: boolean,
  mode = "full",
  state = "stand",
) {
  const part = CREW_STUDY.parts[id];
  if (!part || mode === "hidden") return undefined;
  const fit = female ? "narrow" : "wide";
  const suffix =
    part.slot === "hair" || part.slot === "facial" ? `#${mode}` : "";
  const pose = state === "stand" ? "" : `@${state}`;
  return (
    part.files[fit + suffix + pose] ??
    part.files["all" + suffix + pose] ??
    part.files[fit + suffix] ??
    part.files["all" + suffix]
  );
}

/** Only known equipped items are mapped. A partial role chest does not visually grant trousers. */
export function crewStudyEquipment(
  slot: string,
  id: string,
  female = false,
  wearerRole?: "scientist",
): StudyPartRequest | undefined {
  const wardrobe = crewWardrobeItem(id);
  if (wardrobe && wardrobe.slot !== slot) return undefined;
  const key = id.replace(/^crew-/, "");
  const component = characterComponent(key);
  if (!wardrobe && (!component || component.slot !== slot)) return undefined;
  const role =
    slot === "visor" && wearerRole === "scientist"
      ? "scientist"
      : key.split("-")[0] === "recon"
        ? "scout"
        : key.split("-")[0];
  if (wardrobe?.eva) {
    const eva: Record<string, StudyPartRequest> = {
      uniform: { id: "uniform.pilot" },
      helmet: { id: "headwear.eva_helmet" },
      back: { id: "armor.back.t3" },
      boots: { id: "boots.heavy" },
    };
    return eva[slot];
  }
  if (wardrobe?.suit) {
    const department: Record<string, string> = {
      captain: "captain",
      medic: "medic",
      engineer: "engineer",
      security: "security",
    };
    return { id: `uniform.${department[wardrobe.colourway] ?? "civilian"}` };
  }
  const tier = wardrobe?.id.match(/^t([12])-/)?.[1];
  if (tier) {
    const pieces: Record<string, StudyPartRequest> = {
      chest: { id: `armor.chest.t${tier}` },
      shoulders: { id: `armor.shoulders.t${tier}` },
      back: { id: `armor.back.t${tier}` },
      gloves: { id: "gloves.tactical" },
      boots: { id: "boots.combat" },
      belt: { id: "belt.utility" },
      legs: { id: "uniform.civilian", regions: ["hips", "legs"] },
    };
    return pieces[slot];
  }
  const helmets: Record<string, string> = {
    captain: "captain_cap",
    engineer: "hardhat_lamp",
    medic: "medic_helmet",
    pilot: "pilot_helmet",
    security: "police_cap",
    marine: "nv_helmet",
    salvage: "salvage_hardhat",
    scout: "nv_helmet",
    mechanic: "mechanic_cap",
  };
  const gloves: Record<string, string> = {
    captain: "white",
    engineer: "work",
    medic: "white",
    pilot: "flight",
    security: "tactical",
    marine: "heavy",
    salvage: "work",
    scout: "tactical",
    scientist: "white",
    mechanic: "work",
  };
  const boots: Record<string, string> = {
    captain: "dress",
    engineer: "work",
    medic: "white",
    pilot: "flight",
    security: "combat",
    marine: "heavy",
    salvage: "work",
    scout: "combat",
    scientist: "white",
    mechanic: "work",
  };
  const belts: Record<string, string> = {
    captain: "captain",
    engineer: "tool",
    medic: "medic",
    pilot: "plain",
    security: "utility",
    marine: "harness",
    salvage: "tool",
    scout: "utility",
    scientist: "plain",
    mechanic: "tool",
  };
  let request: StudyPartRequest | undefined;
  if (slot === "helmet" && helmets[role])
    request = {
      id: role === "marine" ? "armor.helmet.t3" : `headwear.${helmets[role]}`,
    };
  if (slot === "visor")
    request = {
      id:
        role === "scientist"
          ? female
            ? "visor.glasses"
            : "visor.glasses_blue"
          : role === "scout"
            ? "visor.nv_goggles"
            : "visor.goggles_teal",
    };
  if (slot === "gloves" && gloves[role])
    request = { id: `gloves.${gloves[role]}` };
  if (slot === "boots" && boots[role]) request = { id: `boots.${boots[role]}` };
  if (slot === "belt" && belts[role]) request = { id: `belt.${belts[role]}` };
  if (slot === "back" && role === "marine") request = { id: "armor.back.t3" };
  else if (slot === "back")
    request = {
      id: `back.${role === "captain" ? "command" : role === "scientist" ? "science" : role}`,
    };
  if (slot === "shoulders")
    request = {
      id:
        role === "captain"
          ? "armor.shoulders.epaulettes"
          : `armor.shoulders.t${role === "marine" ? 3 : 1}`,
    };
  if (slot === "chest" && role === "marine") request = { id: "armor.chest.t3" };
  else if (slot === "chest")
    request = {
      id: `uniform.${role}`,
      regions: ["torso", "upperArms", "forearms"],
    };
  if (slot === "legs")
    request =
      role === "marine"
        ? { id: "armor.legs.t3" }
        : { id: `uniform.${role}`, regions: ["hips", "legs"] };
  return request && CREW_STUDY.parts[request.id] ? request : undefined;
}

export function crewStudyHair(
  style: string | undefined,
  female: boolean,
  defaultRole?: string,
) {
  const styles: Record<string, [string, string]> = {
    swept: ["swept", "long_wavy"],
    cropped: ["crop", "short_bob"],
    crest: ["crest", "pixie"],
    scientist: ["fluffy_curls", "twin_puffs"],
    bob: ["short_bob", "short_bob"],
    ponytail: ["high_ponytail", "long_ponytail"],
    bun: ["bun", "bun"],
    braids: ["braids", "braids"],
  };
  if (style === "none") return undefined;
  if (style?.startsWith("hair.") || style?.startsWith("groom.")) {
    if (!CREW_STUDY.parts[style])
      throw new Error(`Unknown crew hairstyle: ${style}`);
    return style;
  }
  if (style !== undefined && !Object.hasOwn(styles, style))
    throw new Error(`Unknown crew hairstyle: ${style}`);
  // Role defaults never replace an explicitly saved personal hairstyle.
  if (defaultRole === "scientist" || style === "scientist")
    return female ? "groom.twin_puffs" : "groom.fluffy_curls";
  if (female && defaultRole === "marine") return "groom.twin_tails";
  return `hair.${styles[style ?? "swept"][female ? 1 : 0]}`;
}
