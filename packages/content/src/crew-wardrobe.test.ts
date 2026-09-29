import { expect, test } from "vitest";
import { validateHeadLoadout } from "./crew-heads";
import { voxelHeadLoadoutFromAppearance } from "./crew-voxel-appearance";
import {
  CREW_WARDROBE,
  CREW_WARDROBE_KITS,
  crewWardrobeItem,
} from "./crew-wardrobe";
import {
  CREW_WARDROBE_DEFINITIONS,
  INVENTORY_DEFINITIONS,
  characterEquipmentFromInventory,
} from "./inventory";
import { INVENTORY_PHYSICAL_DEFINITIONS } from "./inventory-physical-definitions";
import { CHARACTER_APPEARANCE_ENUMS } from "./appearance";
import {
  VOXEL_CREW_DEFAULT_OUTFIT,
  voxelCrewHiddenRegions,
  voxelCrewOutfitFor,
} from "./crew-voxel-bundle";

test("wardrobe: 4 uniforms and 14 tier 1-2 pieces with unique, stable definition ids", () => {
  expect(CREW_WARDROBE.filter((w) => w.slot === "uniform")).toHaveLength(4);
  expect(
    CREW_WARDROBE.filter((w) => w.part && w.slot !== "uniform"),
  ).toHaveLength(14);
  const ids = INVENTORY_DEFINITIONS.map((d) => d.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const d of CREW_WARDROBE_DEFINITIONS) {
    expect(d.id).toMatch(/^wardrobe-(uniform-|t[12]-)/);
    expect(d.equipSlot).toBeTruthy();
    // Flight mass needs an explicit physical definition for every item that can be on board.
    expect(
      INVENTORY_PHYSICAL_DEFINITIONS.find((p) => p.id === "inventory:" + d.id)
        ?.massKg,
    ).toBe(d.massKg);
  }
  expect(CREW_WARDROBE_KITS["role-sets"]).toHaveLength(27);
  for (const id of Object.values(CREW_WARDROBE_KITS).flat())
    expect(INVENTORY_DEFINITIONS.some((d) => d.id === id)).toBe(true);
});

test("equipped wardrobe items reach the renderer as slot -> wardrobe id", () => {
  const equipped = characterEquipmentFromInventory([
    { definitionId: "wardrobe-uniform-medical", equipmentSlot: "uniform" },
    { definitionId: "wardrobe-t2-chest", equipmentSlot: "chest" },
    { definitionId: "wardrobe-t1-boots", equipmentSlot: "" },
  ]);
  expect(equipped).toEqual({
    uniform: "wardrobe-uniform-medical",
    chest: "wardrobe-t2-chest",
  });
  expect(crewWardrobeItem(equipped.uniform!)?.suit?.accent).toBe("#e0253e");
});

test("every persisted look maps to a valid head-kit loadout; helmets and visors follow items", () => {
  for (const bodyType of CHARACTER_APPEARANCE_ENUMS.bodyType)
    for (const hairStyle of CHARACTER_APPEARANCE_ENUMS.hairStyle)
      for (const facialHair of CHARACTER_APPEARANCE_ENUMS.facialHair)
        for (const faceDetail of CHARACTER_APPEARANCE_ENUMS.faceDetail) {
          const l = voxelHeadLoadoutFromAppearance({
            bodyType,
            hairStyle,
            facialHair,
            faceDetail,
            faceAge: "elder",
            skin: "#a06a52",
            hair: "#35251F",
            eyes: "#3b82c4",
          });
          expect(validateHeadLoadout(l).errors).toEqual([]);
          expect(l.head).toBe(bodyType);
          expect(l.hairColor).toBe("#35251f");
        }
  const medic = voxelHeadLoadoutFromAppearance({
    bodyType: "female",
    equippedComponents: { helmet: "medic-helmet", visor: "medic-visor" },
  });
  expect(medic).toMatchObject({
    helmet: "hazmat",
    visor: "tinted",
    head: "female",
  });
  const captain = voxelHeadLoadoutFromAppearance({
    equippedComponents: { helmet: "captain-helmet", visor: "pilot-visor" },
  });
  expect(captain.accessories).toEqual(["officer_cap", "goggles_down"]);
  expect(validateHeadLoadout(captain).ok).toBe(true);
});

test("an undressed character is the r005 base body: no jumpsuit, no crew gear", () => {
  const hidden = voxelCrewHiddenRegions(VOXEL_CREW_DEFAULT_OUTFIT);
  expect(hidden).not.toContain("base");
  expect(hidden).not.toContain("hands");
  expect(hidden).toContain("suit");
  expect(hidden).toContain("gear");
  expect(voxelCrewOutfitFor({})).toEqual(VOXEL_CREW_DEFAULT_OUTFIT);
  // Only an equipped uniform draws the suit layer; the gear layer never draws.
  expect(voxelCrewOutfitFor({ uniform: "wardrobe-uniform-command" })).toEqual({
    suit: true,
    gear: false,
  });
  expect(voxelCrewOutfitFor({ back: "engineer-back", gloves: "x" }).gear).toBe(
    false,
  );
});
