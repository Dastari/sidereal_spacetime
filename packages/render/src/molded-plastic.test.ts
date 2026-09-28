import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { SHIP_KIT_SLOTS } from "@sidereal/content/ship-kit";
import { CREW_MATERIAL_SLOTS } from "@sidereal/content/crew-armor";
import { CREW_ITEM_CATALOG } from "@sidereal/content/crew-items";
import {
  MOLDED_FINISH_KEY,
  SURFACE_FAMILIES,
  SURFACE_FINISHES,
  applyMoldedFinishToMeshes,
  applySurfaceFinish,
  crewSlotFamily,
  moldedClearCoatEnabled,
  moldedImageProcessing,
  moldedLightRig,
  shipSlotFamily,
  studioEnvironmentHdr,
  studioRadiance,
  surfaceFamilyForMaterialName,
  tagCrewPart,
} from "./molded-plastic";

const ior = (f0: number) => (1 + Math.sqrt(f0)) / (1 - Math.sqrt(f0));

describe("molded plastic finish table", () => {
  it("keeps plastic dielectric, coated lightly and inside the direction ranges", () => {
    const light = SURFACE_FINISHES["plastic-light"];
    const dark = SURFACE_FINISHES["plastic-dark"];
    const colour = SURFACE_FINISHES["plastic-colour"];
    for (const f of [light, dark, colour]) {
      expect(f.metallic).toBe(0);
      expect(f.ior).toBeCloseTo(1.46, 5);
      expect(f.coat).toBeGreaterThan(0);
      expect(f.coat).toBeLessThanOrEqual(0.1);
      expect(f.coatRoughness).toBeCloseTo(0.2, 5);
    }
    expect(light.roughness).toBeGreaterThanOrEqual(0.28);
    expect(light.roughness).toBeLessThanOrEqual(0.36);
    expect(dark.roughness).toBeGreaterThanOrEqual(0.34);
    expect(dark.roughness).toBeLessThanOrEqual(0.42);
    expect(colour.roughness).toBeGreaterThanOrEqual(0.22);
    expect(colour.roughness).toBeLessThanOrEqual(0.32);
    // IOR 1.46 is about 3.5 % reflectance at normal incidence.
    expect(ior(0.035)).toBeCloseTo(1.46, 1);
  });

  it("never coats fabric or rubber and keeps them matte", () => {
    const fabric = SURFACE_FINISHES.fabric;
    const rubber = SURFACE_FINISHES.rubber;
    expect(fabric.coat).toBe(0);
    expect(rubber.coat).toBe(0);
    expect(fabric.roughness).toBeGreaterThanOrEqual(0.65);
    expect(fabric.roughness).toBeLessThanOrEqual(0.9);
    expect(rubber.roughness).toBeGreaterThanOrEqual(0.55);
    expect(rubber.roughness).toBeLessThanOrEqual(0.75);
    // Cloth and rubber take less key-light glint than coated plastic.
    expect(fabric.specular).toBeLessThan(
      SURFACE_FINISHES["plastic-light"].specular,
    );
    expect(rubber.specular).toBeLessThan(
      SURFACE_FINISHES["plastic-light"].specular,
    );
  });

  it("reserves metallic response for the explicit metal family", () => {
    for (const family of SURFACE_FAMILIES)
      if (family !== "metal") expect(SURFACE_FINISHES[family].metallic).toBe(0);
    expect(SURFACE_FINISHES.metal.metallic).toBeGreaterThan(0.5);
  });
});

describe("slot to family mapping", () => {
  it("maps every ship kit slot", () => {
    for (const slot of SHIP_KIT_SLOTS)
      expect(shipSlotFamily(slot)).toBeTruthy();
    expect(shipSlotFamily("primary")).toBe("plastic-light");
    expect(shipSlotFamily("accent")).toBe("plastic-colour");
    expect(shipSlotFamily("metal")).toBe("metal");
    expect(shipSlotFamily("emit_a")).toBe("emissive");
  });

  it("maps every crew slot for body and moulded parts", () => {
    for (const slot of CREW_MATERIAL_SLOTS) {
      expect(crewSlotFamily(slot, "body")).toBeTruthy();
      expect(crewSlotFamily(slot, "armour")).toBeTruthy();
    }
    expect(crewSlotFamily("suit_primary", "body")).toBe("fabric");
    expect(crewSlotFamily("suit_primary", "armour")).toBe("plastic-light");
    expect(crewSlotFamily("dark", "body")).toBe("rubber");
    expect(crewSlotFamily("dark", "armour")).toBe("plastic-dark");
  });

  it("maps every held-item slot and effect material by name", () => {
    for (const slot of CREW_ITEM_CATALOG.slots)
      expect(surfaceFamilyForMaterialName(`slot:${slot}@orion`)).toBeTruthy();
    expect(surfaceFamilyForMaterialName("slot:grip@orion")).toBe("rubber");
    expect(surfaceFamilyForMaterialName("fx:core@tracer")).toBe("emissive");
    expect(surfaceFamilyForMaterialName("crew.skin.001")).toBe("skin");
    expect(surfaceFamilyForMaterialName("unrelated")).toBeUndefined();
  });
});

