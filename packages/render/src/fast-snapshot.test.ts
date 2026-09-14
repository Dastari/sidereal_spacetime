import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createFastSnapshot } from "./fast-snapshot";
import { createSnapshotRevision } from "./snapshot-revision";
import { createFlightActiveSet } from "./flight-active-set";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MorphTarget } from "@babylonjs/core/Morph/morphTarget";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";

test("snapshot admission resets on draw membership changes and excludes animated or temporal frames", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const ready = vi.spyOn(scene, "isReady").mockReturnValue(false);
  scene.activeCamera = new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  const mesh = CreateBox("box", {}, scene);
  mesh.metadata = { role: "equipment", partId: "part" };
  const driver = {
    enableSnapshotRendering: vi.fn(),
    disableSnapshotRendering: vi.fn(),
    updateMesh: vi.fn(),
    updateMeshesForEffectLayer: vi.fn(),
    dispose: vi.fn(),
  };
  const snapshot = createFastSnapshot(scene, () => driver);
  const frame = {
    ready: true,
    reducedMotion: true,
    temporal: false,
    displayRevision: 0,
  };
  const tick = () => {
    snapshot.prepare(frame);
    scene.onBeforeRenderObservable.notifyObservers(scene);
  };
  tick();
  tick();
  tick();
  expect(snapshot.snapshot().armed).toBe(false);
  ready.mockReturnValue(true);
  tick();
  expect(snapshot.snapshot().armed).toBe(true);
  scene.getActiveMeshes().push(mesh);
  vi.spyOn(scene, "getActiveIndices").mockReturnValue(36);
  scene.onAfterRenderObservable.notifyObservers(scene);
  Object.defineProperty(engine, "snapshotRendering", {
    value: true,
    writable: true,
  });
  Object.defineProperty(engine, "snapshotRenderingMode", {
    value: 1,
    writable: true,
  });
  Object.defineProperty(engine, "_snapshotRendering", {
    value: {
      play: true,
      _allBundleLists: [{ numDrawCalls: 2 }, { numDrawCalls: 3 }],
    },
  });
  scene.getActiveMeshes().reset();
  expect(snapshot.activeStats()).toMatchObject({
    drawCalls: 5,
    activeMeshes: 1,
    activeIndices: 36,
    meshesByRole: { equipment: { active: 1 } },
  });
  tick();
  expect(driver.enableSnapshotRendering).toHaveBeenCalledTimes(1);
  mesh.isVisible = false;
  tick();
  expect(snapshot.snapshot().armed).toBe(false);
  expect(snapshot.activeStats()).toBeUndefined();
  expect(driver.disableSnapshotRendering).toHaveBeenCalledTimes(1);
  tick();
  tick();
  expect(snapshot.snapshot().armed).toBe(true);
  frame.temporal = true;
  tick();
  expect(snapshot.snapshot()).toMatchObject({
    armed: false,
    reason: "Temporal AA",
  });
  frame.temporal = false;
  frame.reducedMotion = false;
  tick();
  expect(snapshot.snapshot().reason).toBe("Animated environment");
  snapshot.dispose();
  expect(driver.dispose).toHaveBeenCalledOnce();
  scene.dispose();
  engine.dispose();
});

test("snapshot revisions observe transforms, material state, geometry edits and external draw revisions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  scene.activeCamera = camera;
  const mesh = CreateBox("box", { updatable: true }, scene);
  mesh.metadata = { role: "equipment", partId: "part" };
  const material = new StandardMaterial("material", scene);
  mesh.material = material;
  const revision = createSnapshotRevision();
  let previous = revision.capture(scene, 0);
  expect(revision.capture(scene, 0)).toBe(previous);
  for (const mutate of [
    () => {
      mesh.position.x++;
    },
    () => {
      material.alpha = 0.5;
    },
    () => {
      camera.position.x++;
    },
    () => {
      mesh.metadata.snapshotRevision = 1;
    },
    () => {
      mesh.setEnabled(false);
    },
    () => {
      mesh.setEnabled(true);
    },
    () => {
      mesh.updateVerticesData("position", mesh.getVerticesData("position")!);
    },
  ]) {
    mutate();
    scene.incrementRenderId();
    const next = revision.capture(scene, 0);
    expect(next).toBeGreaterThan(previous);
    previous = next;
    expect(revision.capture(scene, 0)).toBe(previous);
  }
  expect(revision.capture(scene, 1)).toBeGreaterThan(previous);
  const light = new DirectionalLight("sun", Vector3.Down(), scene),
    shadow = new ShadowGenerator(64, light);
  const map = shadow.getShadowMap()!;
  map.refreshRate = 0;
  map._shouldRender();
  previous = revision.capture(scene, 1);
  map._shouldRender();
  expect(revision.capture(scene, 1)).toBe(previous);
  map.resetRefreshCounter();
  expect(revision.capture(scene, 1)).toBeGreaterThan(previous);
  const multi = new MultiMaterial("authored-surfaces", scene);
  multi.subMaterials = [material];
  mesh.material = multi;
  previous = revision.capture(scene, 1);
  material.alpha = 0.8;
  expect(revision.capture(scene, 1)).toBeGreaterThan(previous);
  const callback = mesh.geometry!.onGeometryUpdated;
  revision.dispose();
  expect(mesh.geometry!.onGeometryUpdated).not.toBe(callback);
  scene.dispose();
  engine.dispose();
});

