import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { crewArmorPart } from "@sidereal/content/crew-armor";
import {
  attachCrewArmor,
  crewArmorSlotColors,
  crewMaterialSlot,
} from "./armor-attach";

const glb = (id: string) => {
  const bytes = readFileSync(
    new URL(
      `../../../../assets/runtime/crew/armor-v1/parts/${id}.glb`,
      import.meta.url,
    ),
  );
  return new Uint8Array(bytes);
};
const isGlb = (b: Uint8Array) =>
  String.fromCharCode(b[0], b[1], b[2], b[3]) === "glTF";

describe("voxel crew armour attach", () => {
  it("maps crew.<slot> material names and colourway colours", () => {
    expect(crewMaterialSlot("crew.suit_primary")).toBe("suit_primary");
    expect(crewMaterialSlot("crew.emit.001")).toBe("emit");
    expect(crewMaterialSlot("hull.primary")).toBeUndefined();
    const colors = crewArmorSlotColors("crimson");
    expect(colors.suit_primary?.equals(Color3.FromHexString("#c8263d").toLinearSpace())).toBe(true);
    expect(colors.skin).toBeUndefined();
  });

  it("keeps the body's fit, links the armour skeleton to body joints and recolours by slot", async () => {
    const chestBytes = glb("armor.chest.plate");
    if (!isGlb(chestBytes)) return; // un-fetched Git LFS pointer
    const engine = new NullEngine();
    const scene = new Scene(engine);
    // Stand-in body: any kit GLB carries the full crew_rig joint hierarchy.
    const body = await SceneLoader.LoadAssetContainerAsync("", glb("armor.boots.standard"), scene, undefined, ".glb");
    body.addAllToScene();
    const root = new TransformNode("crew-visual", scene);
    for (const node of body.rootNodes) node.parent = root;
    const joints = new Map(body.transformNodes.map((n) => [n.name, n]));
    const part = crewArmorPart("armor.chest.plate")!;
    const armour = await attachCrewArmor(scene, { root, joints }, part, {
      variant: "female",
      colourway: "crimson",
      source: chestBytes,
    });
    expect(armour.meshes.length).toBeGreaterThan(0);
    for (const mesh of armour.meshes)
      expect(mesh.name.startsWith("GEO-armor-armor.chest.plate-narrow")).toBe(true);
    expect(scene.meshes.some((m) => m.name.includes("chest.plate-wide"))).toBe(false);
    expect(armour.linkedBones).toEqual(expect.arrayContaining(["chest", "spine", "hand.R", "foot.L"]));
    const skeleton = armour.meshes.find((m) => m.skeleton)!.skeleton!;
    const chestBone = skeleton.bones.find((b) => b.name === "chest")!;
    expect(chestBone.getTransformNode()).toBe(joints.get("chest"));
    const primary = armour.meshes
      .map((m) => m.material)
      .find((m) => m?.name.startsWith("crew.suit_primary")) as PBRMaterial | undefined;
    expect(primary).toBeDefined();
    const crimson = Color3.FromHexString("#c8263d").toLinearSpace();
    expect(primary!.albedoColor.equalsWithEpsilon(crimson, 1e-3)).toBe(true);
    armour.setColourway("cobalt");
    armour.dispose();
    expect(armour.meshes.every((m) => m.isDisposed())).toBe(true);
    scene.dispose();
    engine.dispose();
  });
});
