import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { ThinTAAPostProcess } from "@babylonjs/core/PostProcesses/thinTAAPostProcess";
import { createAntialiasing } from "./antialiasing-pipeline";
import { bindPrefabDoorCameraHistory } from "./prefab-ship-presentation";

it("selects and resets cut geometry before the real AA observer, and commits only the primary camera", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("main", Vector3.Zero(), scene);
  const other = new FreeCamera("auxiliary", Vector3.Zero(), scene);
  scene.activeCamera = camera;
  Object.assign(engine.getCaps(), {
    texelFetch: true,
    drawBuffersExtension: true,
    textureHalfFloatRender: true,
    textureHalfFloatLinearFiltering: true,
  });
  vi.spyOn(PostProcess.prototype, "isReady").mockReturnValue(true);
  const calls: string[] = [];
  const doors = {
    prepareTemporal: vi.fn(() => calls.push("prepare")),
    commitTemporal: vi.fn(() => calls.push("commit")),
  };
  let changed = true;
  // Production installs the presentation observer BEFORE creating AA.
  const resetHistory = vi.fn(() => aa.resetHistory());
  const binding = bindPrefabDoorCameraHistory(
    scene,
    doors,
    () => {
      calls.push("select");
      const result = changed;
      changed = false;
      return result;
    },
    resetHistory,
  );
  const aa = createAntialiasing(scene, camera, {
    temporalResetIntegrated: true,
    storage: { getItem: () => '{"mode":"taa","samples":4}', setItem: () => {} },
  });
  const reset = vi.spyOn(ThinTAAPostProcess.prototype, "_reset");
  try {
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(camera);
    scene.onAfterCameraRenderObservable.notifyObservers(camera);
    reset.mockClear();
    resetHistory.mockClear();
    calls.length = 0;
    changed = true;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(camera);
    expect(calls).toEqual(["select", "prepare"]);
    expect(resetHistory).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    scene.activeCamera = other;
    scene.onBeforeCameraRenderObservable.notifyObservers(other);
    scene.onAfterCameraRenderObservable.notifyObservers(other);
    expect(calls).toEqual(["select", "prepare"]);
    scene.activeCamera = camera;
    scene.onAfterCameraRenderObservable.notifyObservers(camera);
    expect(calls).toEqual(["select", "prepare", "commit"]);
    calls.length = 0;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(camera);
    expect(resetHistory).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    binding.dispose();
    binding.dispose();
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onBeforeCameraRenderObservable.notifyObservers(camera);
    scene.onAfterCameraRenderObservable.notifyObservers(camera);
    expect(calls).toEqual(["select", "prepare"]);
  } finally {
    binding.dispose();
    aa.dispose();
    vi.restoreAllMocks();
    scene.dispose();
    engine.dispose();
  }
});
