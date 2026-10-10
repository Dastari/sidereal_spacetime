import type { Scene } from "@babylonjs/core/scene";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { RenderDiagnostics } from "@sidereal/render/diagnostics";

export type FrameTimings = {
  renderCpuMs: number;
  updateCpuMs: number;
  frameCpuMs: number;
};
export function summarize(values: readonly number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return {
    samples: n,
    median: n
      ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2
      : null,
    p95: n ? sorted[Math.ceil(n * 0.95) - 1] : null,
  };
}
export function relativeDifference(a: number, b: number) {
  return a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}
type Pass = { draws: number; litMaterialBinds: number };
type Sample = FrameTimings & {
  frameMs: number;
  drawCalls: number;
  activeIndices: number;
  passes: Record<string, Pass>;
  gpuFrameMs?: number;
};
export function summarizeRun(samples: readonly Sample[]) {
  const fields = [
    "frameMs",
    "drawCalls",
    "activeIndices",
    "renderCpuMs",
    "updateCpuMs",
    "frameCpuMs",
    "gpuFrameMs",
  ] as const;
  const metrics = Object.fromEntries(
    fields.map((key) => [
      key,
      summarize(
        samples.flatMap((s) => (s[key] === undefined ? [] : [s[key]!])),
      ),
    ]),
  );
  const ids = new Set(samples.flatMap((s) => Object.keys(s.passes)));
  const passes = Object.fromEntries(
    [...ids].sort().map((id) => [
      id,
      {
        draws: summarize(samples.map((s) => s.passes[id]?.draws ?? 0)),
        litMaterialBinds: summarize(
          samples.map((s) => s.passes[id]?.litMaterialBinds ?? 0),
        ),
      },
    ]),
  );
  return {
    frames: samples.length,
    fps: summarize(samples.map((s) => 1000 / s.frameMs)),
    metrics,
    passes,
  };
}

/** Harness-only observers and one pinned Babylon 9.25 draw-counter wrapper.
 * Runs the existing counter unchanged, counts fullscreen passes too, and restores
 * only its own hook. No material, mesh, light, target or quality is modified. */
