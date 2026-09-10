import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Material } from "@babylonjs/core/Materials/material";
import type { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { PassPostProcess } from "@babylonjs/core/PostProcesses/passPostProcess";
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { TAARenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/taaRenderingPipeline";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  ANTIALIASING_DEFAULTS,
  ANTIALIASING_STORAGE_KEY,
  antialiasingPassOrder,
  normalizeAntialiasing,
  resolveAntialiasing,
  type AntialiasingPlan,
  type AntialiasingSettings,
  type AntialiasingSnapshot,
} from "./antialiasing-settings";

type Store = Pick<Storage, "getItem" | "setItem">;
interface Bundle {
  first: PostProcess[];
  last: PostProcess[];
  plan: AntialiasingPlan;
  taa?: TAARenderingPipeline;
  dispose(): void;
}
/** Babylon9.25's public pipeline dispose omits its effect wrapper/material plugins. */
function disposeTemporal(pipeline: TAARenderingPipeline) {
  pipeline.isEnabled = false;
  const wrapper = (
    pipeline as unknown as { _taaThinPostProcess: { dispose(): void } }
  )._taaThinPostProcess;
  pipeline.dispose();
  wrapper.dispose();
}
export function createAntialiasing(
  scene: Scene,
  camera: Camera,
  options: { storage?: Store; temporalResetIntegrated?: boolean } = {},
) {
  const engine = scene.getEngine();
  let storage = options.storage;
  if (!storage)
    try {
      storage = globalThis.localStorage;
    } catch {
      /* blocked device storage */
    }
  let requested = { ...ANTIALIASING_DEFAULTS };
  try {
    requested = normalizeAntialiasing(
      JSON.parse(storage?.getItem(ANTIALIASING_STORAGE_KEY) ?? "null"),
    );
  } catch {
    /* corrupt preference */
  }
  let active: Bundle | undefined,
    pending: Bundle | undefined,
    disposed = false,
    waitingFrames = 0,
    error: string | undefined;
  const capabilities = () => {
    const caps = engine.getCaps();
    return {
      maxSamples: caps.maxMSAASamples,
      maxTextureSize: Math.min(caps.maxTextureSize, caps.maxRenderTextureSize),
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
      temporalReprojection: !!(
        caps.texelFetch &&
        caps.drawBuffersExtension &&
        caps.textureHalfFloatRender &&
        caps.textureHalfFloatLinearFiltering
      ),
      temporalResetIntegrated: options.temporalResetIntegrated === true,
    };
  };
  function detach(bundle: Bundle) {
    for (const pass of [...bundle.first, ...bundle.last])
      camera.detachPostProcess(pass);
  }
  function make(plan: AntialiasingPlan): Bundle {
    if (plan.mode === "taa") {
      const before = new Set(camera._postProcesses);
      const taa = new TAARenderingPipeline("sidereal-temporal-aa", scene, [
        camera,
      ]);
      taa.reprojectHistory = true;
      // Babylon registers its jitter factory globally; scope new material
      // assignment to this scene so inventory/portrait preview scenes stay neutral.
      const manager = (
        taa as unknown as {
          _taaThinPostProcess: {
            _taaMaterialManager?: {
              _getPlugin(material: Material): unknown;
            };
          };
        }
      )._taaThinPostProcess._taaMaterialManager;
      if (manager) {
        const getPlugin = manager._getPlugin.bind(manager);
        manager._getPlugin = (material) =>
          material.getScene() === scene ? getPlugin(material) : null;
      }
      taa.clampHistory = true;
      taa.disableOnCameraMove = true;
      taa.samples = 8;
      if (!taa.reprojectHistory) {
        disposeTemporal(taa);
        return make(
          resolveAntialiasing({ mode: "fxaa", samples: 4 }, capabilities()),
        );
      }
      const first = camera._postProcesses.filter(
        (p): p is PostProcess => !!p && !before.has(p),
      );
      taa.isEnabled = false;
      return {
        first,
        last: [],
        plan,
        taa,
        dispose: () => disposeTemporal(taa),
      };
    }
    // The first offscreen target owns MSAA coverage. A single-sample target also
    // makes Off real even though the original WebGL context requested AA.
    const capture = new PassPostProcess(
      "sidereal-aa-scene",
      plan.renderScale,
      null,
      Texture.BILINEAR_SAMPLINGMODE,
      engine,
    );
    capture.samples = plan.samples;
    const last: PostProcess[] = plan.fxaa
      ? [
          new FxaaPostProcess(
            "sidereal-aa-fxaa",
            1,
            null,
            Texture.BILINEAR_SAMPLINGMODE,
            engine,
          ),
        ]
      : [];
    if (plan.renderScale > 1)
      last.push(
        new PassPostProcess(
          "sidereal-aa-downsample",
          1,
          null,
          Texture.BILINEAR_SAMPLINGMODE,
          engine,
        ),
      );
    return {
      first: [capture],
      last,
      plan,
      dispose() {
        for (const pass of [capture, ...last]) pass.dispose(camera);
      },
    };
  }
  function reconcile() {
    if (disposed) return;
    const plan = resolveAntialiasing(requested, capabilities());
    if (JSON.stringify(plan) === JSON.stringify((pending ?? active)?.plan))
      return;
    pending?.dispose();
    pending = undefined;
    // Never keep two TAA material plugin owners alive.
    if (active?.taa) {
      detach(active);
      active.dispose();
      active = undefined;
    }
    pending = make(plan);
    waitingFrames = 0;
    error = undefined;
  }
  function order() {
    if (!active) return;
    const current = camera._postProcesses.filter(
      (p): p is PostProcess => p !== null,
    );
    const desired = antialiasingPassOrder(current, active.first, active.last);
    if (
      desired.length === camera._postProcesses.length &&
      desired.every((p, i) => p === camera._postProcesses[i])
    )
      return;
    for (const pass of current) camera.detachPostProcess(pass);
    desired.forEach((pass, index) => camera.attachPostProcess(pass, index));
    // Babylon detach leaves null slots. Reuse slots and discard only the empty
    // tail so repeated preference/selection changes do not grow the scan list.
    while (camera._postProcesses.at(-1) === null) camera._postProcesses.pop();
  }
  const frame = scene.onBeforeRenderObservable.add(() => {
    if (pending) {
      if ([...pending.first, ...pending.last].every((pass) => pass.isReady())) {
        if (active) {
          detach(active);
          active.dispose();
        }
        active = pending;
        pending = undefined;
        if (active.taa) active.taa.isEnabled = true;
      } else if (++waitingFrames > 300) {
        pending.dispose();
        pending = undefined;
        error =
          "Antialiasing shaders did not become ready; previous rendering retained.";
      }
    }
    order();
  });
  // Other scene observers may attach selection/display effects after ours.
  // Enforce the final order after those observers, immediately before camera rendering.
  const cameraFrame = scene.onBeforeCameraRenderObservable.add(
    (renderingCamera) => {
      if (renderingCamera === camera) order();
    },
  );
  const resize = engine.onResizeObservable.add(() => {
    reconcile();
    resetHistory();
  });
  function resetHistory() {
    if (disposed || !active?.taa) return;
    active.taa.isEnabled = false;
    active.taa.isEnabled = true;
    order();
  }
  function set(patch: Partial<AntialiasingSettings>) {
    if (disposed) return;
    requested = normalizeAntialiasing(patch, requested);
    try {
      storage?.setItem(ANTIALIASING_STORAGE_KEY, JSON.stringify(requested));
    } catch {
      /* session preference remains */
    }
    reconcile();
  }
  reconcile();
  return {
    snapshot(): AntialiasingSnapshot {
      return {
        requested: { ...requested },
        effective: active?.plan ?? {
          mode: "off",
          samples: 1,
          renderScale: 1,
          fxaa: false,
        },
        pending: !!pending,
        ...(error ? { error } : {}),
      };
    },
    set,
    reset: () => set({ ...ANTIALIASING_DEFAULTS }),
    resetHistory,
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(frame);
      scene.onBeforeCameraRenderObservable.remove(cameraFrame);
      engine.onResizeObservable.remove(resize);
      pending?.dispose();
      active?.dispose();
      pending = active = undefined;
    },
  };
}
