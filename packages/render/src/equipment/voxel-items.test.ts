import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { CREW_ITEM_CATALOG, crewItem } from "../../../content/src/crew-items";
import { applyCrewItemTheme, crewItemHandSocketRotation, crewItemSlotFromMaterialName } from "./voxel-items";

describe("voxel crew item runtime hook", () => {
  it("parses exported slot material names", () => {
    expect(crewItemSlotFromMaterialName("slot:primary@orion")).toBe("primary");
    expect(crewItemSlotFromMaterialName("slot:emit_a@orion+stun-gun")).toBe("emit_a");
    expect(crewItemSlotFromMaterialName("fx:core@muzzle-flash")).toBeUndefined();
    expect(crewItemSlotFromMaterialName("slot:unknown@orion")).toBeUndefined();
  });

  it("recolours slot materials from a theme table without touching other materials", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const primary = new PBRMaterial("slot:primary@orion", scene);
    const emit = new PBRMaterial("slot:emit_a@orion", scene);
    const other = new PBRMaterial("unrelated", scene);
    const item = crewItem("pistol");
    expect(applyCrewItemTheme([primary, emit, other], item, "security")).toBe(2);
    const sec = CREW_ITEM_CATALOG.themes.security;
    expect(primary.albedoColor.asArray()).toEqual([...sec.primary.color]);
    expect(emit.emissiveIntensity).toBe(sec.emit_a.emissiveStrength);
    expect(other.albedoColor.asArray()).toEqual([1, 1, 1]);
    scene.dispose();
    engine.dispose();
  });

  it("maps item forward (+Y) onto the hand socket barrel axis (+X)", () => {
    const forward = new Vector3(0, 1, 0).rotateByQuaternionToRef(crewItemHandSocketRotation(), new Vector3());
    expect(forward.x).toBeCloseTo(1, 6);
    expect(forward.y).toBeCloseTo(0, 6);
  });
});
