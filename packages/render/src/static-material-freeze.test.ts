import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import type { Effect } from "@babylonjs/core/Materials/effect";
import {
  createStaticMaterialFreeze,
  invalidateStaticMaterials,
} from "./static-material-freeze";

test("hidden static banks avoid material preparation, with a live veto and first-visible binding", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const material = new StandardMaterial("shared", scene);
  const visible = CreateBox("visible", {}, scene),
    hidden = CreateBox("hidden-bank", {}, scene);
  for (const mesh of [visible, hidden]) {
    mesh.metadata = { role: "floor" };
    mesh.material = material;
    const defines = new MaterialDefines();
    defines.markAsProcessed();
    mesh.subMeshes[0].setEffect({ isReady: () => true } as Effect, defines);
  }
  hidden.setEnabled(false);
  const hiddenMaterial = vi.spyOn(hidden.subMeshes[0], "getMaterial");
  const owner = createStaticMaterialFreeze(scene);
  const before = () => scene.onBeforeRenderObservable.notifyObservers(scene);
  const tick = () => {
    before();
    scene.onAfterRenderObservable.notifyObservers(scene);
  };
  before();
  expect(hiddenMaterial).not.toHaveBeenCalled();
  scene.onAfterRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(true);
  // An exceptional hidden use remains a veto because it can mutate shared uniforms.
  hidden.metadata.mutableMaterial = true;
  before();
  expect(hiddenMaterial).toHaveBeenCalled();
  expect(material.isFrozen).toBe(false);
  delete hidden.metadata.mutableMaterial;
  hiddenMaterial.mockClear();
  tick();
  expect(material.isFrozen).toBe(true);
  hidden.setEnabled(true);
  hidden.metadata.mutableMaterial = true;
  before();
  expect(material.isFrozen).toBe(false);
  expect(hiddenMaterial).toHaveBeenCalled();
  owner.dispose();
  for (const mesh of [visible, hidden]) mesh.subMeshes[0].setEffect(null);
  scene.dispose();
  engine.dispose();
});

test("static sharing freezes only compiled uses and invalidates shader/scene changes before binding", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new StandardMaterial("authored", scene);
  const mesh = CreateBox("hull", {}, scene);
  mesh.metadata = { role: "hull", partId: "hull" };
  mesh.material = material;
  const sub = mesh.subMeshes[0],
    defines = new MaterialDefines();
  defines.markAsProcessed();
  let ready = false;
  sub.setEffect({ isReady: () => ready } as Effect, defines);
  const freeze = vi.spyOn(material, "freeze"),
    owner = createStaticMaterialFreeze(scene);
  const before = () => {
    owner.prepare();
    scene.onBeforeRenderObservable.notifyObservers(scene);
  };
  const after = () => scene.onAfterRenderObservable.notifyObservers(scene);
  before();
  after();
  expect(material.isFrozen).toBe(false);
  mesh.isVisible = false;
  before();
  after();
  expect(material.isFrozen).toBe(false);
  mesh.isVisible = true;
  ready = true;
  before();
  after();
  expect(material.isFrozen).toBe(true);
  before();
  after();
  expect(freeze).toHaveBeenCalledTimes(1);
  defines.markAsLightDirty();
  before();
  expect(material.isFrozen).toBe(false);
  defines.markAsProcessed();
  after();
  expect(material.isFrozen).toBe(false);
  before();
  after();
  expect(material.isFrozen).toBe(true);
  scene.environmentIntensity = 0.3;
  before();
  expect(material.isFrozen).toBe(false);
  after();
  invalidateStaticMaterials(scene);
  expect(material.isFrozen).toBe(false);
  before();
  after();
  expect(material.isFrozen).toBe(true);
  owner.dispose();
  expect(material.isFrozen).toBe(false);
  sub.setEffect(null);
  scene.dispose();
  engine.dispose();
});

