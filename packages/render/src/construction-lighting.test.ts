import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createConstructionLighting } from "./construction-instance";

test("construction shadow depth covers full casters independently of camera zoom", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 5, -10), scene);
  scene.activeCamera = camera;
  const ship = new TransformNode("ship", scene);
  const hull = CreateBox("hull", { width: 24, height: 2, depth: 13 }, scene);
  hull.parent = ship;
  const lighting = createConstructionLighting(scene, [hull]);
  const sun = lighting.primaryLight;
  const actor = CreateBox("late-actor", { height: 3 }, scene);
  actor.position.set(10, 3, 6);
  actor.parent = ship;
  lighting.addActor([actor]);
  const renderList = sun.getShadowGenerator()!.getShadowMap()!.renderList!;
  const view = Matrix.LookAtLH(
    sun.position,
    sun.position.add(sun.direction),
    Vector3.Up(),
  );
  const project = () => {
    for (const mesh of renderList) mesh.computeWorldMatrix(true);
    const projection = Matrix.Identity();
    sun.setShadowProjectionMatrix(projection, view, renderList);
    for (const mesh of renderList)
      for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        const depth = Vector3.TransformCoordinates(corner, view).z;
        expect(depth).toBeGreaterThanOrEqual(sun.shadowMinZ! - 1e-6);
        expect(depth).toBeLessThanOrEqual(sun.shadowMaxZ! + 1e-6);
      }
    return [...projection.asArray()];
  };
  try {
    camera.minZ = 0.88;
    camera.maxZ = 1644;
    const first = project();
    camera.minZ = 0.1;
    camera.maxZ = 1604;
    expect(project()).toEqual(first);
    // The fitted range follows the complete ship and a later moving caster.
    ship.position.set(120, 15, -70);
    actor.position.y = 12;
    expect(project()).not.toEqual(first);
    expect(renderList).toContain(actor);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("hidden caster banks refresh before fitting, and glow proxies never cast primary shadows", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("camera", Vector3.Zero(), scene);
  const ship = new TransformNode("ship", scene);
  const deck = CreateBox("deck", { width: 24, depth: 13 }, scene);
  const roof = CreateBox("roof", { width: 24, height: 3, depth: 13 }, scene);
  for (const mesh of [deck, roof]) {
    mesh.parent = ship;
    mesh.computeWorldMatrix(true);
  }
  roof.setEnabled(false);
  const oldBounds = roof.getBoundingInfo().boundingBox.minimumWorld.clone();
  const proxy = CreateBox("offscreen-mask", { size: 1000 }, scene);
  proxy.metadata = { role: "proxy", glowOccluder: true };
  proxy.layerMask = 0;
  const lighting = createConstructionLighting(scene, [deck, roof, proxy]);
  const sun = lighting.primaryLight;
  const list = sun.getShadowGenerator()!.getShadowMap()!.renderList!;
  try {
    expect(list).not.toContain(proxy);
    ship.position.set(200, 50, -80);
    ship.rotation.y = Math.PI / 2;
    expect(roof.getBoundingInfo().boundingBox.minimumWorld).toEqual(oldBounds);
    // Exercise the owner's lifecycle, without a test-side forced matrix refresh.
    scene.onBeforeRenderObservable.notifyObservers(scene);
    expect(roof.getBoundingInfo().boundingBox.minimumWorld).not.toEqual(
      oldBounds,
    );
    const view = Matrix.LookAtLH(
      sun.position,
      sun.position.add(sun.direction),
      Vector3.Up(),
    );
    const projection = Matrix.Identity();
    sun.setShadowProjectionMatrix(projection, view, list);
    for (const mesh of [deck, roof])
      for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        const z = Vector3.TransformCoordinates(corner, view).z;
        expect(z).toBeGreaterThanOrEqual(sun.shadowMinZ! - 1e-6);
        expect(z).toBeLessThanOrEqual(sun.shadowMaxZ! + 1e-6);
      }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
