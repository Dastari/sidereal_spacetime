import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { createShipLighting } from "./ship-lighting";
import { CABIN_ROOMS } from "../../content/src/interior";

test("identified roof proxies batch while cutaway and independently hidden Flight decks retain their shadow policy", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const decks = [
    new TransformNode("main", scene),
    new TransformNode("upper", scene),
  ];
  decks.forEach((d) => (d.parent = root));
  const roofs = [0, 1, 2].map((i) => {
    const mesh = CreateBox("arbitrary-authored-name", {}, scene);
    mesh.parent = decks[i === 2 ? 1 : 0];
    mesh.metadata = {
      role: "roof",
      shadowStructural: true,
      partId: "roof-" + i,
      deckId: i === 2 ? "upper" : "main",
    };
    return mesh;
  });
  const lighting = createShipLighting(scene, root, roofs);
  const map = lighting.primaryLight.getShadowGenerator()!.getShadowMap()!;
  expect(map.renderList).toHaveLength(2);
  const main = map.renderList!.find((m) => m.metadata.deckId === "main")!;
  expect(
    main.metadata.trianglePlacements.map(
      (r: { placementId: string }) => r.placementId,
    ),
  ).toEqual(["roof-0", "roof-1"]);
  roofs[0].setEnabled(false);
  roofs[0].visibility = 0;
  lighting.update(1, 0, 0);
  expect(map.renderList).toContain(main);
  lighting.setCabinVisible(false);
  decks[1].setEnabled(false);
  lighting.update(0, 0, 0);
  expect(map.renderList!.some((m) => m.metadata.deckId === "upper")).toBe(
    false,
  );
  decks[1].setEnabled(true);
  lighting.update(0, 0, 0);
  expect(map.renderList!.some((m) => m.metadata.deckId === "upper")).toBe(true);
  scene.dispose();
  engine.dispose();
});

test("cabin, exterior and walking actor stay within eight eligible lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  const meshes = [
    "deck",
    "walls",
    "partitions",
    "cutaway",
    "equipment-control",
    ...CABIN_ROOMS.map((r) => "room-" + r.id),
  ].map((name) => {
    const m = CreateBox("GEO-" + name, {}, scene);
    m.material = new PBRMaterial(name, scene);
    return m;
  });
  const actor = CreateBox("crew", {}, scene);
  const lighting = createShipLighting(scene, root, meshes);
  lighting.addActor([actor]);
  for (const room of CABIN_ROOMS) {
    lighting.update(1, room.x, room.y);
    for (const mesh of [...meshes, actor]) {
      expect(
        scene.lights.filter((light) => light.canAffectMesh(mesh)).length,
        mesh.name,
      ).toBeLessThanOrEqual(8);
      expect(mesh.isEnabled()).toBe(true);
      expect(mesh.visibility).toBe(1);
    }
    expect(
      scene.lights.filter((light) => light.getShadowGenerator() !== null),
    ).toHaveLength(8);
  }
  lighting.update(0, 0, 0);
  expect(
    scene.lights.filter((light) => light.getShadowGenerator() !== null),
  ).toHaveLength(8);
  scene.dispose();
  engine.dispose();
});

