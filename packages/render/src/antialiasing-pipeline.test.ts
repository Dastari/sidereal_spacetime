import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { PassPostProcess } from "@babylonjs/core/PostProcesses/passPostProcess";
import { createAntialiasing } from "./antialiasing-pipeline";
import { ANTIALIASING_STORAGE_KEY } from "./antialiasing-settings";
afterEach(() => vi.restoreAllMocks());
it("warms before attachment, owns true first-target samples, tracks external passes and disposes only owned resources", () => {
  const engine = new NullEngine();
  engine.getCaps().maxMSAASamples = 4;
  const scene = new Scene(engine),
    camera = new FreeCamera("camera", Vector3.Zero(), scene);
  scene.activeCamera = camera;
  const display = new PassPostProcess("display", 1, camera),
    selection = new PassPostProcess("selection", 1, null, undefined, engine);
  const data = new Map<string, string>();
  const aa = createAntialiasing(scene, camera, {
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
    },
  });
  const ready = vi
    .spyOn(PostProcess.prototype, "isReady")
    .mockReturnValue(false);
  const tick = () => scene.onBeforeRenderObservable.notifyObservers(scene);
  tick();
  expect(camera._postProcesses.filter(Boolean)).toEqual([display]);
  expect(aa.snapshot().pending).toBe(true);
  ready.mockReturnValue(true);
  tick();
  expect(camera._postProcesses.filter(Boolean)[0]?.name).toBe(
    "sidereal-aa-scene",
  );
  expect(camera._postProcesses.filter(Boolean)[0]?.samples).toBe(4);
  aa.set({ mode: "msaa-fxaa" });
  tick();
  camera.attachPostProcess(selection);
  scene.onBeforeCameraRenderObservable.notifyObservers(camera);
  expect(camera._postProcesses.filter(Boolean).map((p) => p!.name)).toEqual([
    "sidereal-aa-scene",
    "display",
    "selection",
    "sidereal-aa-fxaa",
  ]);
  aa.set({ mode: "off" });
  tick();
  expect(camera._postProcesses.filter(Boolean)[0]?.samples).toBe(1);
  expect(aa.snapshot().effective.mode).toBe("off");
  expect(JSON.parse(data.get(ANTIALIASING_STORAGE_KEY)!)).toEqual({
    mode: "off",
    samples: 4,
  });
  aa.dispose();
  aa.dispose();
  expect(camera._postProcesses.filter(Boolean)).toEqual([display, selection]);
  scene.dispose();
  engine.dispose();
});
it("restores device preference and falls back honestly when temporal integration is absent", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    camera = new FreeCamera("camera", Vector3.Zero(), scene);
  scene.activeCamera = camera;
  vi.spyOn(PostProcess.prototype, "isReady").mockReturnValue(true);
  const aa = createAntialiasing(scene, camera, {
    storage: {
      getItem: () => '{"mode":"taa","samples":8}',
      setItem: () => {
        throw new Error("storage denied");
      },
    },
  });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(aa.snapshot()).toMatchObject({
    requested: { mode: "taa", samples: 8 },
    effective: { mode: "fxaa", reason: expect.any(String) },
    pending: false,
  });
  expect(() => aa.reset()).not.toThrow();
  aa.dispose();
  scene.dispose();
  engine.dispose();
});
it("unready replacement does not detach a working pass and reports bounded warmup failure", () => {
  const engine = new NullEngine();
  engine.getCaps().maxMSAASamples = 4;
  const scene = new Scene(engine),
    camera = new FreeCamera("camera", Vector3.Zero(), scene);
  scene.activeCamera = camera;
  const ready = vi
    .spyOn(PostProcess.prototype, "isReady")
    .mockReturnValue(true);
  const aa = createAntialiasing(scene, camera, {
    storage: { getItem: () => null, setItem: () => {} },
  });
  scene.onBeforeRenderObservable.notifyObservers(scene);
  const first = camera._postProcesses.find(Boolean);
  ready.mockReturnValue(false);
  aa.set({ mode: "fxaa" });
  for (let i = 0; i < 301; i++)
    scene.onBeforeRenderObservable.notifyObservers(scene);
  expect(camera._postProcesses.find(Boolean)).toBe(first);
  expect(aa.snapshot()).toMatchObject({
    pending: false,
    effective: { mode: "msaa" },
    error: expect.any(String),
  });
  aa.dispose();
  scene.dispose();
  engine.dispose();
});
it("resets temporal history and releases its material jitter owner across repeat toggles", async () => {
  const { StandardMaterial } =
    await import("@babylonjs/core/Materials/standardMaterial");
  const engine = new NullEngine(),
    scene = new Scene(engine),
    camera = new FreeCamera("camera", Vector3.Zero(), scene);
  scene.activeCamera = camera;
  Object.assign(engine.getCaps(), {
    texelFetch: true,
    drawBuffersExtension: true,
    textureHalfFloatRender: true,
    textureHalfFloatLinearFiltering: true,
  });
  const material = new StandardMaterial("subject", scene);
  vi.spyOn(PostProcess.prototype, "isReady").mockReturnValue(true);
  const aa = createAntialiasing(scene, camera, {
    temporalResetIntegrated: true,
    storage: { getItem: () => '{"mode":"taa","samples":4}', setItem: () => {} },
  });
  const tick = () => scene.onBeforeRenderObservable.notifyObservers(scene);
  for (let i = 0; i < 3; i++) {
    aa.set({ mode: "taa" });
    tick();
    expect(aa.snapshot().effective.mode).toBe("taa");
    const plugin = material.pluginManager!.getPlugin(
      "TAAJitter",
    ) as unknown as { isEnabled: boolean; manager: unknown };
    expect(plugin.isEnabled).toBe(true);
    aa.resetHistory();
    expect(camera._postProcesses.length).toBeLessThanOrEqual(4);
    expect(camera._postProcesses.filter(Boolean).map((p) => p!.name)).toEqual([
      "TAA",
      "TAAPass",
    ]);
    aa.set({ mode: "off" });
    tick();
    expect(plugin.isEnabled).toBe(false);
    expect(plugin.manager).toBeNull();
  }
  aa.dispose();
  scene.dispose();
  engine.dispose();
});
