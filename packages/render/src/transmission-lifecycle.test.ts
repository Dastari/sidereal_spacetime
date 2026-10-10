import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransmissionHelper } from "@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper";
import { PBRMaterialLoadingAdapter } from "@babylonjs/loaders/glTF/2.0/pbrMaterialLoadingAdapter";
import { maintainSceneTransmission } from "./transmission-lifecycle";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";

test("real RTT readiness notifications cannot recurse into readiness in motion mode", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new ArcRotateCamera("camera", 1, 1, 20, Vector3.Zero(), scene);
  const helper = new TransmissionHelper({}, scene),
    target = helper.getOpaqueTarget()! as RenderTargetTexture;
  target.renderList = [];
  const guard = maintainSceneTransmission(scene, () => ({
    captureOnMotion: true,
    captureGlobalsOnly: false,
  }));
  guard.repair();
  expect(target._shouldRender()).toBe(true);
  expect(target.isReadyForRendering()).toBe(true);
  expect(() => target.render()).not.toThrow();
  expect(target._shouldRender()).toBe(false);
  guard.dispose();
  scene.dispose();
  engine.dispose();
});

test("global-only capture uses separate buffers and restores lights, shadows and prior pass material", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const helper = new TransmissionHelper({}, scene),
    target = helper.getOpaqueTarget()! as RenderTargetTexture;
  const mesh = CreateBox("receiver", {}, scene);
  const material = new PBRMaterial("main", scene);
  mesh.material = material;
  mesh.receiveShadows = true;
  const global = new HemisphericLight("global", Vector3.Up(), scene);
  const local = new PointLight("local", Vector3.Zero(), scene);
  const prior = new PBRMaterial("previous-pass-owner", scene);
  mesh.setMaterialForRenderPass(target.renderPassId, prior);
  target.renderList = [mesh];
  const flags = { captureOnMotion: false, captureGlobalsOnly: false };
  const guard = maintainSceneTransmission(
    scene,
    () => flags,
    () => [global],
  );
  guard.repair();
  const originalLights = mesh.lightSources;
  flags.captureGlobalsOnly = true;
  target.onBeforeBindObservable.notifyObservers(target);
  const clone = mesh.getMaterialForRenderPass(
    target.renderPassId,
  )! as PBRMaterial;
  expect(clone).not.toBe(material);
  expect(clone.maxSimultaneousLights).toBe(3);
  expect(mesh.lightSources.map((light) => light.name)).toEqual(["global"]);
  expect(mesh.receiveShadows).toBe(false);
  expect(mesh.material).toBe(material);
  target.onAfterUnbindObservable.notifyObservers(target);
  expect(mesh.lightSources).toBe(originalLights);
  expect(mesh.lightSources.map((light) => light.name)).toEqual([
    "global",
    "local",
  ]);
  expect(mesh.receiveShadows).toBe(true);
  expect(global.isEnabled()).toBe(true);
  expect(local.isEnabled()).toBe(true);
  flags.captureGlobalsOnly = false;
  target.onBeforeBindObservable.notifyObservers(target);
  target.onAfterUnbindObservable.notifyObservers(target);
  expect(mesh.getMaterialForRenderPass(target.renderPassId)).toBe(prior);
  guard.dispose();
  scene.dispose();
  engine.dispose();
});

test("capture exceptions restore receiver state before another pass can run", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const helper = new TransmissionHelper({}, scene),
    target = helper.getOpaqueTarget()! as RenderTargetTexture;
  const mesh = CreateBox("receiver", {}, scene);
  mesh.material = new PBRMaterial("main", scene);
  mesh.receiveShadows = true;
  const global = new HemisphericLight("global", Vector3.Up(), scene);
  new PointLight("local", Vector3.Zero(), scene);
  target.renderList = [mesh];
  const originalLights = mesh.lightSources.slice();
  target.render = () => {
    target.onBeforeBindObservable.notifyObservers(target);
    expect(mesh.receiveShadows).toBe(false);
    throw new Error("capture failed");
  };
  const guard = maintainSceneTransmission(
    scene,
    () => ({ captureGlobalsOnly: true, captureOnMotion: false }),
    () => [global],
  );
  guard.repair();
  expect(() => target.render()).toThrow("capture failed");
  expect(mesh.receiveShadows).toBe(true);
  expect(mesh.lightSources.map((light) => light.uniqueId)).toEqual(
    originalLights.map((light) => light.uniqueId),
  );
  guard.dispose();
  scene.dispose();
  engine.dispose();
});

test("motion experiment wakes on camera, crew/door transforms and content; default/off retains stock cadence", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new ArcRotateCamera("camera", 1, 1, 20, Vector3.Zero(), scene);
  const helper = new TransmissionHelper({}, scene),
    target = helper.getOpaqueTarget()! as RenderTargetTexture;
  const crew = new TransformNode("crew", scene),
    door = CreateBox("door", {}, scene);
  door.parent = crew;
  target.renderList = [door];
  const flags = { captureOnMotion: false, captureGlobalsOnly: false };
  const original = target._shouldRender;
  vi.spyOn(target, "isReadyForRendering").mockReturnValue(true);
  target.render = () => {
    target.onBeforeBindObservable.notifyObservers(target);
    target.onAfterUnbindObservable.notifyObservers(target);
  };
  const guard = maintainSceneTransmission(scene, () => flags);
  guard.repair();
  const captured = () => target.render();
  expect(target._shouldRender()).toBe(true);
  expect(target._shouldRender()).toBe(true);
  flags.captureOnMotion = true;
  expect(target._shouldRender()).toBe(true);
  captured();
  expect(target._shouldRender()).toBe(false);
  camera.alpha += 0.1;
  expect(target._shouldRender()).toBe(true);
  captured();
  expect(target._shouldRender()).toBe(false);
  crew.position.x += 1;
  scene.incrementRenderId();
  expect(target._shouldRender()).toBe(true);
  captured();
  expect(target._shouldRender()).toBe(false);
  door.position.z += 1;
  scene.incrementRenderId();
  expect(target._shouldRender()).toBe(true);
  captured();
  expect(target._shouldRender()).toBe(false);
  door.isVisible = false;
  expect(target._shouldRender()).toBe(true);
  captured();
  flags.captureOnMotion = false;
  expect(target._shouldRender()).toBe(true);
  expect(target._shouldRender()).toBe(true);
  guard.dispose();
  expect(target._shouldRender).toBe(original);
  scene.dispose();
  engine.dispose();
});

