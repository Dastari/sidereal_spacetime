import type { Scene } from "@babylonjs/core/scene";
import {
  readSceneCapture,
  type CaptureDiagnostics,
} from "./capture-diagnostics";
import { meshesByRole, type MeshRoleCounts } from "./mesh-roles";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Observer } from "@babylonjs/core/Misc/observable";

export type RenderDiagnostics = {
  planetBuild?: { lastBuildMs?: number; pendingBuilds: number };
  renderBackend?: import("./render-backend").RenderBackend;
  snapshotRendering?: { enabled: boolean; armed: boolean; reason: string };
  sceneCapture?: CaptureDiagnostics;
  meshesByRole?: MeshRoleCounts;
  debugOverlays?: import("./debug-overlays").DebugOverlaySnapshot;
  localLightBudget?: {
    limit: import("./local-light-budget").LocalLightLimit;
    eligibleLights: number;
    enabledLights: number;
    enabledShadowLights: number;
  };
  debugFeatures?: import("./debug-features").DebugFeatures;
  fps: number;
  frameMs: number;
  renderCpuMs: number;
  frameCpuMs?: number;
  updateCpuMs?: number;
  gpuFrameMs?: number;
  transparentMeshes?: number;
  allocatedShadowMaps?: number;
  environmentTexturePresent?: boolean;
  cameraPostProcesses?: string[];
  customRenderTargets?: number;
  cameraRadius?: number;
  cameraElevationDegrees?: number;
  drawCalls: number;
  activeMeshes: number;
  totalMeshes: number;
  activeIndices: number;
  materials: number;
  textures: number;
  lights: number;
  shadowMaps: number;
  renderWidth: number;
  renderHeight: number;
  hardwareScale: number;
};

/** On-demand presentation counters; never reads or writes authoritative state. */
export function createRenderDiagnostics(scene: Scene) {
  let instrument: SceneInstrumentation | undefined;
  let snapshot: RenderDiagnostics | undefined;
  let sampledAt = -Infinity;
  let afterFrame: Observer<Scene> | null = null;
  const engine = scene.getEngine();
  let frameCpuMs: number | undefined, updateCpuMs: number | undefined;
  const gpu = engine as typeof engine & {
    captureGPUFrameTime?: (enabled: boolean) => void;
    getGPUFrameTimeCounter?: () => { current: number; lastSecAverage: number };
  };
  let gpuCapture = false;
  function stop() {
    scene.onAfterRenderObservable.remove(afterFrame);
    afterFrame = null;
    instrument?.dispose();
    instrument = undefined;
    snapshot = undefined;
    sampledAt = -Infinity;
    if (gpuCapture) {
      gpu.captureGPUFrameTime?.(false);
      gpuCapture = false;
    }
  }
  function sampleCompletedFrame() {
    if (!instrument) return;
    const now = performance.now();
    if (!snapshot || now - sampledAt >= 500) {
      sampledAt = now;
      const fps = engine.getFps();
      const gpuCounter = gpuCapture
        ? gpu.getGPUFrameTimeCounter?.()
        : undefined;
      const gpuNs = gpuCounter
        ? gpuCounter.lastSecAverage || gpuCounter.current
        : 0;
      const camera = scene.activeCamera;
      const orbit = camera as typeof camera & {
        radius?: number;
        beta?: number;
      };
      snapshot = {
        fps,
        frameCpuMs,
        updateCpuMs,
        gpuFrameMs: gpuNs > 0 ? gpuNs / 1e6 : undefined,
        frameMs: fps > 0 ? 1000 / fps : 0,
        // CPU scene submission includes render targets and UI observers. This
        // is not GPU duration; GPU timers are not uniformly supported.
        renderCpuMs:
          instrument.frameTimeCounter.lastSecAverage ||
          instrument.frameTimeCounter.current,
        drawCalls: instrument.drawCallsCounter.current,
        activeMeshes: scene.getActiveMeshes().length,
        totalMeshes: scene.meshes.length,
        meshesByRole: meshesByRole(scene),
        activeIndices: scene.getActiveIndices(),
        materials: scene.materials.length,
        textures: scene.textures.length,
        lights: scene.lightsEnabled
          ? scene.lights.filter((light) => light.isEnabled()).length
          : 0,
        // Eligible maps, not passes rendered this frame: cached maps may skip
        // refresh. Babylon's scheduling gate does not check lightsEnabled.
        shadowMaps: scene.shadowsEnabled
          ? scene.lights.filter(
              (light) =>
                light.isEnabled() &&
                light.shadowEnabled &&
                light.getShadowGenerator() !== null,
            ).length
          : 0,
        allocatedShadowMaps: scene.lights.filter(
          (light) => light.getShadowGenerator() !== null,
        ).length,
        // Attached/allocated presentation state, not proof these passes ran.
        // Babylon exposes its attached chain through _postProcesses; no public
        // equivalent exists in the pinned version. Null slots are detached.
        environmentTexturePresent: !!scene.environmentTexture,
        cameraPostProcesses:
          camera?._postProcesses
            .filter((pass) => pass !== null)
            .map((pass) => pass.name) ?? [],
        sceneCapture: readSceneCapture(scene),
        customRenderTargets: scene.customRenderTargets.length,
        cameraRadius:
          typeof orbit?.radius === "number" ? orbit.radius : undefined,
        cameraElevationDegrees:
          typeof orbit?.beta === "number"
            ? ((Math.PI / 2 - orbit.beta) * 180) / Math.PI
            : undefined,
        transparentMeshes: Array.from(
          { length: scene.getActiveMeshes().length },
          (_, i) => scene.getActiveMeshes().data[i],
        ).filter((mesh) => mesh?.material?.needAlphaBlendingForMesh(mesh))
          .length,
        renderWidth: engine.getRenderWidth(),
        renderHeight: engine.getRenderHeight(),
        hardwareScale: engine.getHardwareScalingLevel(),
      };
    }
  }
  return {
    recordFrameCpu(totalMs: number, updateMs: number) {
      frameCpuMs =
        frameCpuMs === undefined ? totalMs : frameCpuMs * 0.9 + totalMs * 0.1;
      updateCpuMs =
        updateCpuMs === undefined
          ? updateMs
          : updateCpuMs * 0.9 + updateMs * 0.1;
    },
    read(enabled: boolean): RenderDiagnostics | undefined {
      if (!enabled || scene.isDisposed) {
        stop();
        return undefined;
      }
      if (!instrument) {
        if (
          engine.getCaps().timerQuery &&
          typeof gpu.captureGPUFrameTime === "function" &&
          typeof gpu.getGPUFrameTimeCounter === "function"
        ) {
          gpu.captureGPUFrameTime(true);
          gpuCapture = true;
        }
        instrument = new SceneInstrumentation(scene);
        instrument.captureFrameTime = true;
        // HUD painting happens before drawing, after Babylon resets counters.
        // Sample only after a complete frame, following instrumentation's own
        // observer, so the overlay never reports reset or accumulated counters.
        afterFrame = scene.onAfterRenderObservable.add(sampleCompletedFrame);
      }
      return snapshot;
    },
    dispose: stop,
  };
}