test("snapshot and Flight caches hand off geometry ownership and invalidate edits before replay", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  const mesh = CreateBox("part", { updatable: true }, scene);
  mesh.metadata = { role: "hull", partId: "part" };
  const original = mesh.geometry!.onGeometryUpdated;
  vi.spyOn(scene, "isReady").mockReturnValue(true);
  vi.spyOn(scene, "freezeActiveMeshes").mockImplementation((_skip, success) => {
    success?.();
    return scene;
  });
  const driver = {
    enableSnapshotRendering: vi.fn(),
    disableSnapshotRendering: vi.fn(),
    updateMesh: vi.fn(),
    updateMeshesForEffectLayer: vi.fn(),
    dispose: vi.fn(),
  };
  const snapshot = createFastSnapshot(scene, () => driver),
    flight = createFlightActiveSet(scene);
  const frame = {
    ready: true,
    reducedMotion: false,
    temporal: false,
    displayRevision: 0,
  };
  const tick = () => {
    const candidate = snapshot.prepare(frame);
    flight.prepare(!candidate);
    scene.onBeforeRenderObservable.notifyObservers(scene);
  };
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < 5; i++) tick();
    expect(flight.snapshot().frozen).toBe(true);
    frame.reducedMotion = true;
    for (let i = 0; i < 4; i++) tick();
    expect(snapshot.snapshot().armed).toBe(true);
    expect(flight.snapshot().frozen).toBe(false);
    mesh.updateVerticesData("position", mesh.getVerticesData("position")!);
    expect(snapshot.snapshot().armed).toBe(false);
    expect(driver.disableSnapshotRendering).toHaveBeenCalled();
    for (let i = 0; i < 4; i++) tick();
    expect(snapshot.snapshot().armed).toBe(true);
    snapshot.invalidate();
    expect(snapshot.snapshot().armed).toBe(false);
    frame.reducedMotion = false;
  }
  snapshot.prepare(frame);
  flight.prepare(false);
  expect(mesh.geometry!.onGeometryUpdated).toBe(original);
  snapshot.dispose();
  flight.dispose();
  scene.dispose();
  engine.dispose();
});

test("the real snapshot helper preserves hidden morph configuration and instance culling flags", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 0, -5), scene);
  Object.defineProperty(engine, "isWebGPU", { value: true });
  vi.spyOn(scene, "isReady").mockReturnValue(true);
  const source = CreateBox("prototype", {}, scene);
  source.metadata = { role: "hull", partId: "prototype" };
  source.isVisible = false;
  const instance = Object.assign(source.createInstance("placement"), {
    ignoreCameraMaxZ: true,
  });
  instance.metadata = { role: "hull", partId: "placement" };
  const unflagged = source.createInstance("unflagged");
  unflagged.metadata = { role: "hull", partId: "unflagged" };
  instance.ignoreCameraMaxZ = true;
  const variant = CreateBox("hidden-variant", {}, scene);
  variant.metadata = { role: "crew", partId: "variant" };
  variant.setEnabled(false);
  variant.ignoreCameraMaxZ = true;
  const manager = new MorphTargetManager(scene),
    target = new MorphTarget("pose", 0, scene);
  target.setPositions(variant.getVerticesData("position")!);
  manager.addTarget(target);
  variant.morphTargetManager = manager;
  const influences = manager.numMaxInfluencers,
    owner = createFastSnapshot(scene);
  for (let i = 0; i < 4; i++) {
    owner.prepare({
      ready: true,
      reducedMotion: true,
      temporal: false,
      displayRevision: 0,
    });
    scene.onBeforeRenderObservable.notifyObservers(scene);
  }
  expect(owner.snapshot().armed).toBe(true);
  expect(manager.numMaxInfluencers).toBe(influences);
  expect(variant.ignoreCameraMaxZ).toBe(true);
  expect(instance.ignoreCameraMaxZ).toBe(true);
  expect(Object.hasOwn(unflagged, "ignoreCameraMaxZ")).toBe(false);
  source.ignoreCameraMaxZ = true;
  expect(
    owner.prepare({
      ready: true,
      reducedMotion: true,
      temporal: false,
      displayRevision: 0,
    }),
  ).toBe(false);
  expect(owner.snapshot()).toMatchObject({
    armed: false,
    reason: "Per-mesh far-plane override",
  });
  owner.dispose();
  scene.dispose();
  engine.dispose();
});
