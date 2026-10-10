// Ported from the read-only study at 8f26c307; provisional, not owner-approved.
/**
 * Material slot registry and recolour for the crew runtime.
 *
 * Every crew mesh uses `crew.<slot>[.NNN]` materials (items: `slot:<slot>@<theme>`): one flat factor colour
 * per slot multiplied by COLOR_0, which only carries a greyscale shade / voxel noise / baked AO. Recolouring
 * therefore sets the PBR albedoColor (= glTF baseColorFactor, linear) and, for glow slots, the emissive
 * colour; any hue works and the shading survives. Finishes follow cr.mats.FAMILIES, the molded-plastic.ts
 * families: plastic 0.32 rough / IOR 1.46 (+ light clear coat), cloth, skin, metal 0.85 metallic, rubber, glass,
 * visor, emissive. The game can instead hand each material to its own applySurfaceFinish using
 * CREW_FAMILY_TO_MOLDED.
 */
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  CREW_DEFAULT_FAMILY,
  CREW_FAMILIES,
  CREW_FAMILY_TO_MOLDED,
  CREW_SLOTS,
  type CrewSlot,
} from "./crew-study-material-config";

export interface CrewMaterialEntry {
  material: PBRMaterial;
  /** crew slot (or item slot for `slot:<slot>@<theme>` materials). */
  slot: string;
  kind: "crew" | "item";
  /** Owning part id ("body", a part catalog id, or an item id). */
  part: string;
  /** Finish family (cr.mats.FAMILIES key). */
  family: string;
}

/** `crew.suit_primary`, `crew.suit_primary.001` -> `suit_primary` (only known slots). */
export function crewMaterialSlot(name: string): CrewSlot | undefined {
  const m = /^crew\.([a-z_]+?)(?:\.\d+)?$/.exec(name);
  return m && (CREW_SLOTS as readonly string[]).includes(m[1])
    ? (m[1] as CrewSlot)
    : undefined;
}

/** `slot:primary@orion` -> `primary`. */
export function itemMaterialSlot(name: string): string | undefined {
  return /^slot:([a-z_]+)@/.exec(name)?.[1];
}

/** Item slots that follow a character slot (crew-items-r001.json characterSlotLink). */
export const ITEM_SLOT_LINK: Readonly<Record<string, CrewSlot>> = {
  primary: "suit_primary",
  secondary: "suit_secondary",
  accent: "accent",
  metal: "metal",
  dark: "dark",
  emit_a: "emit",
  emit_b: "emit_b",
  glass: "glass",
};

const ITEM_FAMILY: Readonly<Record<string, string>> = {
  primary: "plastic",
  secondary: "plastic_dark",
  accent: "plastic_colour",
  trim: "plastic_dark",
  metal: "metal",
  dark: "plastic_dark",
  grip: "rubber",
  emit_a: "emissive",
  emit_b: "emissive",
  glass: "glass",
};

export type ColourInput = string | Color3 | readonly [number, number, number];

/** sRGB hex / Color3 (treated as sRGB) / linear triple -> linear Color3 (glTF factors are linear). */
export function linearColour(c: ColourInput): Color3 {
  if (typeof c === "string")
    return Color3.FromHexString(
      c.startsWith("#") ? c : `#${c}`,
    ).toLinearSpace();
  if (c instanceof Color3) return c.toLinearSpace();
  return new Color3(c[0], c[1], c[2]);
}

export interface CrewFinishOptions {
  /** Enable the PBR clear-coat lobe for families with coat > 0 (the game keeps it off for frame time). */
  clearCoat?: boolean;
  /** Cap for emissive intensity (the live game uses ~0.9; offline look 6). */
  emissiveCap?: number;
  /** Live/offline ratio applied to the original exported strength, idempotently. */
  emissiveScale?: number;
}

/** Apply a cr.mats family finish (roughness / metallic / IOR / clear coat) to one material. */
export function applyCrewFinish(
  material: PBRMaterial,
  family: string,
  options: CrewFinishOptions = {},
) {
  const f = CREW_FAMILIES[family] ?? CREW_FAMILIES.plastic;
  material.metallic = f.metal;
  material.roughness = f.rough;
  material.indexOfRefraction = 1.46;
  material.enableSpecularAntiAliasing = true;
  if (f.coat > 0 && options.clearCoat) {
    material.clearCoat.isEnabled = true;
    material.clearCoat.intensity = f.coat;
    material.clearCoat.roughness = family === "visor" ? 0.05 : 0.2;
    material.clearCoat.indexOfRefraction = 1.5;
  } else material.clearCoat.isEnabled = false;
  material.metadata = {
    ...material.metadata,
    crewFamily: family,
    moldedFamily: CREW_FAMILY_TO_MOLDED[family],
  };
  return material;
}

export class CrewMaterialRegistry {
  readonly entries: CrewMaterialEntry[] = [];

