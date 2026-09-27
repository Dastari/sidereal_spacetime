import type { Scene } from "@babylonjs/core/scene";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
type Candidate = {
  root: TransformNode;
  stats: () => {
    active?: number;
    pendingBuilds: number;
    retained: number[];
    [key: string]: unknown;
  };
};
export type LODStep = { projected: number; durationMs: number };
export type LODFrame = {
  atMs: number;
  visibility: string;
  intervalMs: number | null;
  renderSubmissionMs: number;
  projected: number;
  cameraRadius: number;
  active?: number;
  pendingBuilds: number;
  retained: number[];
  visibleLODNodes: number[];
  visibleMeshes: number;
  materialIds: number[];
  materialsByLOD: { lod: number; ids: number[] }[];
};
const DEFAULT_STEPS: LODStep[] = [
  24, 44, 64, 145, 180, 280, 180, 120, 42, 24,
].map((projected) => ({ projected, durationMs: 2500 }));
/** Isolated camera experiment. No game inputs, authority or simulation access.
 * Call beforeFrame before update/render and afterFrame after scene.render. */
export function createReferenceLODRecorder(
  scene: Scene,
  engine: AbstractEngine,
  camera: ArcRotateCamera,
  getCandidate: () => Candidate | undefined,
) {
  let running = false,
    startTime = 0,
    frameStart = 0,
    lastFrame: number | undefined,
    steps: LODStep[] = [],
    frames: LODFrame[] = [],
    reason = "not started",
    renderInfo: unknown;
  function snapshot() {
    return {
      scope: "isolated reference camera; not Flight/Map acceptance",
      running,
      reason,
      renderer: renderInfo,
      resolution: {
        width: engine.getRenderWidth(),
        height: engine.getRenderHeight(),
      },
      steps: steps.map((s) => ({ ...s })),
      frames: frames.map((f) => ({ ...f })),
      summary: {
        frames: frames.length,
        blankFrames: frames.filter((f) => f.visibleMeshes === 0).length,
        multipleVisibleLODFrames: frames.filter(
          (f) => f.visibleLODNodes.length > 1,
        ).length,
        maxIntervalMs: Math.max(0, ...frames.map((f) => f.intervalMs ?? 0)),
        maxRenderSubmissionMs: Math.max(
          0,
          ...frames.map((f) => f.renderSubmissionMs),
        ),
      },
    };
  }
  function stop(why = "manual") {
    running = false;
    reason = why;
    return snapshot();
  }
  return {
    start(
      options: {
        steps?: readonly LODStep[];
        viewport?: { width: number; height: number };
        now?: number;
      } = {},
    ) {
      if (running)
        throw new Error("A reference LOD recording is already active");
      if (!getCandidate())
        throw new Error("LOD recording requires an isolated candidate");
      const route = (options.steps ?? DEFAULT_STEPS).map((s) => ({ ...s }));
      if (
        !route.length ||
        route.length > 32 ||
        route.some(
          (s) =>
            !Number.isFinite(s.projected) ||
            s.projected < 2 ||
            s.projected > 4096 ||
            !Number.isFinite(s.durationMs) ||
            s.durationMs < 100 ||
            s.durationMs > 30000,
        ) ||
        route.reduce((n, s) => n + s.durationMs, 0) > 180000
      )
        throw new Error("Invalid bounded LOD route");
      if (options.viewport) {
        const { width, height } = options.viewport;
        if (
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 64 ||
          height < 64 ||
          width > 4096 ||
          height > 4096
        )
          throw new Error("Invalid review viewport");
        engine.setSize(width, height);
        const canvas = engine.getRenderingCanvas();
        if (canvas) {
          canvas.style.width = width + "px";
          canvas.style.height = height + "px";
        }
      }
      startTime = options.now ?? performance.now();
      if (!Number.isFinite(startTime))
        throw new Error("Invalid recorder timestamp");
      steps = route;
      frames = [];
      lastFrame = undefined;
      reason = "recording";
      running = true;
      renderInfo =
        "getGlInfo" in engine
          ? (
              engine as AbstractEngine & { getGlInfo: () => unknown }
            ).getGlInfo()
          : { renderer: "unavailable" };
    },
    beforeFrame(now = performance.now()) {
      if (!running) return;
      frameStart = now;
      let elapsed = now - startTime,
        step = steps[steps.length - 1];
      for (const value of steps) {
        if (elapsed < value.durationMs) {
          step = value;
          break;
        }
        elapsed -= value.durationMs;
      }
      camera.radius =
        engine.getRenderHeight() /
        (2 * step.projected * Math.tan(camera.fov / 2));
    },
    afterFrame(now = performance.now()) {
      if (!running) return;
      const candidate = getCandidate();
      if (!candidate || scene.isDisposed) {
        stop("candidate disposed");
        return;
      }
      const stats = candidate.stats(),
        meshes = candidate.root
          .getChildMeshes()
          .filter(
            (m) =>
              m.metadata?.role === "planet" &&
              m.metadata?.trianglePlacementRanges &&
              !m.metadata?.planetWeather,
          ),
        nodes = candidate.root
          .getChildren()
          .filter((n) => Number.isInteger(n.metadata?.lod)),
        materialIds = [
          ...new Set(
            meshes
              .map((m) => m.material?.uniqueId)
              .filter((v): v is number => v !== undefined),
          ),
        ].sort((a, b) => a - b),
        materialsByLOD = nodes.map((n) => ({
          lod: n.metadata.lod as number,
          ids: [
            ...new Set(
              meshes
                .filter((m) => m.isDescendantOf(n))
                .map((m) => m.material?.uniqueId)
                .filter((v): v is number => v !== undefined),
            ),
          ].sort((a, b) => a - b),
        }));
      frames.push({
        atMs: now - startTime,
        visibility:
          typeof document === "undefined"
            ? "unavailable"
            : document.visibilityState,
        intervalMs: lastFrame === undefined ? null : frameStart - lastFrame,
        renderSubmissionMs: Math.max(0, now - frameStart),
        projected:
          engine.getRenderHeight() /
          (2 * camera.radius * Math.tan(camera.fov / 2)),
        cameraRadius: camera.radius,
        active: stats.active,
        pendingBuilds: stats.pendingBuilds,
        retained: [...stats.retained],
        visibleLODNodes: nodes
          .filter((n) => n.isEnabled())
          .map((n) => n.metadata.lod),
        visibleMeshes: meshes.filter((m) => m.isEnabled()).length,
        materialIds,
        materialsByLOD,
      });
      lastFrame = frameStart;
      if (frames.length >= 10000) stop("frame limit");
      else if (now - startTime >= steps.reduce((n, s) => n + s.durationMs, 0))
        stop("route complete");
    },
    stop,
    snapshot,
    dispose() {
      running = false;
      frames = [];
      reason = "disposed";
    },
  };
}
