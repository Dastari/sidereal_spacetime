import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { cacheStaticTransforms } from "./static-transform-cache";

test("static batches skip idle updates but follow moving ship roots with correct bounds", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const ship = new TransformNode("ship", scene),
    deck = new TransformNode("deck", scene);
  deck.parent = ship;
  const mesh = CreateBox("batch", {}, scene);
  mesh.parent = deck;
  mesh.position.x = 3;
  mesh.metadata = {
    role: "hull",
    trianglePlacements: [{ start: 0, count: 12, placementId: "a" }],
  };
  const update = vi.spyOn(mesh, "freezeWorldMatrix");
  const cache = cacheStaticTransforms(deck, [mesh]);
  expect(mesh.isWorldMatrixFrozen).toBe(true);
  for (let i = 0; i < 10; i++) cache.refresh();
  expect(update).toHaveBeenCalledTimes(1);
  ship.position.set(10, 2, -5);
  ship.rotation.y = 0.7;
  ship.scaling.set(2, 1, 0.5);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  const expected = Vector3.TransformCoordinates(
    new Vector3(3, 0, 0),
    deck.getWorldMatrix(),
  );
  expect(Vector3.Distance(mesh.getAbsolutePosition(), expected)).toBeLessThan(
    1e-5,
  );
  expect(
    Vector3.Distance(mesh.getBoundingInfo().boundingBox.centerWorld, expected),
  ).toBeLessThan(1e-5);
  expect(update).toHaveBeenCalledTimes(2);
  deck.setEnabled(false);
  expect(mesh.isEnabled()).toBe(false);
  deck.setEnabled(true);
  mesh.visibility = 0.4;
  cache.refresh();
  expect(mesh.visibility).toBe(0.4);
  expect(mesh.metadata.trianglePlacements[0].placementId).toBe("a");
  cache.dispose();
  expect(mesh.isWorldMatrixFrozen).toBe(false);
  expect(mesh.doNotSyncBoundingInfo).toBe(false);
  scene.dispose();
  engine.dispose();
});

test("static sphere culling is conservative under root movement and restores the original strategy", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const camera = new FreeCamera("camera", new Vector3(0, 0, -20), scene);
  camera.setTarget(Vector3.Zero());
  camera.minZ = 0.1;
  camera.maxZ = 100;
  camera.getViewMatrix(true);
  camera.getProjectionMatrix(true);
  const planes = Frustum.GetPlanes(camera.getTransformationMatrix());
  const mesh = CreateBox(
    "long-hull",
    { width: 12, height: 1, depth: 1 },
    scene,
  );
  mesh.metadata = { role: "hull", partId: "hull" };
  mesh.parent = root;
  mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_OPTIMISTIC_INCLUSION;
  const cache = cacheStaticTransforms(root, [mesh]);
  const bounds = mesh.getBoundingInfo(),
    boxTest = vi.spyOn(bounds.boundingBox, "isInFrustum");
  let rejected = 0;
  for (const x of [-200, -30, -10, 0, 10, 30, 200]) {
    root.position.x = x;
    root.rotation.y = x * 0.03;
    cache.refresh();
    const standard = bounds.isInFrustum(
      planes,
      AbstractMesh.CULLINGSTRATEGY_STANDARD,
    );
    boxTest.mockClear();
    const admitted = mesh.isInFrustum(planes);
    if (standard) expect(admitted).toBe(true);
    if (!admitted) rejected++;
    expect(boxTest).not.toHaveBeenCalled();
    expect(bounds.boundingBox.centerWorld.x).toBeCloseTo(x);
  }
  expect(rejected).toBeGreaterThan(0);
  expect(mesh.metadata.partId).toBe("hull");
  cache.dispose();
  expect(mesh.cullingStrategy).toBe(
    AbstractMesh.CULLINGSTRATEGY_OPTIMISTIC_INCLUSION,
  );
  scene.dispose();
  engine.dispose();
});
