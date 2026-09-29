import { expect, test } from "vitest";
import {
  VOXEL_CREW_REGIONS,
  voxelCrewHiddenRegions,
  voxelCrewOutfitFor,
  type VoxelCrewRegion,
} from "@sidereal/content/crew-voxel-bundle";
import { crewArmorHiddenRegions } from "@sidereal/content/crew-armor";
import {
  INVENTORY_DEFINITIONS,
  characterEquipmentFromInventory,
} from "@sidereal/content/inventory";
import { voxelArmorLoadout } from "./voxel-crew-outfit";

/**
 * The layers every crew view draws (paper doll, own body and remote crew all use
 * voxelCrewOutfitFor + voxelArmorLoadout over characterEquipmentFromInventory):
 * the visible body regions and one armour part per equipped slot.
 */
function drawnLayers(
  items: readonly { definitionId: string; equipmentSlot: string }[],
) {
  const equipped = characterEquipmentFromInventory(items);
  const loadout = voxelArmorLoadout(equipped);
  const hidden = new Set<VoxelCrewRegion>([
    ...voxelCrewHiddenRegions(voxelCrewOutfitFor(equipped)),
    ...(crewArmorHiddenRegions(loadout) as VoxelCrewRegion[]),
  ]);
  return {
    equipped,
    body: VOXEL_CREW_REGIONS.filter((r) => !hidden.has(r)),
    armour: Object.keys(loadout).sort(),
  };
}
const wear = (...ids: string[]) =>
  ids.map((definitionId) => {
    const definition = INVENTORY_DEFINITIONS.find((d) => d.id === definitionId);
    if (!definition?.equipSlot)
      throw new Error("not equippable " + definitionId);
    return { definitionId, equipmentSlot: definition.equipSlot };
  });

test("nothing equipped draws the base body only: no jumpsuit, gear, armour or pack", () => {
  const { body, armour } = drawnLayers([]);
  expect(body).toEqual(["base", "hands", "head", "hair"]);
  expect(armour).toEqual([]);
});

test("the back pack is drawn only when a back item is equipped", () => {
  const packed = drawnLayers(wear("field-pack"));
  expect(packed.armour).toEqual(["back"]);
  expect(packed.body).toContain("base");
  expect(packed.body).not.toContain("gear");
  expect(packed.body).not.toContain("suit");
});

test("the jumpsuit layer appears only with an equipped uniform", () => {
  const uniform = drawnLayers(wear("wardrobe-uniform-engineering"));
  expect(uniform.body).toContain("suit");
  expect(uniform.body).not.toContain("base");
  expect(uniform.body).not.toContain("gear");
});

test("every drawn armour piece matches an equipped item slot, and gloves replace hands", () => {
  const tier = INVENTORY_DEFINITIONS.filter((d) =>
    d.id.startsWith("wardrobe-t1-"),
  ).map((d) => d.id);
  expect(tier.length).toBeGreaterThan(3);
  for (const set of [tier, ...tier.map((id) => [id])]) {
    const { equipped, body, armour } = drawnLayers(wear(...set));
    // Helmet and visor belong to the head kit; everything else is one armour part.
    const slots = Object.keys(equipped)
      .filter((s) => s !== "helmet" && s !== "visor")
      .sort();
    expect(armour).toEqual(slots);
    expect(body).not.toContain("gear");
    expect(body.includes("hands")).toBe(!("gloves" in equipped));
  }
});
