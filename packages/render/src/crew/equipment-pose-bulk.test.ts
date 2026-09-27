import { describe, expect, it } from "vitest";
import { CHARACTER_COMPONENT_SETS } from "@sidereal/content/character-components";
import { equipmentPoseArmorBulk } from "./equipment-pose-bulk";

describe("equipped component pose clearance", () => {
  it("uses the pieces worn even when cosmetic armor disagrees", () => {
    expect(
      equipmentPoseArmorBulk(CHARACTER_COMPONENT_SETS.marine, "none"),
    ).toBe(0.045);
    expect(
      equipmentPoseArmorBulk(CHARACTER_COMPONENT_SETS.medic, "heavy"),
    ).toBe(0.02);
    expect(equipmentPoseArmorBulk({}, "heavy")).toBe(0.02);
    for (const piece of [
      { chest: "marine-chest" },
      { shoulders: "marine-shoulders" },
      { helmet: "marine-helmet" },
      { helmet: "pilot-helmet" },
      { helmet: "salvage-helmet" },
      { helmet: "legacy-helmet-explorer-helmet" },
    ])
      expect(
        equipmentPoseArmorBulk({ ...CHARACTER_COMPONENT_SETS.medic, ...piece }),
      ).toBe(0.045);
  });

  it("does not treat a cap, boots, backpack or a wrong-slot ID as upper-body bulk", () => {
    for (const pieces of [
      { helmet: "captain-helmet" },
      { boots: "marine-boots", back: "marine-back", gloves: "marine-gloves" },
      { helmet: "marine-chest" },
      { chest: "missing-component" },
    ])
      expect(equipmentPoseArmorBulk(pieces, "heavy")).toBe(0.02);
  });

  it("retains the legacy clearance only when modular equipment is absent", () => {
    expect(equipmentPoseArmorBulk(undefined, "heavy")).toBe(0.045);
    expect(equipmentPoseArmorBulk(undefined, "light")).toBe(0.02);
    expect(equipmentPoseArmorBulk()).toBe(0.02);
  });
});
