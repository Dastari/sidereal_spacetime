import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { cabinIsVisible, createCabinVisibility } from "./cabin-visibility";

test("cabin remains during closing transition and opens immediately for Deck", () => {
  expect(cabinIsVisible(false, 0.1, false)).toBe(true);
  expect(cabinIsVisible(false, 0.005, false)).toBe(false);
  expect(cabinIsVisible(true, 0, false)).toBe(true);
  expect(cabinIsVisible(true, 1, true)).toBe(false);
});

test("stationary cabin light state avoids repeated setters even under a hidden parent", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const actor = new TransformNode("actor", scene),
    tray = new TransformNode("tray", scene);
  tray.metadata = { partId: "room-hydro" };
  const light = new PointLight("grow", Vector3.Zero(), scene);
  light.parent = tray;
  const visibility = createCabinVisibility(
    [],
    actor,
    [{ node: tray, lighting: { lights: [light] } }],
    new Set(["room-hydro"]),
  );
  let calls = 0;
  const original = light.setEnabled.bind(light);
  light.setEnabled = (value) => {
    calls++;
    original(value);
  };
  const on = [{ placementId: "room-hydro", enabled: true }];
  for (let i = 0; i < 10; i++) visibility.update(true, on);
  expect(calls).toBe(0);
  tray.setEnabled(false);
  for (let i = 0; i < 10; i++) visibility.update(true, on);
  expect(calls).toBe(0);
  expect(light.isEnabled()).toBe(false);
  expect(light.isEnabled(false)).toBe(true);
  visibility.update(false, on);
  expect(calls).toBe(1);
  expect(light.isEnabled(false)).toBe(false);
  for (let i = 0; i < 10; i++) visibility.update(false, on);
  expect(calls).toBe(1);
  visibility.update(true, on);
  expect(calls).toBe(2);
  expect(light.isEnabled(false)).toBe(true);
  visibility.update(true, [{ placementId: "room-hydro", enabled: false }]);
  expect(calls).toBe(3);
  visibility.update(true, [{ placementId: "room-hydro", enabled: false }]);
  expect(calls).toBe(3);
  scene.dispose();
  engine.dispose();
});

test("UUID-named authored floors, furniture and cargo stop rendering in flight and restore on deck", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const actor = new TransformNode("actor", scene);
  const meshes = ["floor", "equipment", "cargo", "wall", "roof", "engine"].map(
    (category, i) => {
      const mesh = CreateBox(`GEO-uuid-${i}--authored`, {}, scene);
      mesh.metadata = { category };
      return mesh;
    },
  );
  const partition = CreateBox("GEO-uuid-partition", {}, scene);
  partition.metadata = {
    category: "wall",
    nativeSourceName: "GEO-partitions-medbay",
  };
  const visibility = createCabinVisibility(
    [...meshes, partition],
    actor,
    [],
    new Set(),
  );
  visibility.update(false, []);
  expect(meshes.map((m) => m.isEnabled())).toEqual([
    false,
    false,
    false,
    true,
    true,
    true,
  ]);
  expect(partition.isEnabled()).toBe(false);
  visibility.update(true, []);
  expect([...meshes, partition].every((m) => m.isEnabled())).toBe(true);
  scene.dispose();
  engine.dispose();
});