test("occluders are independent of receivers and cutaway visibility", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  const wall = CreateBox("GEO-cutaway-port", {}, scene);
  wall.metadata = { role: "wall", shadowStructural: true };
  wall.parent = root;
  wall.position.set(-3.1, 1, 6);
  wall.material = new PBRMaterial("wall-original", scene);
  const foreignProp = CreateBox("GEO-room-storage-crate", {}, scene);
  foreignProp.position.set(-3.1, 0.5, 6);
  foreignProp.material = new PBRMaterial("crate-original", scene);
  const lighting = createShipLighting(scene, root, [wall, foreignProp]);
  lighting.update(1, -3.1, -6);
  const engineering = scene.lights.find(
    (light) => light.name === "room-luminaire-engineering",
  )!;
  expect(engineering.canAffectMesh(foreignProp)).toBe(false);
  expect(
    engineering.getShadowGenerator()!.getShadowMap()!.renderList,
  ).toContain(foreignProp);
  const proxy = scene.meshes.find(
    (mesh) => mesh.name === "shadow-occluder-GEO-cutaway-port",
  )!;
  wall.setEnabled(false);
  wall.visibility = 0;
  expect(proxy.isEnabled()).toBe(true);
  expect(proxy.isVisible).toBe(true);
  expect(proxy.visibility).toBe(1);
  expect(proxy.layerMask & 0x0fffffff).toBe(0);
  expect(proxy.material).not.toBe(wall.material);
  expect(wall.material.name).toBe("wall-original");
  expect(proxy.parent).toBe(root);
  for (const light of scene.lights.filter((light) =>
    light.getShadowGenerator(),
  )) {
    const map = light.getShadowGenerator()!.getShadowMap()!;
    if (
      light.name === "room-luminaire-engineering" ||
      light.name === "exterior-key"
    )
      expect(map.renderList).toContain(proxy);
    expect(map.forceLayerMaskCheck).toBe(false);
  }
  lighting.update(0, 0, 0);
  expect(
    scene.lights.filter((light) => light.getShadowGenerator()),
  ).toHaveLength(8);
  scene.dispose();
  expect(proxy.isDisposed()).toBe(true);
  engine.dispose();
});

test("actor door and bridge spill respect partition visibility", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  const prop = CreateBox("GEO-room-engineering", {}, scene);
  const actor = CreateBox("crew", {}, scene);
  const lighting = createShipLighting(scene, root, [prop]);
  lighting.addActor([actor]);
  const door = scene.lights.find(
    (light) => light.name === "door-spill-engineering",
  )!;
  const bridge = scene.lights.find(
    (light) => light.name === "bridge-console-spill",
  )!;
  lighting.update(1, -3.1, -6);
  expect(door.canAffectMesh(actor)).toBe(true);
  expect(bridge.canAffectMesh(actor)).toBe(false);
  lighting.update(1, -3.1, -3.6);
  expect(door.canAffectMesh(actor)).toBe(false);
  lighting.update(1, 0, 6);
  expect(bridge.canAffectMesh(actor)).toBe(true);
  scene.dispose();
  engine.dispose();
});

test("missing room receivers never enable unrestricted spill onto native fixtures", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  const deck = CreateBox("GEO-deck", {}, scene);
  const native = CreateBox("native-equipment-bed", {}, scene);
  const lighting = createShipLighting(scene, root, [deck]);
  const accents = scene.lights.filter((light) =>
    light.name.startsWith("door-spill-"),
  );
  expect(accents.every((light) => !light.isEnabled())).toBe(true);
  const actor = CreateBox("crew", {}, scene);
  lighting.addActor([actor]);
  lighting.update(1, -3.1, -6);
  for (const mesh of [deck, native, actor])
    expect(
      scene.lights.filter(
        (light) => light.isEnabled() && light.canAffectMesh(mesh),
      ).length,
    ).toBeLessThanOrEqual(8);
  for (const accent of accents)
    expect(accent.isEnabled() && accent.canAffectMesh(native)).toBe(false);
  expect(
    accents
      .find((light) => light.name === "door-spill-engineering")!
      .isEnabled(),
  ).toBe(true);
  actor.dispose();
  lighting.update(0, 0, 0);
  expect(accents.every((light) => !light.isEnabled())).toBe(true);
  scene.dispose();
  engine.dispose();
});

test("appearance reloads remove disposed actors from every light and shadow list", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("ship", scene);
  const deck = CreateBox("GEO-deck", {}, scene);
  const lighting = createShipLighting(scene, root, [deck]);
  const retired: AbstractMesh[] = [];
  for (let i = 0; i < 6; i++) {
    const actor = CreateBox("crew-" + i, {}, scene);
    lighting.addActor([actor]);
    lighting.update(1, -3.1, -6);
    actor.dispose();
    retired.push(actor);
  }
  lighting.addActor([]);
  lighting.update(1, 0, 0);
  for (const light of scene.lights) {
    expect(
      light.includedOnlyMeshes.some((mesh) => retired.includes(mesh)),
    ).toBe(false);
    expect(light.excludedMeshes.some((mesh) => retired.includes(mesh))).toBe(
      false,
    );
    expect(
      light
        .getShadowGenerator()
        ?.getShadowMap()
        ?.renderList?.some((mesh) => retired.includes(mesh)) ?? false,
    ).toBe(false);
  }
  scene.dispose();
  engine.dispose();
});