export function createPerformanceProbe(
  scene: Scene,
  options: {
    frames: number;
    warmup: number;
    metadata: Record<string, unknown>;
    ready: () => boolean;
    /** Embedded browser hosts may not expose keyboard focus through the DOM.
     * A host-confirmed predicate must be explicitly recorded in metadata. */
    focused?: () => boolean;
    diagnostics: () => RenderDiagnostics | undefined;
    settings: () => unknown;
    completed?: () => void;
  },
) {
  const engine = scene.getEngine();
  const gpu = engine as typeof engine & {
    captureGPUFrameTime?: (value: boolean) => void;
    getGPUFrameTimeCounter?: () => { current: number; count: number };
    _captureGPUFrameTime?: boolean;
  };
  const counter = engine._drawCalls;
  const original = counter.addCount;
  let collecting = false,
    disposed = false,
    raw: FrameTimings | undefined;
  let passes: Record<string, Pass> = {},
    frameMs = 0,
    lastFrame = 0;
  let warmed = 0,
    signature = "",
    previousGpuCount = -1;
  let samples: Sample[] = [];
  const runs: ReturnType<typeof summarizeRun>[] = [];
  const materials = new Map<Material, Observer<AbstractMesh> | null>();
  let ownedGpuCapture = false;
  const report = {
    status: "waiting" as
      "waiting" | "warming" | "sampling" | "complete" | "disposed",
    reason: "Waiting for a ready, visible, focused view",
    config: { frames: options.frames, warmup: options.warmup, runs: 2 },
    metadata: options.metadata,
    view: {} as Record<string, unknown>,
    progress: 0,
    warmupProgress: 0,
    documentFocused: false,
    blockedFrames: {} as Record<string, number>,
    interruptions: [] as {
      reason: string;
      frameMs: number;
      warmupFrames: number;
      sampledFrames: number;
      completedRuns: number;
    }[],
    runs,
    repeatability: {} as Record<
      string,
      { difference: number | null; within3Percent: boolean | null }
    >,
    restart() {
      runs.length = 0;
      samples = [];
      warmed = 0;
      report.progress = 0;
      report.warmupProgress = 0;
      report.repeatability = {};
      report.status = "waiting";
    },
  };
  function pass() {
    const id = String(engine.currentRenderPassId);
    return (passes[id] ??= { draws: 0, litMaterialBinds: 0 });
  }
  const wrapped: typeof original = function (
    this: typeof counter,
    count,
    fetchResult,
  ) {
    if (collecting) pass().draws += count;
    return original.call(this, count, fetchResult);
  };
  counter.addCount = wrapped;
  function track(material: Material | null) {
    if (!material || materials.has(material)) return;
    if (material instanceof MultiMaterial) {
      for (const child of material.subMaterials) track(child);
    }
    const observer = material.onBindObservable.add((mesh) => {
      const lit = material as Material & {
        disableLighting?: boolean;
        maxSimultaneousLights?: number;
      };
      if (
        collecting &&
        lit.disableLighting === false &&
        (lit.maxSimultaneousLights ?? 0) > 0 &&
        scene.lightsEnabled &&
        mesh.lightSources.some((l) => l.isEnabled() && l.intensity !== 0)
      ) {
        pass().litMaterialBinds++;
      }
    });
    materials.set(material, observer);
  }
  const added = scene.onNewMaterialAddedObservable.add(track);
  function view() {
    const camera = scene.activeCamera as typeof scene.activeCamera & {
      alpha?: number;
      beta?: number;
      radius?: number;
      target?: { asArray(): number[] };
    };
    return {
      width: engine.getRenderWidth(),
      height: engine.getRenderHeight(),
      hardwareScale: engine.getHardwareScalingLevel(),
      camera: camera && {
        alpha: camera.alpha,
        beta: camera.beta,
        radius: camera.radius,
        target: camera.target?.asArray(),
        minZ: camera.minZ,
        maxZ: camera.maxZ,
      },
      meshes: scene.meshes.length,
      materials: scene.materials.length,
      settings: options.settings(),
    };
  }
  const begin = engine.onBeginFrameObservable.add(() => {
    const now = performance.now();
    frameMs = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    raw = undefined;
    report.documentFocused = document.hasFocus();
    passes = {};
    collecting = false;
    if (report.status === "complete" || disposed) return;
    // Preserve the guards and their short-circuit order, but name the condition
    // so a failed foreground capture can be diagnosed without another blind run.
    let blocked = "";
    if (document.visibilityState !== "visible") blocked = "tab hidden";
    else if (!(options.focused?.() ?? report.documentFocused))
      blocked = "page not focused";
    else if (engine.getDeltaTime() === 0) blocked = "zero engine frame delta";
    else if (frameMs > 250) blocked = "frame interval exceeds 250ms";
    else if (!options.ready()) blocked = "harness not ready";
    else if (warmed === 0 && !scene.isReady())
      blocked = "scene shaders or render targets not ready";
    else if (scene.getWaitingItemsCount() > 0) blocked = "assets still pending";
    if (blocked) {
      report.blockedFrames[blocked] = (report.blockedFrames[blocked] ?? 0) + 1;
      const reason = `Waiting: ${blocked}; interrupted partial run discarded`;
      if (report.status !== "waiting" || report.reason !== reason) {
        report.interruptions.push({
          reason: blocked,
          frameMs,
          warmupFrames: report.warmupProgress,
          sampledFrames: report.progress,
          completedRuns: runs.length,
        });
        if (report.interruptions.length > 16) report.interruptions.shift();
      }
      report.restart();
      report.status = "waiting";
      report.reason = reason;
      return;
    }
    const nextView = view(),
      nextSignature = JSON.stringify(nextView);
    if (nextSignature !== signature) {
      report.restart();
      signature = nextSignature;
      report.view = nextView;
    }
    if (warmed === 0) {
      for (const material of scene.materials) track(material);
      for (const mesh of scene.meshes) track(mesh.material);
      if (
        engine.getCaps().timerQuery &&
        gpu.captureGPUFrameTime &&
        !gpu._captureGPUFrameTime
      ) {
        gpu.captureGPUFrameTime(true);
        ownedGpuCapture = true;
      }
    }
    warmed++;
    report.warmupProgress = Math.min(warmed, options.warmup);
    collecting = warmed > options.warmup && frameMs > 0;
    report.status = collecting ? "sampling" : "warming";
    report.reason = "";
  });
  const end = engine.onEndFrameObservable.add(() => {
    if (!collecting || !raw) return;
    // GPU counters arrive asynchronously. Do not duplicate an old sample or
    // convert an unsupported timer to zero. Percentiles state their sample count.
    const timer = gpu.getGPUFrameTimeCounter?.();
    const gpuFrameMs =
      timer && timer.count !== previousGpuCount && timer.current > 0
        ? timer.current / 1e6
        : undefined;
    previousGpuCount = timer?.count ?? -1;
    const drawCalls = Object.values(passes).reduce(
      (sum, p) => sum + p.draws,
      0,
    );
    samples.push({
      ...raw,
      frameMs,
      drawCalls,
      activeIndices: scene.getActiveIndices(),
      passes,
      gpuFrameMs,
    });
    report.progress = samples.length;
    if (samples.length !== options.frames) return;
    runs.push(summarizeRun(samples));
    samples = [];
    warmed = 0;
    if (runs.length < 2) return;
    for (const key of [
      "fps",
      "renderCpuMs",
      "updateCpuMs",
      "frameCpuMs",
      "gpuFrameMs",
      "drawCalls",
      "activeIndices",
    ]) {
      const a =
        key === "fps" ? runs[0].fps.median : runs[0].metrics[key].median;
      const b =
        key === "fps" ? runs[1].fps.median : runs[1].metrics[key].median;
      const difference =
        a === null || b === null ? null : relativeDifference(a, b);
      report.repeatability[key] = {
        difference,
        within3Percent: difference === null ? null : difference <= 0.03,
      };
    }
    report.metadata.diagnostics = options.diagnostics();
    report.metadata.passNames = engine.getRenderPassNames();
    report.status = "complete";
    collecting = false;
    // Optional local collection must never break the renderer if unavailable.
    try {
      options.completed?.();
    } catch {
      /* caller can inspect the report */
    }
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    collecting = false;
    if (counter.addCount === wrapped) counter.addCount = original;
    engine.onBeginFrameObservable.remove(begin);
    engine.onEndFrameObservable.remove(end);
    scene.onNewMaterialAddedObservable.remove(added);
    for (const [material, observer] of materials)
      material.onBindObservable.remove(observer);
    materials.clear();
    if (ownedGpuCapture) gpu.captureGPUFrameTime?.(false);
    scene.onDisposeObservable.remove(teardown);
    report.status = "disposed";
  }
  const teardown = scene.onDisposeObservable.add(dispose);
  return {
    report,
    recordFrame(sample: FrameTimings) {
      raw = sample;
    },
    dispose,
  };
}
