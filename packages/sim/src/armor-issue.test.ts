import { describe, it, expect } from "vitest";
import {
  CHARACTER_ARMOR_DEFINITIONS,
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
  characterEquipmentFromInventory,
} from "@sidereal/content/inventory";
import { CHARACTER_COMPONENTS } from "@sidereal/content/character-components";
import { packArmorIssue } from "./armor-issue";
import {
  validateInventory,
  placeInventoryItem,
  type InventorySnapshot,
} from "./inventory";
describe("individual character equipment", () => {
  it("packs the complete armory without overlaps within inventory budgets", () => {
    const plan = packArmorIssue(CHARACTER_ARMOR_DEFINITIONS);
    expect(plan.placements).toHaveLength(90);
    expect(plan.lockers).toBeLessThanOrEqual(3);
    const data: InventorySnapshot = {
      items: plan.placements.map((p, i) => ({
        id: String(i),
        definitionId: p.definitionId,
        containerId: "locker-" + p.locker,
        equipmentSlot: "",
        x: p.x,
        y: p.y,
        rotated: false,
      })),
      containers: [
        {
          id: "pockets",
          parentItemId: "",
          kind: "grid",
          width: 4,
          height: 2,
          maxMassKg: 6,
          capacityLitres: 0,
          amountLitres: 0,
          liquidType: "",
        },
        ...Array.from({ length: plan.lockers }, (_, i) => ({
          id: "locker-" + i,
          parentItemId: "",
          kind: "grid",
          width: 16,
          height: 16,
          maxMassKg: 500,
          capacityLitres: 0,
          amountLitres: 0,
          liquidType: "",
        })),
      ],
    };
    expect(
      validateInventory(
        data,
        INVENTORY_DEFINITIONS,
        LIQUID_DENSITY_KG_PER_LITRE,
        "pockets",
        32,
      ),
    ).toBe(0);
    let mixed = data;
    for (const id of [
      "crew-medic-chest",
      "crew-engineer-helmet",
      "crew-recon-visor",
      "crew-marine-shoulders",
      "crew-security-gloves",
      "crew-mechanic-belt",
      "crew-pilot-legs",
      "crew-salvage-boots",
      "crew-scientist-back",
    ]) {
      const item = mixed.items.find((i) => i.definitionId === id)!,
        d = INVENTORY_DEFINITIONS.find((d) => d.id === id)!;
      mixed = {
        ...mixed,
        items: placeInventoryItem(
          mixed,
          INVENTORY_DEFINITIONS,
          LIQUID_DENSITY_KG_PER_LITRE,
          "pockets",
          32,
          item.id,
          {
            containerId: "",
            equipmentSlot: d.equipSlot!,
            x: 0,
            y: 0,
            rotated: false,
          },
        ),
      };
    }
    expect(
      Object.keys(characterEquipmentFromInventory(mixed.items)),
    ).toHaveLength(9);
    const chest = mixed.items.find(
      (i) => i.definitionId === "crew-medic-chest",
    )!;
    expect(() =>
      placeInventoryItem(
        mixed,
        INVENTORY_DEFINITIONS,
        {},
        "pockets",
        32,
        chest.id,
        { containerId: "", equipmentSlot: "boots", x: 0, y: 0, rotated: false },
      ),
    ).toThrow("does not fit");
    expect(() =>
      validateInventory(mixed, INVENTORY_DEFINITIONS, {}, "pockets", 1),
    ).toThrow("carry limit");
    expect(mixed.items.map((i) => i.id)).toEqual(data.items.map((i) => i.id));
  });
  it("maps only legal equipped item definitions, retains the existing field-pack identity", () => {
    expect(
      characterEquipmentFromInventory([
        { definitionId: "crew-medic-chest", equipmentSlot: "boots" },
        { definitionId: "crew-engineer-helmet", equipmentSlot: "" },
      ]),
    ).toEqual({});
    expect(
      characterEquipmentFromInventory([
        { definitionId: "field-pack", equipmentSlot: "back" },
        { definitionId: "crew-medic-chest", equipmentSlot: "chest" },
      ]),
    ).toEqual({ back: "engineer-back", chest: "medic-chest" });
    for (const c of CHARACTER_COMPONENTS)
      expect(c.bodyTypes).toEqual(["male", "female"]);
  });
});