describe("studio environment", () => {
  it("is neutral, brighter above than below, with soft-box highlights", () => {
    const up = studioRadiance([0, 1, 0]);
    const down = studioRadiance([0, -1, 0]);
    const side = studioRadiance([0, 0, 1]);
    expect(up[1]).toBeGreaterThan(side[1]);
    expect(side[1]).toBeGreaterThan(down[1]);
    for (const c of [up, down, side]) {
      // Neutral: no purple (red and blue never both far above green).
      expect(Math.abs(c[0] - c[1]) / c[1]).toBeLessThan(0.25);
      expect(Math.abs(c[2] - c[1]) / c[1]).toBeLessThan(0.25);
    }
  });

  it("encodes a valid flat RGBE radiance file", () => {
    const bytes = studioEnvironmentHdr(16, 8);
    const text = new TextDecoder().decode(bytes.subarray(0, 60));
    expect(
      text.startsWith("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8 +X 16\n"),
    ).toBe(true);
    const header = "#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 8 +X 16\n".length;
    expect(bytes.length).toBe(header + 16 * 8 * 4);
    // Top row (zenith) decodes to about the zenith radiance.
    const e = bytes[header + 3] - 136;
    const g = bytes[header + 1] * 2 ** e;
    expect(g).toBeGreaterThan(0.3);
  });
});

describe("applying the finish", () => {
  it("sets the family response on a shared material without touching colour", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const m = new PBRMaterial("prefab-federation-primary", scene);
    m.albedoColor.set(0.6, 0.6, 0.62);
    // The coat lobe is a quality switch, off by default (cost); the family keeps the value.
    applySurfaceFinish(m, "plastic-light", { studio: false });
    expect(moldedClearCoatEnabled()).toBe(false);
    expect(m.clearCoat.isEnabled).toBe(false);
    applySurfaceFinish(m, "plastic-light", { studio: false, clearCoat: true });
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBeCloseTo(0.32, 5);
    expect(m.indexOfRefraction).toBeCloseTo(1.46, 5);
    expect(m.clearCoat.isEnabled).toBe(true);
    expect(m.clearCoat.intensity).toBeCloseTo(0.08, 5);
    expect(m.clearCoat.roughness).toBeCloseTo(0.2, 5);
    expect(m.albedoColor.asArray()).toEqual([0.6, 0.6, 0.62]);
    expect(m.imageProcessingConfiguration).toBe(moldedImageProcessing(scene));
    expect(m.imageProcessingConfiguration.toneMappingType).toBe(
      ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL,
    );
    expect(m.metadata[MOLDED_FINISH_KEY]).toBe("plastic-light");
    applySurfaceFinish(m, "fabric", { studio: false });
    expect(m.clearCoat.isEnabled).toBe(false);
    scene.dispose();
    engine.dispose();
  });

  it("finishes crew meshes by slot name and part, sharing one material per slot", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const suit = new PBRMaterial("crew.suit_primary", scene);
    const plate = new PBRMaterial("crew.suit_primary.001", scene);
    const grip = new PBRMaterial("slot:grip@orion", scene);
    tagCrewPart([plate], "armour");
    const meshes = [suit, plate, grip, suit].map((m, i) => {
      const box = CreateBox(`b${i}`, {}, scene);
      box.material = m;
      return box;
    });
    expect(applyMoldedFinishToMeshes(meshes, { studio: false })).toBe(3);
    expect(suit.roughness).toBeCloseTo(SURFACE_FINISHES.fabric.roughness, 5);
    expect(plate.roughness).toBeCloseTo(
      SURFACE_FINISHES["plastic-light"].roughness,
      5,
    );
    expect(grip.roughness).toBeCloseTo(SURFACE_FINISHES.rubber.roughness, 5);
    // Idempotent: a second pass changes nothing.
    expect(applyMoldedFinishToMeshes(meshes, { studio: false })).toBe(0);
    // A later theme swap that rewrites roughness is corrected on the next pass.
    grip.roughness = 0.85;
    expect(applyMoldedFinishToMeshes(meshes, { studio: false })).toBe(1);
    scene.dispose();
    engine.dispose();
  });

  it("creates one fill and one rim light per scene, scoped to included meshes", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const rig = moldedLightRig(scene);
    expect(moldedLightRig(scene)).toBe(rig);
    const box = CreateBox("b", {}, scene);
    const other = CreateBox("o", {}, scene);
    rig.include([box]);
    rig.include([box]);
    const lights = scene.lights.filter((l) => l.name.startsWith("molded-"));
    expect(lights).toHaveLength(2);
    for (const l of lights) {
      expect(l.includedOnlyMeshes.length).toBe(1);
      expect(l.includedOnlyMeshes[0] === box).toBe(true);
      expect(l.includedOnlyMeshes.includes(other)).toBe(false);
    }
    rig.dispose();
    expect(
      scene.lights.filter((l) => l.name.startsWith("molded-")),
    ).toHaveLength(0);
    scene.dispose();
    engine.dispose();
  });
});
