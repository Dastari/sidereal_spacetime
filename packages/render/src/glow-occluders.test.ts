import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import {
  createGlowOccluders,
  setGlowOccludingActors,
} from "./glow-occluders";
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
test("crew actors occlude every ship glow layer in the scene, including layers created later", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    shipGlow = new GlowLayer("prefab-ship-glow", scene),
    light = CreateBox("light-strip", {}, scene),
    wall = CreateBox("wall", {}, scene),
    crew = CreateBox("crew-body", {}, scene),
    emitter = new PBRMaterial("emit", scene),
    opaque = new PBRMaterial("suit", scene);
  emitter.emissiveColor = new Color3(0.2, 0.8, 1);
  opaque.emissiveColor = new Color3(0.1, 0.4, 0.5);
  light.material = emitter;
  wall.material = crew.material = opaque;
  shipGlow.addIncludedOnlyMesh(light);
  const ship = createGlowOccluders(shipGlow);
  ship.set([wall]);
  expect(shipGlow.hasMesh(crew)).toBe(false);
  setGlowOccludingActors(scene, [crew]);
  expect(shipGlow.hasMesh(crew)).toBe(true);
  expect(shipGlow.hasMesh(wall)).toBe(true);
  const color = new Color4();
  shipGlow.customEmissiveColorSelector(crew, crew.subMeshes[0], opaque, color);
  expect(color.asArray()).toEqual([0, 0, 0, 1]);
  // A ship view that re-sets its own occluders keeps the actors.
  ship.set([]);
  expect(shipGlow.hasMesh(crew)).toBe(true);
  expect(shipGlow.hasMesh(wall)).toBe(false);
  // Layers created after registration pick the actors up too.
  const later = new GlowLayer("later", scene);
  later.addIncludedOnlyMesh(light);
  const laterOccluders = createGlowOccluders(later);
  expect(later.hasMesh(crew)).toBe(true);
  setGlowOccludingActors(scene, []);
  expect(shipGlow.hasMesh(crew)).toBe(false);
  expect(later.hasMesh(crew)).toBe(false);
  expect(shipGlow.hasMesh(light)).toBe(true);
  laterOccluders.dispose();
  ship.dispose();
  // Disposed layers no longer listen for actor changes.
  setGlowOccludingActors(scene, [crew]);
  expect(shipGlow.hasMesh(crew)).toBe(false);
  scene.dispose();
  engine.dispose();
});
