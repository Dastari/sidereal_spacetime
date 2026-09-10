import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PassPostProcess } from "@babylonjs/core/PostProcesses/passPostProcess";
import { readSceneCapture } from "./capture-diagnostics";
import { createRenderDiagnostics } from "./diagnostics";
import { PrePassRenderer } from "@babylonjs/core/Rendering/prePassRenderer";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";

test("capture diagnostics distinguish allocation from requested samples and follow forced targets", () => {
  const engine = new NullEngine({renderWidth:800,renderHeight:600,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:4});
  const scene = new Scene(engine), camera = new FreeCamera("camera", Vector3.Zero(), scene);
  expect(readSceneCapture(scene)).toBeUndefined();
  const pass = new PassPostProcess("capture", 0.5, camera);
  pass.samples = 4;
  expect(readSceneCapture(scene)).toEqual({name:"capture"});
  pass.activate(camera);
  expect(readSceneCapture(scene)).toEqual({name:"capture",width:400,height:300,samples:pass.inputTexture.samples});
  const forced = engine.createRenderTargetTexture({width:321,height:123}, false);
  pass.inputTexture = forced;
  expect(readSceneCapture(scene)).toEqual({name:"capture",width:321,height:123,samples:forced.samples});
  const diagnostics = createRenderDiagnostics(scene);
  diagnostics.read(true);
  scene.onAfterRenderObservable.notifyObservers(scene);
  expect(diagnostics.read(true)?.sceneCapture).toEqual(readSceneCapture(scene));
  diagnostics.dispose(); pass.restoreDefaultInputTexture(); forced.dispose();
  pass.dispose();
  expect(readSceneCapture(scene)).toBeUndefined();
  scene.dispose(); engine.dispose();
});

test("an enabled prepass reports the geometry capture instead of the resolve pass", () => {
  const engine = new NullEngine();
  engine.getCaps().drawBuffersExtension = true;
  const scene = new Scene(engine), camera = new FreeCamera("camera", Vector3.Zero(), scene);
  const resolve = new PassPostProcess("resolve", 0.5, camera);
  resolve.activate(camera);
  const prepass = new PrePassRenderer(scene);
  scene.prePassRenderer = prepass;
  (prepass as unknown as {_enabled:boolean})._enabled = true;
  prepass.defaultRT.enabled = true;
  const target = prepass.getRenderTarget();
  expect(readSceneCapture(scene)?.name).toBe(target.name);
  expect(readSceneCapture(scene)?.width).toBe(target.renderTarget?.width);
  expect(readSceneCapture(scene)?.samples).toBe(target.renderTarget?.samples);
  scene.dispose(); engine.dispose();
});
