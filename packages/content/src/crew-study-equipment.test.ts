import { describe, expect, it } from "vitest";
import {
  STUDY_EVA_FAMILIES,
  STUDY_EQUIPMENT_KITS,
  STUDY_WEARABLES,
} from "./crew-study-equipment";
import {
  CREW_STUDY,
  crewStudyEquipment,
  crewStudyPartFile,
} from "./crew-study";
import {
  CREW_WARDROBE_KITS,
  CREW_WARDROBE_STARTER_DELIVERY,
  evaSuitCheck,
  isMaglockBoots,
} from "./crew-wardrobe";
import {
  INVENTORY_DEFINITIONS,
  inventoryDefinition,
  LEGACY_CREW_WARDROBE_DEFINITIONS,
} from "./inventory";
import { INVENTORY_PHYSICAL_DEFINITIONS } from "./inventory-physical-definitions";
import { CONTENT_DEFINITION_SEED } from "./content-definition-seed";

describe("provisional game-owned study equipment", () => {
  it("every new wearable has owned inventory, physical mass, a registry seed and a pinned fit for both bodies", () => {
    expect(STUDY_WEARABLES).toHaveLength(55);
    expect(new Set(INVENTORY_DEFINITIONS.map((d) => d.id)).size).toBe(
      INVENTORY_DEFINITIONS.length,
    );
    for (const wearable of STUDY_WEARABLES) {
      const id = `wardrobe-${wearable.id}`;
      expect(inventoryDefinition(id)).toMatchObject({
        equipSlot: wearable.slot,
        massKg: wearable.massKg,
        wardrobeId: wearable.id,
      });
      expect(
        INVENTORY_PHYSICAL_DEFINITIONS.find((d) => d.id === `inventory:${id}`)
          ?.massKg,
      ).toBe(wearable.massKg);
      expect(
        CONTENT_DEFINITION_SEED.find(
          (d) => d.kind === "item" && d.definitionId === id,
        )?.payload.equipSlot,
      ).toBe(wearable.slot);
      for (const female of [false, true]) {
        expect(crewStudyEquipment(wearable.slot, id, female)).toEqual(
          wearable.study,
        );
        expect(crewStudyPartFile(wearable.study.id, female)).toBeDefined();
        expect(crewStudyEquipment("hand", id, female)).toBeUndefined();
      }
    }
  });

  it("RP eyewear and face accessories replace the helmet and grant no seal", () => {
    const rp = STUDY_EQUIPMENT_KITS["study-rp-wearables"];
    expect(rp).toHaveLength(15);
    for (const id of rp) {
      expect(inventoryDefinition(id)?.equipSlot).toBe("helmet");
      expect(evaSuitCheck([{ slot: "helmet", id }]).missing).toContain(
        "helmet",
      );
    }
    expect(
      STUDY_WEARABLES.filter(
        (w) => CREW_STUDY.parts[w.study.id].slot === "face_acc",
      ),
    ).toHaveLength(7);
  });

  for (const family of STUDY_EVA_FAMILIES)
    it(`${family} readiness requires explicitly rated coverage, sealed helmet and pack in their correct slots`, () => {
      const ids = STUDY_EQUIPMENT_KITS[`study-eva-${family}`];
      const equipped = ids.map((id) => ({
        id,
        slot: inventoryDefinition(id)!.equipSlot!,
      }));
      expect(evaSuitCheck(equipped)).toEqual({ ready: true, missing: [] });
      for (const item of equipped) {
        expect(evaSuitCheck(equipped.filter((e) => e !== item)).ready).toBe(
          false,
        );
        expect(
          evaSuitCheck(
            equipped.map((e) => (e === item ? { ...e, slot: "hand" } : e)),
          ).ready,
        ).toBe(false);
      }
      const helmet = STUDY_WEARABLES.find(
        (w) => w.id === `study-eva-${family}-helmet`,
      )!;
      expect(CREW_STUDY.parts[helmet.study.id].covers).toEqual(
        expect.arrayContaining(["head", "hair", "neck"]),
      );
      expect(isMaglockBoots(`wardrobe-study-eva-${family}-boots`)).toBe(true);
      expect(isMaglockBoots(`crew-${family}-boots`)).toBe(false);
    });

  it("mixed rated pieces work, ordinary role clothing and open hats do not provide protection", () => {
    const rated = STUDY_EQUIPMENT_KITS["study-eva-pilot"].map((id) => ({
      id,
      slot: inventoryDefinition(id)!.equipSlot!,
    }));
    rated[0].id = "wardrobe-study-eva-medic-chest";
    expect(evaSuitCheck(rated).ready).toBe(true);
    for (const id of [
      "crew-recon-helmet",
      "crew-salvage-helmet",
      "wardrobe-study-glasses",
      "wardrobe-study-clothing-captain",
    ]) {
      const slot = inventoryDefinition(id)!.equipSlot!;
      expect(
        evaSuitCheck(rated.map((e) => (e.slot === slot ? { slot, id } : e)))
          .ready,
      ).toBe(slot === "uniform");
    }
  });

  it("preserves exact legacy issue kits and wardrobe identities; new kits require explicit delivery", () => {
    expect(LEGACY_CREW_WARDROBE_DEFINITIONS).toHaveLength(22);
    expect(CREW_WARDROBE_KITS["uniforms-and-tiers"]).toHaveLength(18);
    expect(CREW_WARDROBE_KITS["eva-suit"]).toEqual([
      "wardrobe-suit-body",
      "wardrobe-suit-helmet",
      "wardrobe-suit-pack",
      "wardrobe-suit-boots",
    ]);
    expect(CREW_WARDROBE_STARTER_DELIVERY).toHaveLength(45);
    expect(
      CREW_WARDROBE_STARTER_DELIVERY.some((id) =>
        id.startsWith("wardrobe-study-"),
      ),
    ).toBe(false);
    expect(
      evaSuitCheck(
        CREW_WARDROBE_KITS["eva-suit"]
          .slice(0, 3)
          .map((id) => ({ id, slot: inventoryDefinition(id)!.equipSlot! })),
      ).ready,
    ).toBe(true);
  });
});
