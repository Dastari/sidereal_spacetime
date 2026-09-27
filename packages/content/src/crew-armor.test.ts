import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CREW_ARMOR_PARTS,
  CREW_ARMOR_PRESETS,
  CREW_ARMOR_SLOTS,
  crewArmorAssetUrl,
  crewArmorColourway,
  crewArmorFit,
  crewArmorHiddenRegions,
  crewArmorLoadoutFromEquipment,
  crewArmorLoadoutFromPreset,
  crewArmorMeshName,
  crewArmorPart,
} from "./crew-armor";
import {
  CHARACTER_COMPONENT_SETS,
  type EquippedCharacterComponents,
} from "./character-components";

const runtime = (glb: string) =>
  new URL(`../../../assets/runtime/crew/armor-v1/${glb}`, import.meta.url);

describe("voxel crew armour catalog (presentation only)", () => {
  it("covers every armour slot with tiers 0-3 and unique ids", () => {
    const ids = CREW_ARMOR_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const slot of CREW_ARMOR_SLOTS)
      expect(
        new Set(
          CREW_ARMOR_PARTS.filter((p) => p.slot === slot).map((p) => p.tier),
        ),
      ).toEqual(new Set([0, 1, 2, 3]));
  });

  it("ships a content-addressed GLB for every part", () => {
    for (const part of CREW_ARMOR_PARTS) {
      const file = runtime(part.glb);
      expect(existsSync(file), part.id).toBe(true);
      const bytes = readFileSync(file);
      // Skip hash comparison for un-fetched Git LFS pointers.
      if (bytes.subarray(0, 4).toString() !== "glTF") continue;
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        part.sha256,
      );
      expect(crewArmorAssetUrl(part)).toContain(part.sha256.slice(0, 12));
    }
  });

  it("picks the torso fit per body variant and one fit for limb parts", () => {
    const chest = crewArmorPart("armor.chest.plate")!;
    expect(crewArmorFit(chest, "male")).toBe("wide");
    expect(crewArmorFit(chest, "neutral")).toBe("wide");
    expect(crewArmorFit(chest, "female")).toBe("narrow");
    expect(crewArmorMeshName(chest, "female")).toBe(
      "GEO-armor-armor.chest.plate-narrow",
    );
    const boots = crewArmorPart("armor.boots.heavy")!;
    expect(crewArmorFit(boots, "female")).toBe("all");
  });

  it("builds the ten roster roles from existing parts with matching slots and colourways", () => {
    expect(CREW_ARMOR_PRESETS.length).toBeGreaterThanOrEqual(10);
    for (const preset of CREW_ARMOR_PRESETS) {
      const loadout = crewArmorLoadoutFromPreset(preset.id);
      for (const [slot, entry] of Object.entries(loadout)) {
        expect(crewArmorPart(entry!.part)?.slot).toBe(slot);
        expect(crewArmorColourway(entry!.colourway).label).toBeTruthy();
      }
    }
  });

  it("maps owned r008 items to voxel visuals without touching helmets or visors", () => {
    for (const set of Object.values(CHARACTER_COMPONENT_SETS)) {
      const loadout = crewArmorLoadoutFromEquipment(
        set as EquippedCharacterComponents,
      );
      expect(Object.keys(loadout).length).toBeGreaterThan(0);
      expect(Object.keys(loadout)).not.toContain("helmet");
    }
    expect(crewArmorLoadoutFromEquipment({ chest: "unknown-item" })).toEqual(
      {},
    );
  });

  it("replaces the default gear layer and hides bare hands only under gloves", () => {
    expect(
      crewArmorHiddenRegions(crewArmorLoadoutFromPreset("role.marine")).sort(),
    ).toEqual(["gear", "hands"]);
    expect(
      crewArmorHiddenRegions(crewArmorLoadoutFromPreset("role.civilian")),
    ).toEqual(["gear"]);
  });
});