test("repairs a disposed shared refraction target and preserves transmission materials", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.setTransformMatrix(Matrix.Identity(), Matrix.Identity());
  const material = new PBRMaterial("visor", scene);
  material.subSurface.isRefractionEnabled = true;
  material.subSurface.refractionIntensity = 0.45;
  const mesh = CreateBox("visor", {}, scene);
  mesh.material = material;
  const helper = new TransmissionHelper({}, scene);
  helper.addMaterialImpl({
    materialClass: PBRMaterial,
    adapterClass: PBRMaterialLoadingAdapter,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const guard = maintainSceneTransmission(scene),
    first = helper.getOpaqueTarget()! as RenderTargetTexture;
  expect(material.subSurface.refractionTexture).toBe(first);
  first.dispose();
  expect(first.getRefractionTextureMatrix()).toBeNull();
  guard.repair();
  const second = helper.getOpaqueTarget()! as RenderTargetTexture;
  expect(second).not.toBe(first);
  expect(second.getInternalTexture()).not.toBeNull();
  expect(material.subSurface.refractionTexture).toBe(second);
  expect(material.subSurface.isRefractionEnabled).toBe(true);
  expect(material.subSurface.refractionIntensity).toBe(0.45);
  expect(second.getRefractionTextureMatrix()).not.toBeNull();
  guard.repair();
  expect(guard.repairs).toBe(1);
  guard.dispose();
  second.dispose();
  guard.repair();
  expect(guard.repairs).toBe(1);
  scene.dispose();
  engine.dispose();
});

test("attaches only to helper-owned targets, restores earlier callbacks across recreation, and disposes idempotently", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.setTransformMatrix(Matrix.Identity(), Matrix.Identity());
  const guard = maintainSceneTransmission(scene);
  guard.repair();
  const helper = new TransmissionHelper({}, scene),
    first = helper.getOpaqueTarget()! as RenderTargetTexture;
  const previous = () => [];
  first.getCustomRenderList = previous;
  const list = first.renderList,
    mask = first.forceLayerMaskCheck,
    size = first.getSize(),
    samples = first.samples;
  guard.repair();
  const filter = first.getCustomRenderList;
  expect(filter).not.toBe(previous);
  guard.repair();
  expect(first.getCustomRenderList).toBe(filter);
  expect(first.renderList).toBe(list);
  expect(first.forceLayerMaskCheck).toBe(mask);
  expect(first.getSize()).toEqual(size);
  expect(first.samples).toBe(samples);
  first.dispose();
  guard.repair();
  const second = helper.getOpaqueTarget()! as RenderTargetTexture;
  expect(first.getCustomRenderList).toBe(previous);
  expect(second.getCustomRenderList).not.toBeNull();
  guard.dispose();
  guard.dispose();
  expect(second.getCustomRenderList).toBeNull();
  scene.dispose();
  engine.dispose();
});

test("does not overwrite another callback owner and releases its observer on scene disposal", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.setTransformMatrix(Matrix.Identity(), Matrix.Identity());
  const helper = new TransmissionHelper({}, scene),
    target = helper.getOpaqueTarget()! as RenderTargetTexture;
  const earlier = () => [],
    later = () => [];
  target.getCustomRenderList = earlier;
  const guard = maintainSceneTransmission(scene);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(target.getCustomRenderList).not.toBe(earlier);
  target.getCustomRenderList = later;
  guard.dispose();
  expect(target.getCustomRenderList).toBe(later);
  const next = maintainSceneTransmission(scene);
  next.repair();
  expect(target.getCustomRenderList).not.toBe(later);
  scene.dispose();
  expect(target.getCustomRenderList).toBe(later);
  next.dispose();
  engine.dispose();
});

test("captures at the scene's own environment intensity until the guard is released", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.setTransformMatrix(Matrix.Identity(), Matrix.Identity());
  scene.environmentIntensity = 0.28;
  const helper = new TransmissionHelper({}, scene),
    target = helper.getOpaqueTarget()! as RenderTargetTexture;
  const capture = () => {
    target.onBeforeBindObservable.notifyObservers(target);
    const during = scene.environmentIntensity;
    target.onAfterUnbindObservable.notifyObservers(target);
    return [during, scene.environmentIntensity];
  };
  // Stock Babylon 9.25: the shared material buffers see intensity 1.
  expect(capture()).toEqual([1, 0.28]);
  const guard = maintainSceneTransmission(scene);
  guard.repair();
  expect(capture()).toEqual([0.28, 0.28]);
  scene.environmentIntensity = 0;
  expect(capture()).toEqual([0, 0]);
  guard.repair();
  expect(capture()).toEqual([0, 0]);
  guard.dispose();
  scene.environmentIntensity = 0.28;
  expect(capture()).toEqual([1, 0.28]);
  scene.dispose();
  engine.dispose();
});
