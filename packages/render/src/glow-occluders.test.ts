import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { createGlowOccluders } from "./glow-occluders";
test("foreground ship contributes depth while its bright material cannot join planetary bloom", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    layer = new GlowLayer("planet", scene, { excludeByDefault: true });
  const planet = CreateBox("deposit", {}, scene),
    ship = CreateBox("floor", {}, scene),
    material = new PBRMaterial("bright", scene);
  material.emissiveColor = new Color3(0.5, 0.2, 0.1);
  material.emissiveIntensity = 2;
  planet.material = ship.material = material;
  layer.addIncludedOnlyMesh(planet);
  const occlusion = createGlowOccluders(layer);
  expect(layer.hasMesh(ship)).toBe(false);
  occlusion.set([ship]);
  expect(layer.hasMesh(ship)).toBe(true);
  const color = new Color4();
  layer.customEmissiveColorSelector(ship, ship.subMeshes[0], material, color);
  expect(color.asArray()).toEqual([0, 0, 0, 1]);
  layer.customEmissiveColorSelector(
    planet,
    planet.subMeshes[0],
    material,
    color,
  );
  expect(color.asArray()).toEqual([1, 0.4, 0.2, 1]);
  expect(material.emissiveColor.asArray()).toEqual([0.5, 0.2, 0.1]);
  ship.visibility = 0.25;
  layer.customEmissiveColorSelector(ship, ship.subMeshes[0], material, color);
  expect(color.a).toBe(0.25);
  occlusion.dispose();
  expect(layer.hasMesh(ship)).toBe(false);
  expect(layer.hasMesh(planet)).toBe(true);
  scene.dispose();
  engine.dispose();
});
test("replacement and disposed equipment leave no stale inclusion or observer references", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    layer = new GlowLayer("planet", scene, { excludeByDefault: true }),
    planet = CreateBox("planet", {}, scene),
    first = CreateBox("old", {}, scene),
    next = CreateBox("new", {}, scene);
  first.material = next.material = new PBRMaterial("opaque", scene);
  layer.addIncludedOnlyMesh(planet);
  const previous = layer.customEmissiveColorSelector,
    occlusion = createGlowOccluders(layer),
    baseline = first.onDisposeObservable.observers.length;
  occlusion.set([first, first]);
  expect(first.onDisposeObservable.observers.length).toBe(baseline + 1);
  occlusion.set([next]);
  expect(layer.hasMesh(first)).toBe(false);
  expect(layer.hasMesh(next)).toBe(true);
  next.dispose();
  expect(layer.hasMesh(next)).toBe(false);
  occlusion.dispose();
  occlusion.dispose();
  expect(layer.customEmissiveColorSelector).toBe(previous);
  expect(layer.hasMesh(planet)).toBe(true);
  scene.dispose();
  engine.dispose();
});
