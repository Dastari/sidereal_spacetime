import { describe, it, expect } from "vitest";
import { crewSlotVisible, resolveCrewAppearance } from "./appearance";
import {
  CHARACTER_COMPONENTS,
  CHARACTER_COMPONENT_SETS,
  CHARACTER_HAIR_STYLES,
} from "@sidereal/content/character-components";
import { validateAppearanceJson } from "@sidereal/sim/appearance";
import {
  CHARACTER_APPEARANCE_ENUMS,
  CHARACTER_APPEARANCE_COLORS,
} from "@sidereal/content/appearance";
describe("modular crew fit and cosmetic authority boundary", () => {
  it("restores bare skin per region and always retains modesty clothing on both bodies", () => {
    for (const bodyType of ["male", "female"] as const) {
      const bare = resolveCrewAppearance({ bodyType, equippedComponents: {} });
      for (const region of [
        "core",
        "modesty",
        "torso",
        "upperarms",
        "forearms",
        "hands",
        "legs",
        "feet",
      ])
        expect(crewSlotVisible(`base-${bodyType}-${region}`, bare, true)).toBe(
          true,
        );
      expect(
        crewSlotVisible(
          `base-${bodyType === "male" ? "female" : "male"}-modesty`,
          bare,
          true,
        ),
      ).toBe(false);
      for (const c of CHARACTER_COMPONENTS) {
        const dressed = resolveCrewAppearance({
          bodyType,
          equippedComponents: { [c.slot]: c.id },
        });
        expect(crewSlotVisible(c.id, dressed, true)).toBe(true);
        expect(crewSlotVisible(`base-${bodyType}-modesty`, dressed, true)).toBe(
          true,
        );
        for (const region of c.covers)
          expect(
            crewSlotVisible(`base-${bodyType}-${region}`, dressed, true),
          ).toBe(false);
      }
    }
  });
  it("mixes independent slots and restores the chosen hair after helmet removal", () => {
    const mixed = resolveCrewAppearance({
      outfit: "medic",
      bodyType: "female",
      hairStyle: "braids",
      equippedComponents: {
        chest: "medic-chest",
        helmet: "engineer-helmet",
        visor: "recon-visor",
      },
    });
    for (const id of ["medic-chest", "engineer-helmet", "recon-visor"])
      expect(crewSlotVisible(id, mixed, true)).toBe(true);
    expect(crewSlotVisible("medic-helmet", mixed, true)).toBe(false);
    expect(crewSlotVisible("hair-braids", mixed, true)).toBe(false);
    expect(crewSlotVisible("hair-helmet-liner", mixed, true)).toBe(true);
    for (const hairStyle of CHARACTER_HAIR_STYLES)
      expect(
        crewSlotVisible(
          "hair-" + hairStyle,
          resolveCrewAppearance({ hairStyle, equippedComponents: {} }),
          true,
        ),
      ).toBe(true);
    expect(Object.keys(CHARACTER_COMPONENT_SETS)).toHaveLength(10);
  });
  it("accepts saved body/hair and rejects equipment IDs or nested equipment in cosmetics", () => {
    const validate = (value: unknown) =>
      validateAppearanceJson(
        JSON.stringify(value),
        CHARACTER_APPEARANCE_ENUMS,
        CHARACTER_APPEARANCE_COLORS,
      );
    expect(
      JSON.parse(validate({ bodyType: "female", hairStyle: "ponytail" })),
    ).toEqual({ bodyType: "female", hairStyle: "ponytail" });
    for (const value of [
      { equippedComponents: { chest: "medic-chest" } },
      { chest: "medic-chest" },
      { bodyType: "unknown" },
      { hairStyle: "unknown" },
    ])
      expect(() => validate(value)).toThrow();
  });
});
