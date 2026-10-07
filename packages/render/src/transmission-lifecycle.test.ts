import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { TransmissionHelper } from "@babylonjs/loaders/glTF/2.0/Extensions/transmissionHelper";
import { PBRMaterialLoadingAdapter } from "@babylonjs/loaders/glTF/2.0/pbrMaterialLoadingAdapter";
import { maintainSceneTransmission } from "./transmission-lifecycle";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";

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
