import { expect, test, vi } from "vitest";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { createShipLighting } from "./ship-lighting";
import { sphereIntersectsSpot } from "./ship-shadow-cache";

test("spot culling retains intersecting large blockers and rejects distant or behind-light objects", () => {
  const origin = Vector3.Zero(),
    direction = new Vector3(0, 0, 1);
  expect(
    sphereIntersectsSpot(
      new Vector3(0, 0, 4),
      0.5,
      origin,
      direction,
      6,
      Math.PI / 2,
    ),
  ).toBe(true);
  expect(
    sphereIntersectsSpot(
      new Vector3(4, 0, 3),
      2,
      origin,
      direction,
      6,
      Math.PI / 2,
    ),
  ).toBe(true);
  expect(
    sphereIntersectsSpot(
      new Vector3(0, 0, 10),
      1,
      origin,
      direction,
      6,
      Math.PI / 2,
    ),
  ).toBe(false);
  expect(
    sphereIntersectsSpot(
      new Vector3(0, 0, -3),
      1,
      origin,
      direction,
      6,
      Math.PI / 2,
    ),
  ).toBe(false);
});

test("static spots cache across ship motion, while at most two actor maps refresh and old membership clears", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const wall = CreateBox("GEO-partitions", {}, scene);
  wall.metadata = {role:"wall",shadowStructural:true};
  wall.parent = root;
  wall.position.set(-3, 1, 6);
  const distant = CreateBox("native-distant", {}, scene);
  distant.parent = root;
  distant.position.set(100, 0, 100);
  const lighting = createShipLighting(scene, root, [wall, distant]);
  const maps = scene.lights
    .filter(
      (light) =>
        light.name.startsWith("room-luminaire") ||
        light.name === "bridge-console-spill",
    )
    .map((light) => light.getShadowGenerator()!.getShadowMap()!);
  expect(maps.every((map) => map.refreshRate === 0)).toBe(true);
  expect(maps.every((map) => !map.renderList!.includes(distant))).toBe(true);
  const resets = maps.map((map) => vi.spyOn(map, "resetRefreshCounter"));
  root.position.set(1234, 0, -5678);
  root.rotation.y = 1.27;
  lighting.update(1, -3, -6);
  expect(resets.every((reset) => reset.mock.calls.length === 0)).toBe(true);
  wall.position.x -= 0.2;
  lighting.update(1, -3, -6);
  expect(resets.every((reset) => reset.mock.calls.length === 1)).toBe(true);
  resets.forEach((reset) => reset.mockClear());
  wall.geometry!.setIndices([...wall.getIndices()!].reverse());
  lighting.update(1, -3, -6);
  expect(resets.every((reset) => reset.mock.calls.length === 1)).toBe(true);
  resets.forEach((reset) => reset.mockClear());
  const actor = CreateBox("crew", {}, scene);
  actor.parent = root;
  lighting.addActor([actor]);
  lighting.update(1, -3, -6);
  expect(maps.filter((map) => map.renderList!.includes(actor))).toHaveLength(2);
  resets.forEach((reset) => reset.mockClear());
  lighting.update(1, -3, -6);
  expect(resets.filter((reset) => reset.mock.calls.length > 0)).toHaveLength(2);
  lighting.update(1, 100, 100);
  expect(maps.every((map) => !map.renderList!.includes(actor))).toBe(true);
  resets.forEach((reset) => reset.mockClear());
  lighting.update(1, 100, 100);
  expect(resets.every((reset) => reset.mock.calls.length === 0)).toBe(true);
  scene.dispose();
  engine.dispose();
});

test("cutaway retains physical proxies and edits while cabin lighting is hidden refresh on return", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  const wall = CreateBox("GEO-partitions", {}, scene);
  wall.metadata = {role:"wall",shadowStructural:true};
  wall.parent = root;
  wall.position.set(-3, 1, 6);
  const prop = CreateBox("opaque-prop", {}, scene);
  prop.parent = root;
  prop.position.copyFrom(wall.position);
  const lighting = createShipLighting(scene, root, [wall, prop]);
  const maps = scene.lights
    .filter(
      (light) =>
        light.name.startsWith("room-luminaire") ||
        light.name === "bridge-console-spill",
    )
    .map((light) => light.getShadowGenerator()!.getShadowMap()!);
  const proxy = scene.getMeshByName("shadow-occluder-GEO-partitions")!;
  expect(maps.some((map) => map.renderList!.includes(proxy))).toBe(true);
  expect(maps.some((map) => map.renderList!.includes(prop))).toBe(true);
  const resets = maps.map((map) => vi.spyOn(map, "resetRefreshCounter"));
  wall.isVisible = false;
  wall.visibility = 0;
  wall.setEnabled(false);
  lighting.update(1, -3, -6);
  expect(maps.some((map) => map.renderList!.includes(proxy))).toBe(true);
  expect(resets.every((reset) => reset.mock.calls.length === 0)).toBe(true);
  prop.setEnabled(false);
  lighting.update(1, -3, -6);
  expect(maps.every((map) => !map.renderList!.includes(prop))).toBe(true);
  expect(resets.every((reset) => reset.mock.calls.length === 1)).toBe(true);
  resets.forEach((reset) => reset.mockClear());
  lighting.setCabinVisible(false);
  wall.position.x += 0.2;
  lighting.update(0, -3, -6);
  expect(resets.every((reset) => reset.mock.calls.length === 0)).toBe(true);
  lighting.setCabinVisible(true);
  lighting.update(1, -3, -6);
  expect(resets.every((reset) => reset.mock.calls.length === 1)).toBe(true);
  scene.dispose();
  engine.dispose();
});
