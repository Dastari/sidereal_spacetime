import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { bindHeadWornPalette, equippedHelmetPalette } from "./head-palette";

const engines: NullEngine[] = [];
const scene = () => {
  const engine = new NullEngine();
  engines.push(engine);
  return new Scene(engine);
};
afterEach(() => {
  vi.restoreAllMocks();
  engines.splice(0).forEach((engine) => engine.dispose());
});

test("helmet family owns worn colors independently of selected uniform and unknown gear", () => {
  const selected = { suit_primary: "#ffffff", skin: "#aa7744" };
  const marine = equippedHelmetPalette("marine-helmet", selected);
  expect(marine.suit_primary).toBe("#bd253c");
  expect(marine.suit_secondary).toBe("#2c2732");
  expect(marine.skin).toBe(selected.skin);
  expect(equippedHelmetPalette("missing-helmet", selected)).toEqual(selected);
  expect(equippedHelmetPalette("marine-chest", selected)).toEqual(selected);
});

test("actual PBR configurations and textures stay borrowed while two actors own worn clones", () => {
  const s = scene();
  const source = new PBRMaterial("crew.suit_primary", s);
  const texture = new Texture(null, s);
  source.albedoTexture = texture;
  source.bumpTexture = texture;
  source.clearCoat.isEnabled = true;
  source.clearCoat.intensity = 0.35;
  source.clearCoat.texture = texture;
  source.sheen.isEnabled = true;
  source.sheen.color = new Color3(0.1, 0.2, 0.3);
  source.backFaceCulling = false;
  source.roughness = 0.64;
  source.metadata = { source: "sealed-substrate" };
  const a = new Mesh("helmet-a", s),
    b = new Mesh("helmet-b", s);
  a.material = b.material = source;
  const textureCount = s.textures.length;
  const disposeTexture = vi.spyOn(texture, "dispose");
  const ownedA = bindHeadWornPalette([a], { suit_primary: "#bd253c" });
  const ownedB = bindHeadWornPalette([b], { suit_primary: "#3159b3" });
  const first = a.material as PBRMaterial,
    second = b.material as PBRMaterial;
  expect(first).not.toBe(source);
  expect(second).not.toBe(first);
  expect(first.name).toBe(source.name);
  expect(first.albedoColor).toEqual(
    Color3.FromHexString("#bd253c").toLinearSpace(),
  );
  expect(second.albedoColor).toEqual(
    Color3.FromHexString("#3159b3").toLinearSpace(),
  );
  expect(source.albedoColor).toEqual(Color3.White());
  expect(first.albedoTexture).toBe(texture);
  expect(first.bumpTexture).toBe(texture);
  expect(first.clearCoat.texture).toBe(texture);
  expect(first.clearCoat.intensity).toBe(0.35);
  expect(first.roughness).toBe(0.64);
  expect(first.backFaceCulling).toBe(false);
  expect(first.sheen.color).not.toBe(source.sheen.color);
  first.sheen.color.r = 0.9;
  expect(source.sheen.color.r).toBe(0.1);
  expect(second.sheen.color.r).toBe(0.1);
  expect(first.metadata).toEqual({
    source: "sealed-substrate",
    crewPart: "head",
  });
  expect(s.textures.length).toBe(textureCount);
  ownedA.dispose();
  ownedA.dispose();
  expect(a.material).toBe(source);
  expect(b.material).toBe(second);
  expect(s.materials).not.toContain(first);
  expect(s.materials).toContain(second);
  expect(disposeTexture).not.toHaveBeenCalled();
  ownedB.dispose();
  expect(b.material).toBe(source);
  expect(disposeTexture).not.toHaveBeenCalled();
});

test("MultiMaterial sharing remains local and skin, hair, glass, face and cloth are not recolored", () => {
  const s = scene();
  const slots = ["suit_primary", "skin", "hair", "glass", "face", "cloth"];
  const materials = slots.map((slot) => new PBRMaterial(`crew.${slot}`, s));
  const mixed = new MultiMaterial("head-slots", s);
  mixed.subMaterials = [...materials, materials[0]];
  const first = new Mesh("helm-first", s),
    second = new Mesh("helm-second", s);
  first.material = second.material = mixed;
  const owned = bindHeadWornPalette(
    [first],
    Object.fromEntries(slots.map((slot) => [slot, "#bd253c"])),
  );
  const clone = first.material as MultiMaterial;
  expect(clone).not.toBe(mixed);
  expect(second.material).toBe(mixed);
  expect(clone.subMaterials[0]).not.toBe(materials[0]);
  expect(clone.subMaterials[6]).toBe(clone.subMaterials[0]);
  slots
    .slice(1)
    .forEach((_, index) =>
      expect(clone.subMaterials[index + 1]).toBe(materials[index + 1]),
    );
  owned.dispose();
  expect(first.material).toBe(mixed);
  expect(s.materials).toEqual(expect.arrayContaining(materials));
});

test("palette emit owns its new emissive color and disposal does not replace a later owner", () => {
  const s = scene();
  const source = new PBRMaterial("crew.emit", s),
    later = new PBRMaterial("later-owner", s);
  const mesh = new Mesh("helmet-light", s);
  mesh.material = source;
  const owned = bindHeadWornPalette([mesh], { emit: "#ff4d5e" });
  const clone = mesh.material as PBRMaterial;
  expect(clone.emissiveColor).toEqual(
    Color3.FromHexString("#ff4d5e").toLinearSpace(),
  );
  expect(source.emissiveColor).toEqual(Color3.Black());
  mesh.material = later;
  owned.dispose();
  expect(mesh.material).toBe(later);
});
