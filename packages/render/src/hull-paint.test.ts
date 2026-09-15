import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { PartAsset } from "@sidereal/content/assembly";
import {
  createHullPaintBinding,
  hullAtlasPaintRole,
  hullMaterialPaintRole,
} from "./hull-paint";
const asset = {
  id: "armor",
  label: "Armor",
  category: "superstructure",
} as PartAsset;
test("paint variants share geometry/maps and release only their own materials", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const source = CreateBox("source", {}, scene),
    material = new PBRMaterial("Armor cassette / enamel", scene);
  const texture = RawTexture.CreateRGBTexture(
    new Uint8Array([128, 128, 128]),
    1,
    1,
    scene,
  );
  material.albedoTexture = texture;
  material.bumpTexture = texture;
  material.metallic = 0.7;
  material.roughness = 0.4;
  material.clearCoat.isEnabled = true;
  material.clearCoat.texture = texture;
  material.freeze();
  source.material = material;
  const baseline = scene.materials.length,
    textureCount = scene.textures.length;
  const a = new TransformNode("a", scene),
    b = new TransformNode("b", scene);
  const red = createHullPaintBinding(a, asset, { primary: "#ff0000" })!.clone(
    source,
    "red",
  );
  const blue = createHullPaintBinding(b, asset, { primary: "#0000ff" })!.clone(
    source,
    "blue",
  );
  expect(red.geometry).toBe(source.geometry);
  expect(blue.geometry).toBe(source.geometry);
  expect(red.material).not.toBe(blue.material);
  expect(red.material).not.toBe(material);
  const variant = red.material as PBRMaterial;
  expect(variant.albedoTexture).toBe(texture);
  expect(variant.bumpTexture).toBe(texture);
  expect(variant.clearCoat.texture).toBe(texture);
  expect(variant.metallic).toBe(0.7);
  expect(variant.roughness).toBe(0.4);
  expect(material.isFrozen).toBe(true);
  expect(material.albedoColor).toEqual(Color3.White());
  expect(scene.textures).toHaveLength(textureCount);
  a.dispose();
  expect(scene.materials).toContain(blue.material);
  expect(scene.materials).toContain(material);
  b.dispose();
  expect(scene.materials).toHaveLength(baseline);
  expect(scene.textures).toContain(texture);
  expect(
    createHullPaintBinding(new TransformNode("plain", scene), asset, {}),
  ).toBeUndefined();
  scene.dispose();
  engine.dispose();
});
test("engine multi-material paint preserves emissive core, glass and steel", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("paint", scene);
  const mesh = CreateBox("engine", {}, scene),
    multi = new MultiMaterial("engine", scene);
  const pale = new PBRMaterial("MAT-framed-engine-pale", scene),
    red = new PBRMaterial("MAT-framed-engine-red", scene),
    steel = new PBRMaterial("MAT-framed-engine-steel", scene),
    glass = new PBRMaterial("glass", scene),
    light = new PBRMaterial("light", scene);
  glass.alpha = 0.3;
  light.emissiveColor = Color3.Blue();
  multi.subMaterials = [pale, red, steel, glass, light];
  mesh.material = multi;
  const copy = createHullPaintBinding(
    root,
    { ...asset, category: "engine" },
    { primary: "#2288ff", secondary: "#ffaa00" },
  )!.clone(mesh, "painted");
  const materials = (copy.material as MultiMaterial).subMaterials;
  expect(materials[0]).not.toBe(pale);
  expect(materials[1]).not.toBe(red);
  const primaryDefines: Record<string, { type: string; default: unknown }> = {},
    secondaryDefines: Record<string, { type: string; default: unknown }> = {};
  materials[0]!
    .pluginManager!.getPlugin("HullPlacementPaint")!
    .collectDefines(primaryDefines);
  materials[1]!
    .pluginManager!.getPlugin("HullPlacementPaint")!
    .collectDefines(secondaryDefines);
  expect(primaryDefines.HULL_PAINT_ROLE.default).not.toBe(
    secondaryDefines.HULL_PAINT_ROLE.default,
  );
  expect(materials.slice(2)).toEqual([steel, glass, light]);
  root.dispose();
  expect(scene.materials).toContain(pale);
  expect(scene.materials).toContain(steel);
  scene.dispose();
  engine.dispose();
});
test("native atlas masks separate panel faces, backing and protected metal", () => {
  const region = (x: number, y: number) =>
    hullAtlasPaintRole(x / 16, 1 - y / 16);
  expect(region(1, 1)).toBe("primary");
  expect(region(3, 1)).toBe("primary");
  expect(region(10, 1)).toBe("primary");
  expect(region(6, 8)).toBe("primary");
  expect(region(1, 4)).toBe("secondary");
  expect(region(6, 4)).toBe("secondary");
  expect(region(10, 4)).toBe("protected");
  expect(region(14, 4)).toBe("protected");
  const engine = new NullEngine(),
    scene = new Scene(engine);
  expect(
    hullMaterialPaintRole(new PBRMaterial("clean hull paint", scene)),
  ).toBe("surface");
  expect(
    hullMaterialPaintRole(new PBRMaterial("Titanium hardware", scene)),
  ).toBe("surface");
  expect(hullMaterialPaintRole(new PBRMaterial("Graphite seals", scene))).toBe(
    "protected",
  );
  scene.dispose();
  engine.dispose();
});