test("any animated, mutable or unclassified shared use keeps the original material live", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new StandardMaterial("shared", scene);
  const meshes = [
    CreateBox("static", {}, scene),
    CreateBox("other", {}, scene),
  ];
  for (const mesh of meshes) {
    mesh.material = material;
    mesh.metadata = { role: "equipment", partId: mesh.name };
    const defines = new MaterialDefines();
    defines.markAsProcessed();
    mesh.subMeshes[0].setEffect({ isReady: () => true } as Effect, defines);
  }
  const owner = createStaticMaterialFreeze(scene);
  const tick = () => {
    owner.prepare();
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onAfterRenderObservable.notifyObservers(scene);
  };
  meshes[1].subMeshes[0].setEffect(null); // An uncompiled copy must not prevent static sharing.
  tick();
  expect(material.isFrozen).toBe(true);
  meshes[1].metadata.role = "proxy";
  meshes[1].metadata.staticMaterial = true;
  tick();
  expect(material.isFrozen).toBe(true);
  delete meshes[1].metadata.staticMaterial;
  tick();
  expect(material.isFrozen).toBe(false);
  meshes[1].metadata.role = "equipment";
  meshes[1].metadata.mutableMaterial = true;
  tick();
  expect(material.isFrozen).toBe(false);
  delete meshes[1].metadata.mutableMaterial;
  meshes[1].metadata.role = "crew";
  tick();
  expect(material.isFrozen).toBe(false);
  meshes[1].metadata.role = "equipment";
  material.metadata = { mutableMaterial: true };
  tick();
  expect(material.isFrozen).toBe(false);
  expect(meshes.every((mesh) => mesh.material === material)).toBe(true);
  owner.dispose();
  for (const mesh of meshes) mesh.subMeshes[0].setEffect(null);
  scene.dispose();
  engine.dispose();
});

test("instances use the source shader readiness even when the prototype is outside the scene mesh list", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new StandardMaterial("instanced", scene);
  const source = CreateBox("prototype", {}, scene);
  source.material = material;
  source.metadata = { role: "hull" };
  scene.removeMesh(source);
  const instance = source.createInstance("placed");
  instance.metadata = { role: "hull", partId: "placed" };
  const defines = new MaterialDefines();
  defines.markAsProcessed();
  source.subMeshes[0].setEffect({ isReady: () => true } as Effect, defines);
  const owner = createStaticMaterialFreeze(scene);
  owner.prepare();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  scene.onAfterRenderObservable.notifyObservers(scene);
  expect(instance.subMeshes[0].effect).toBeFalsy();
  expect(material.isFrozen).toBe(true);
  scene.lightsEnabled = false;
  // The engine does not visit a detached source's shader during this setter.
  expect(defines.isDirty).toBe(false);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(false);
  expect(defines.isDirty).toBe(true);
  expect(source.subMeshes[0]._drawWrapper._forceRebindOnNextCall).toBe(true);
  expect(instance.material).toBe(source.material);
  expect(instance.metadata.partId).toBe("placed");
  owner.dispose();
  source.subMeshes[0].setEffect(null);
  source.dispose();
  scene.dispose();
  engine.dispose();
});

test("shared compiled static material stays live across different receiver light bindings", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const material = new StandardMaterial("pooled", scene);
  material.maxSimultaneousLights = 1;
  const a = CreateBox("room-a", {}, scene),
    b = CreateBox("room-b", {}, scene);
  for (const mesh of [a, b]) {
    mesh.material = material;
    mesh.metadata = { role: "hull" };
    const defines = new MaterialDefines();
    defines.markAsProcessed();
    mesh.subMeshes[0].setEffect({ isReady: () => true } as Effect, defines);
  }
  const ownA = new PointLight("light-a", Vector3.Zero(), scene);
  const ownB = new PointLight("light-b", Vector3.Zero(), scene);
  ownA.includedOnlyMeshes = [a];
  ownB.includedOnlyMeshes = [b];
  const owner = createStaticMaterialFreeze(scene);
  const tick = () => {
    // NullEngine has no real shader compilation; model its completed frame.
    for (const mesh of [a, b]) {
      const defines = mesh.subMeshes[0]._drawWrapper.defines;
      if (defines && typeof defines !== "string") defines.markAsProcessed();
    }
    owner.prepare();
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onAfterRenderObservable.notifyObservers(scene);
  };
  tick();
  expect(material.isFrozen).toBe(false);
  // Sharing is safe again when the actual ordered contribution matches.
  ownA.includedOnlyMeshes = [a, b];
  ownB.setEnabled(false);
  a._resyncLightSources();
  b._resyncLightSources();
  tick();
  expect(material.isFrozen).toBe(true);
  ownB.setEnabled(true);
  ownB.includedOnlyMeshes = [b];
  ownA.includedOnlyMeshes = [a];
  a._resyncLightSources();
  b._resyncLightSources();
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(false);
  // A light change in a single shared use must also release the previous UBO.
  b.isVisible = false;
  tick();
  expect(material.isFrozen).toBe(true);
  a.lightSources.splice(0, a.lightSources.length, ownB);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(material.isFrozen).toBe(false);
  owner.dispose();
  for (const mesh of [a, b]) mesh.subMeshes[0].setEffect(null);
  scene.dispose();
  engine.dispose();
});
