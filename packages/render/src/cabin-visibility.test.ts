import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { cabinIsVisible, createCabinVisibility } from "./cabin-visibility";
import { createShipLighting } from "./ship-lighting";

test("cabin remains during closing transition and opens immediately for Deck", () => {
  expect(cabinIsVisible(false, 0.1, false)).toBe(true);
  expect(cabinIsVisible(false, 0.005, false)).toBe(false);
  expect(cabinIsVisible(true, 0, false)).toBe(true);
  expect(cabinIsVisible(true, 1, true)).toBe(false);
});
test("closed ship skips cabin meshes/lights while preserving hull and authoritative grow-light state", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const names = [
    "GEO-deck",
    "GEO-partitions",
    "GEO-room-lounge--native--sofa",
    "GEO-equipment-control",
    "GEO-walls",
    "GEO-roof",
    "GEO-drives-main",
    "GEO-hull-native",
  ];
  const meshes = names.map((name) => CreateBox(name, {}, scene));
  const actor = new TransformNode("crew", scene);
  const grow = new PointLight("grow", Vector3.Zero(), scene),
    nav = new PointLight("navigation", Vector3.Zero(), scene);
  const tray = new TransformNode("tray", scene);
  tray.metadata = { partId: "room-hydro" };
  const hull = new TransformNode("hull", scene);
  hull.metadata = { partId: "hull-native" };
  const visibility = createCabinVisibility(
    meshes,
    actor,
    [
      { node: tray, lighting: { lights: [grow] } },
      { node: hull, lighting: { lights: [nav] } },
    ],
    new Set(["room-hydro"]),
  );
  const lighting = createShipLighting(scene, root, meshes);
  visibility.update(false, [{ placementId: "room-hydro", enabled: true }]);
  lighting.setCabinVisible(false);
  lighting.update(0, 0, 0);
  expect(meshes.slice(0, 4).every((mesh) => !mesh.isEnabled())).toBe(true);
  expect(meshes.slice(4).every((mesh) => mesh.isEnabled())).toBe(true);
  expect(actor.isEnabled()).toBe(false);
  expect(grow.isEnabled()).toBe(false);
  expect(nav.isEnabled()).toBe(true);
  expect(
    scene.lights.filter(
      (light) => light.isEnabled() && light.getShadowGenerator(),
    ),
  ).toHaveLength(1);
  visibility.update(true, [{ placementId: "room-hydro", enabled: false }]);
  lighting.setCabinVisible(true);
  lighting.update(1, 0, 0);
  expect(meshes.every((mesh) => mesh.isEnabled())).toBe(true);
  expect(actor.isEnabled()).toBe(true);
  expect(grow.isEnabled()).toBe(false);
  expect(nav.isEnabled()).toBe(true);
  expect(
    scene.lights.filter(
      (light) => light.isEnabled() && light.getShadowGenerator(),
    ),
  ).toHaveLength(8);
  visibility.update(true, [{ placementId: "room-hydro", enabled: true }]);
  expect(grow.isEnabled()).toBe(true);
  scene.dispose();
  engine.dispose();
});

test("stationary cabin light state avoids repeated setters even under a hidden parent", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const actor = new TransformNode("actor", scene), tray = new TransformNode("tray", scene);
  tray.metadata = {partId:"room-hydro"};
  const light = new PointLight("grow", Vector3.Zero(), scene); light.parent = tray;
  const visibility = createCabinVisibility([], actor, [{node:tray,lighting:{lights:[light]}}], new Set(["room-hydro"]));
  let calls = 0; const original = light.setEnabled.bind(light);
  light.setEnabled = value => {calls++; original(value);};
  const on = [{placementId:"room-hydro",enabled:true}];
  for(let i=0;i<10;i++)visibility.update(true,on);
  expect(calls).toBe(0);
  tray.setEnabled(false);
  for(let i=0;i<10;i++)visibility.update(true,on);
  expect(calls).toBe(0);expect(light.isEnabled()).toBe(false);expect(light.isEnabled(false)).toBe(true);
  visibility.update(false,on);expect(calls).toBe(1);expect(light.isEnabled(false)).toBe(false);
  for(let i=0;i<10;i++)visibility.update(false,on);
  expect(calls).toBe(1);
  visibility.update(true,on);expect(calls).toBe(2);expect(light.isEnabled(false)).toBe(true);
  visibility.update(true,[{placementId:"room-hydro",enabled:false}]);expect(calls).toBe(3);
  visibility.update(true,[{placementId:"room-hydro",enabled:false}]);expect(calls).toBe(3);
  scene.dispose();engine.dispose();
});