test("cabin shadow depth stays room-scale even when observation camera planes are distant", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("far-observation", Vector3.Zero(), scene);
  camera.minZ = 20;
  camera.maxZ = 10000;
  const root = new TransformNode("ship", scene);
  const deck = CreateBox("GEO-deck", {}, scene);
  createShipLighting(scene, root, [deck]);
  const spots = scene.lights.filter(
    (light): light is SpotLight => light instanceof SpotLight,
  );
  expect(spots).toHaveLength(7);
  for (const light of spots) {
    expect(light.shadowMinZ).toBe(0.05);
    expect(light.shadowMaxZ).toBe(light.range);
    expect(light.getDepthMinZ(camera)).toBe(0.05);
    expect(light.getDepthMaxZ(camera)).toBe(light.range);
    expect((light.getShadowGenerator() as ShadowGenerator).getDarkness()).toBe(
      0,
    );
  }
  expect(
    (
      scene.lights
        .find((light) => light.name === "exterior-key")!
        .getShadowGenerator() as ShadowGenerator
    ).getDarkness(),
  ).toBe(0.1);
  scene.dispose();
  engine.dispose();
});

test("stationary receiver memberships do not resynchronize every scene mesh", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const meshes = ["deck", ...CABIN_ROOMS.map((r) => "room-" + r.id)].map(
    (name) => {
      const mesh = CreateBox("GEO-" + name, {}, scene);
      mesh.parent = root;
      mesh.material = new PBRMaterial(name, scene);
      return mesh;
    },
  );
  const actor = CreateBox("actor", {}, scene),
    lighting = createShipLighting(scene, root, meshes);
  lighting.addActor([actor]);
  lighting.update(1, 3, 3);
  let resyncs = 0;
  for (const light of scene.lights) {
    const instrumented = light as unknown as { _resyncMeshes: () => void };
    const original = instrumented._resyncMeshes.bind(light);
    instrumented._resyncMeshes = () => {
      resyncs++;
      original();
    };
  }
  for (let frame = 0; frame < 10; frame++) lighting.update(1, 3, 3);
  expect(resyncs, "ten unchanged Deck updates").toBe(0);
  lighting.update(1, -3, -3);
  expect(
    resyncs,
    "room transition must update actual receivers",
  ).toBeGreaterThan(0);
  resyncs = 0;
  lighting.update(1, -3, -3);
  expect(resyncs).toBe(0);
  actor.dispose();
  lighting.update(1, -3, -3);
  expect(
    scene.lights.every(
      (light) =>
        !light.includedOnlyMeshes.includes(actor) &&
        !light.excludedMeshes.includes(actor),
    ),
  ).toBe(true);
  resyncs = 0;
  lighting.update(1, -3, -3);
  expect(resyncs).toBe(0);
  scene.dispose();
  engine.dispose();
});

test("roof paint receives exterior light but never creates solid shadow casters", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const roof = CreateBox("GEO-roof-panel", {}, scene),
    paint = CreateBox("GEO-roof-hull-name", {}, scene);
  roof.metadata = { role: "roof", shadowStructural: true };
  roof.parent = root;
  paint.parent = root;
  paint.metadata = { hullDecal: true };
  paint.material = new PBRMaterial("paint", scene);
  const lighting = createShipLighting(scene, root, [roof, paint]);
  expect(lighting.primaryLight.canAffectMesh(paint)).toBe(true);
  expect(paint.receiveShadows).toBe(true);
  expect(
    scene.meshes.some((m) => m.name === "shadow-occluder-" + paint.name),
  ).toBe(false);
  expect(
    scene.meshes.some((m) => m.name === "shadow-occluder-" + roof.name),
  ).toBe(true);
  for (const light of scene.lights)
    expect(
      light.getShadowGenerator()?.getShadowMap()?.renderList ?? [],
    ).not.toContain(paint);
  scene.dispose();
  engine.dispose();
});