  /**
   * Register a part's materials. `families` overrides the finish per slot (catalog `families`, e.g. armour
   * suit_primary -> plastic); defaults follow cr.mats.DEFAULT_FAMILY (body suits are cloth).
   */
  register(
    materials: readonly Material[],
    part: string,
    families: Readonly<Record<string, string>> = {},
  ) {
    const added: CrewMaterialEntry[] = [];
    for (const m of materials) {
      if (
        !(m instanceof PBRMaterial) ||
        this.entries.some((e) => e.material === m)
      )
        continue;
      const crew = crewMaterialSlot(m.name);
      const item = crew ? undefined : itemMaterialSlot(m.name);
      if (!crew && !item) continue;
      const slot = (crew ?? item)!;
      const family =
        families[slot] ??
        (crew ? CREW_DEFAULT_FAMILY[crew] : (ITEM_FAMILY[slot] ?? "plastic"));
      const e: CrewMaterialEntry = {
        material: m,
        slot,
        kind: crew ? "crew" : "item",
        part,
        family,
      };
      this.entries.push(e);
      added.push(e);
    }
    return added;
  }

  unregister(part: string) {
    for (let i = this.entries.length - 1; i >= 0; i--)
      if (this.entries[i].part === part) this.entries.splice(i, 1);
  }

  select(
    filter: { slot?: string; part?: string; kind?: "crew" | "item" } = {},
  ) {
    return this.entries.filter(
      (e) =>
        (!filter.slot || e.slot === filter.slot) &&
        (!filter.part || e.part === filter.part) &&
        (!filter.kind || e.kind === filter.kind),
    );
  }

  /** Slots present (optionally for one part). */
  slots(part?: string) {
    return [...new Set(this.select({ part }).map((e) => e.slot))];
  }

  /**
   * Set a slot colour for the whole character (all parts) or one part. Crew slots also recolour linked item
   * slots (primary -> suit_primary, emit_a -> emit, ...) when `items` is true.
   */
  setSlotColour(
    slot: string,
    colour: ColourInput,
    options: { part?: string; items?: boolean; emissiveCap?: number } = {},
  ) {
    const c = linearColour(colour);
    let n = 0;
    for (const e of this.entries) {
      if (options.part && e.part !== options.part) continue;
      const match =
        e.kind === "crew"
          ? e.slot === slot
          : options.items !== false && ITEM_SLOT_LINK[e.slot] === slot;
      if (!match || e.slot === "face") continue;
      e.material.albedoColor = c.clone();
      if (e.family === "emissive" || slot === "emit" || slot === "emit_b") {
        e.material.emissiveColor = c.clone();
        const cap = options.emissiveCap;
        if (cap !== undefined && e.material.emissiveIntensity > cap)
          e.material.emissiveIntensity = cap;
      }
      n++;
    }
    return n;
  }

  /** Apply a palette ({slot: colour}) to the character or one part. */
  setPalette(
    palette: Readonly<Record<string, ColourInput>>,
    options: { part?: string; items?: boolean } = {},
  ) {
    let n = 0;
    for (const [slot, colour] of Object.entries(palette))
      n += this.setSlotColour(slot, colour, options);
    return n;
  }

  /** Current slot colour (linear) of the first matching material. */
  slotColour(slot: string, part?: string) {
    return this.entries
      .find((e) => e.slot === slot && (!part || e.part === part))
      ?.material.albedoColor.clone();
  }

  /** Change one slot's finish family (e.g. a part's suit_primary from cloth to plastic). */
  setFamily(
    slot: string,
    family: string,
    options: CrewFinishOptions & { part?: string } = {},
  ) {
    for (const e of this.entries)
      if (e.slot === slot && (!options.part || e.part === options.part)) {
        e.family = family;
        applyCrewFinish(e.material, family, options);
      }
  }

  /** Apply every registered material's family finish (the molded-plastic idea on crew slots). */
  applyFinishes(options: CrewFinishOptions = {}) {
    for (const e of this.entries) {
      if (e.slot === "face") {
        applyCrewFinish(e.material, "face", options);
        continue;
      }
      applyCrewFinish(e.material, e.family, options);
      if (options.emissiveScale !== undefined)
        scaleCrewEmission(e.material, options.emissiveScale);
      if (
        e.family === "emissive" &&
        options.emissiveCap !== undefined &&
        e.material.emissiveIntensity > options.emissiveCap
      )
        e.material.emissiveIntensity = options.emissiveCap;
    }
  }
}

/** Retain source-relative brightness through recolour and repeated presentation registration. */
export function scaleCrewEmission(material: PBRMaterial, scale: number) {
  const exported =
    material.metadata?.studyExportedEmissiveStrength ??
    material.emissiveIntensity;
  material.metadata = {
    ...material.metadata,
    studyExportedEmissiveStrength: exported,
  };
  material.emissiveIntensity = exported * scale;
}
