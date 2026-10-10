import { addBowOverlay } from "./bow-overlay";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { BOW_HOSTS } from "./bow-fixtures";
/**
 * In-game review of a prefab ship: the real game renderer (`createWorld` from packages/render,
 * same scene, lights, post-processing, camera and crew) with the prefab's trusted construction
 * document as the ship, exactly as the client renders an assigned prefab. No database, no auth:
 * a static SceneState stands the crew at the ship centre.
 *
 * Query: ?prefab=<id>&interior=1|0&inspect=1 (3/4 flight camera)&x=&y= (crew, ship metres)
 * Sets window.__prefabReady once the world has rendered a few frames; __prefabError on failure;
 * __prefabMetrics = [{ id, meshes, drawCalls }].
 */
import { SHIP_REFERENCE_VISUAL } from "../art_library/ship_reference_revision";
import { createWorld, type SceneState } from "@sidereal/render";
import type { Scene } from "@babylonjs/core/scene";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { prefabById, PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import { createPerformanceProbe } from "./performance-probe";
import { CanvasUI } from "../../packages/canvas-ui/src/toolkit";
import { createDiagnosticsUI } from "../../packages/canvas-ui/src/diagnostics";

declare const __PREFAB_SOURCE__: { head: string; rendererTree: string };

declare global {
  interface Window {
    __prefabReady?: boolean;
    __prefabMetrics?: unknown;
    __prefabError?: string;
    __prefabWorld?: unknown;
    __prefabPerf?: ReturnType<typeof createPerformanceProbe>["report"];
    __prefabLoadStage?: string;
    __prefabPerfUpload?: { status: string; error?: string };
  }
}

const q = new URLSearchParams(location.search);
const perf = q.get("perf") === "1";
if (perf) window.__prefabLoadStage = "entry";
// Use only after the owner confirms the embedded preview is visible/focused.
// Electron can report DOM focus false in its embedded view; never infer that
// confirmation from a running animation loop. Other readiness/throttle gates stay.
const hostFocusConfirmed = perf && q.get("perfFocus") === "host";
const cam = (
  q.get("cam") ??
  (perf ? "2.0207963267948967,0.9553166181245092,30,0,0" : undefined)
)
  ?.split(",")
  .map(Number);
const validCam = cam && cam.length >= 3 && cam.every(Number.isFinite);
const doc =
  BOW_HOSTS.find((p) => p.id === q.get("prefab")) ??
  prefabById(q.get("prefab") ?? "fed.s.wren") ??
  PREFAB_SHIPS[0];
const canvas = document.getElementById("view") as HTMLCanvasElement;
const width = Number(q.get("w")) || window.innerWidth;
const height = Number(q.get("h")) || window.innerHeight;
canvas.width = width;
canvas.height = height;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;

// The opt-in benchmark needs visible progress: opening DevTools to check an
// unfinished run takes page focus and correctly discards that partial run.
if (perf) {
  // Focusing the benchmark must not select/hover an object and introduce an
  // outline proxy/pass. Register before the production input listeners.
  const focusOnly = (event: PointerEvent) => {
    canvas.focus({ preventScroll: true });
    event.stopImmediatePropagation();
  };
  const noHover = (event: PointerEvent) => event.stopImmediatePropagation();
  canvas.addEventListener("pointerdown", focusOnly, true);
  canvas.addEventListener("pointermove", noHover, true);
  const progress = document.createElement("div");
  progress.id = "performance-probe-status";
  progress.setAttribute("role", "status");
  Object.assign(progress.style, {
    position: "fixed",
    left: "12px",
    top: "12px",
    padding: "8px",
    color: "#cfd8ff",
    background: "rgba(18, 10, 36, 0.85)",
    font: "13px/1.4 ui-monospace, monospace",
    whiteSpace: "pre-wrap",
    pointerEvents: "none",
    maxWidth: "calc(100vw - 40px)",
  });
  document.body.append(progress);
  const updateProgress = () => {
    const report = window.__prefabPerf;
    let text = `Performance probe · Loading: ${window.__prefabLoadStage}`;
    if (report?.status === "waiting")
      text = `Performance probe · ${report.reason}\nClick the ship view and keep this tab in front.`;
    else if (report?.status === "warming")
      text = `Performance probe · Run ${report.runs.length + 1}/2 · Warmup ${report.warmupProgress}/${report.config.warmup}`;
    else if (report?.status === "sampling")
      text = `Performance probe · Run ${report.runs.length + 1}/2 · Frames ${report.progress}/${report.config.frames}`;
    else if (report?.status === "complete") {
      const upload = window.__prefabPerfUpload;
      text =
        upload?.status === "saved"
          ? "Performance probe · Result saved. Return to the chat."
          : upload?.status === "failed"
            ? `Performance probe · Run complete; upload failed: ${upload.error}.\nThe result remains on window.__prefabPerf.`
            : "Performance probe · Run complete; sending result…";
    }
    if (progress.textContent !== text) progress.textContent = text;
  };
  updateProgress();
  const timer = window.setInterval(updateProgress, 500);
  import.meta.hot?.dispose(() => {
    window.clearInterval(timer);
    progress.remove();
    canvas.removeEventListener("pointerdown", focusOnly, true);
    canvas.removeEventListener("pointermove", noHover, true);
  });
}

async function main() {
  const construction = prefabConstructionDocument(
    doc,
    defaultPrefabComponentCatalog(),
  );
  // Production-renderer fleet fixture: one occupied ship plus public-only
  // exterior projections. These accepted-shaped rows never connect to a DB.
  const fleetSize = Math.max(1, Math.min(20, Number(q.get("fleet")) || 1));
  const fleetIds = [
    "fed.s.wren-fleet",
    "fed.s.petrel-fleet",
    "fed.m.wayfarer-fleet",
    "fed.m.heron-fleet",
    "fed.l.kestrel-fleet",
    "fed.l.albatross-fleet",
  ];
  const poses = Array.from({ length: fleetSize - 1 }, (_, i) => ({
    shipId: `review-remote-${i}`,
    x: ((i % 5) - 2) * 36,
    y: 45 + Math.floor(i / 5) * 40,
  }));
  const snapshot = {
    epoch: 1,
    shipMotion: poses,
    shipDescription: poses.map((pose, i) => {
      const ship = prefabById(fleetIds[i % fleetIds.length])!;
      return {
        shipId: pose.shipId,
        publishedExteriorAssetId: `prefab:${ship.id}`,
        appearanceRevision: BigInt(ship.revision),
      };
    }),
  };
  let scene: Scene | undefined;
  let probe: ReturnType<typeof createPerformanceProbe> | undefined;
  const world = await createWorld(
    canvas,
    (text) => (document.getElementById("hud")!.textContent = text),
    {
      prefabVisualVariant:
        q.get("visual") === "reference-r001"
          ? SHIP_REFERENCE_VISUAL
          : undefined,
      sharedWorld:
        fleetSize > 1
          ? {
              bodies: () => undefined,
              ships: {
                localShipId: () => "review-local",
                store: {
                  getSnapshot: () => snapshot,
                  subscribeTable: () => () => {},
                  sampleShip: (id) => {
                    const pose = poses.find((p) => p.shipId === id);
                    return pose && { x: pose.x, y: pose.y, heading: 0 };
                  },
                },
              },
            }
          : undefined,
      construction: {
        instanceId: construction.layout.id,
        documentJson: JSON.stringify(construction),
        deckId: "deck-0",
      },
      onScene: (s) => {
        scene = s;
        (window as unknown as { __prefabScene?: Scene }).__prefabScene = s;
      },
      onLoadError: (m) => (window.__prefabError = m),
      onLoadStage: perf
        ? (stage) => {
            window.__prefabLoadStage = stage;
          }
        : undefined,
      onFrameDiagnostics: perf
        ? (sample) => probe?.recordFrame(sample)
        : undefined,
      blocksCameraInput: perf ? () => true : undefined,
      onFrameCamera:
        perf && validCam
          ? (camera) => {
              if (cam.length >= 5) camera.target.set(cam[3], 1.2, -cam[4]);
              [camera.alpha, camera.beta, camera.radius] = cam as [
                number,
                number,
                number,
              ];
              if (q.get("ortho") === "1") {
                camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
                camera.orthoTop = 7;
                camera.orthoBottom = -7;
                camera.orthoLeft = (-7 * width) / height;
                camera.orthoRight = (7 * width) / height;
              }
            }
          : undefined,
    },
  );
  import.meta.hot?.dispose(() => {
    probe?.dispose();
    world.dispose();
  });
  const interior = q.get("interior") !== "0";
  const state: SceneState = {
    heading: 0,
    x: 0,
    y: 0,
    localX: Number(q.get("x") ?? 0),
    localY: Number(q.get("y") ?? 0),
    interior,
    inspect: q.get("inspect") === "1",
    grid: false,
  };
  if (q.get("crew") === "t2") {
    world.customizeCrew({
      bodyType: "male",
      hairStyle: "spiked_quiff",
      weapon: "none",
      backpack: true,
      equippedComponents: {
        chest: "wardrobe-t2-chest",
        shoulders: "wardrobe-t2-shoulders",
        gloves: "wardrobe-t2-gloves",
        belt: "wardrobe-t2-belt",
        legs: "wardrobe-t2-legs",
        boots: "wardrobe-t2-boots",
        back: "wardrobe-t2-back",
      },
    });
  }
  world.update(state);
  window.__prefabWorld = world;
  // Review hook: shots can re-issue the state with extra fields (e.g. airlockCycle).
  (window as unknown as { __prefabState?: SceneState }).__prefabState = state;
  // Review-only camera override (&cam=alpha,beta,radius): the game eases its RPG camera toward the
  // crew every frame; this re-applies fixed matching angles after it, never touching game state.
  // Optional 4th/5th values: camera target in ship metres (x starboard, y fore) at deck height.
  if (!perf && validCam)
    scene!.onBeforeRenderObservable.add(() => {
      const c = scene!.activeCamera as unknown as {
        alpha: number;
        beta: number;
        radius: number;
        target: Vector3;
      } | null;
      if (!c || !("alpha" in c)) return;
      // Target first: the ArcRotateCamera target setter re-derives angles from the position.
      if (cam.length >= 5) c.target = new Vector3(cam[3], 1.2, -cam[4]);
      [c.alpha, c.beta, c.radius] = cam as [number, number, number];
      if (q.get("ortho") === "1") {
        const camera = scene!.activeCamera!;
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        camera.orthoTop = 7;
        camera.orthoBottom = -7;
        camera.orthoLeft = (-7 * width) / height;
        camera.orthoRight = (7 * width) / height;
      }
    });
  const instrumentation = new SceneInstrumentation(scene!);
  if (perf) window.__prefabLoadStage = "settling";
  const engine = scene!.getEngine();
  const warmup = Math.max(6, Math.min(120, Number(q.get("frames")) || 30));
  const settle = 3;
  async function settledDraws(count: number) {
    let draws = 0;
    for (let i = 0; i < count; i++)
      draws = await new Promise<number>((resolve) =>
        engine.onEndFrameObservable.addOnce(() =>
          resolve(instrumentation.drawCallsCounter.current),
        ),
      );
    return draws;
  }
  const ship = scene!.getTransformNodeByName(`prefab-ship:${doc.id}`);
  await settledDraws(warmup);
  ship?.setEnabled(false);
  const withoutShip = await settledDraws(settle);
  ship?.setEnabled(true);
  const frameDraws = await settledDraws(settle);
  window.__prefabMetrics = [
    {
      id: doc.id,
      view: interior ? "deck" : "flight",
      drawCalls: frameDraws,
      shipDraws: frameDraws - withoutShip,
      meshes:
        ship?.getChildMeshes().filter((m) => m.isEnabled() && m.isVisible)
          .length ?? 0,
      lights: scene!.lights
        .filter((l) => l.isEnabled())
        .map(
          (l) =>
            `${l.getClassName()}:${l.name}:${l.intensity.toFixed(2)}:${
              "direction" in l
                ? ((l as unknown as { direction?: Vector3 }).direction
                    ?.asArray()
                    .map((v) => v.toFixed(2))
                    .join(",") ?? "")
                : ""
            }`,
        ),
      // Mesh origin of the visible ship: Blender GLB vs TypeScript-generated vs effects.
      origin: (
        scene!.getTransformNodeByName("ship-frame")?.metadata as {
          prefabView?: { metrics(): unknown };
        } | null
      )?.prefabView?.metrics(),
      // Non-ship active meshes by name prefix (what the rest of the frame is spent on).
      others: Object.entries(
        scene!
          .getActiveMeshes()
          .data.slice(0, scene!.getActiveMeshes().length)
          .filter((m) => !ship || !m.isDescendantOf(ship))
          .reduce<Record<string, number>>(
            (acc, m) => (
              (acc[m.name.split(/[:_.\-\d]/)[0] || m.name] =
                (acc[m.name.split(/[:_.\-\d]/)[0] || m.name] ?? 0) + 1),
              acc
            ),
            {},
          ),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12),
      activeMeshes: scene!.getActiveMeshes().length,
      otherNames: scene!
        .getActiveMeshes()
        .data.slice(0, scene!.getActiveMeshes().length)
        .filter((m) => !ship || !m.isDescendantOf(ship))
        .map((m) => `${m.name}<${m.parent?.name ?? ""}`)
        .slice(0, 80),
      environmentIntensity: scene!.environmentIntensity,
      exposure: scene!.imageProcessingConfiguration.exposure,
    },
  ];
  document.getElementById("hud")!.textContent =
    `${doc.id} ${interior ? "deck" : "flight"} (game renderer): ${frameDraws} draws/frame, ship ${frameDraws - withoutShip}`;
  if (q.get("overlay") === "1") addBowOverlay(scene!, doc);
  if (q.get("freeze") === "1") engine.stopRenderLoop();
  window.__prefabReady = true;
  if (q.get("f3") === "1" && !perf) {
    const overlay = document.createElement("canvas");
    overlay.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
    document.body.appendChild(overlay);
    const ui = new CanvasUI(overlay, scene!);
    const panel = createDiagnosticsUI(
      ui,
      (enabled) => world.getDiagnostics(enabled),
      {
        toggle: (key) => world.toggleDebugFeature(key),
        reset: () => world.resetDebugFeatures(),
        quality: (patch) => world.setRenderQuality(patch),
      },
    );
    ui.draw = () => panel.draw();
    ui.scroll = (delta, x, y) => panel.scroll(delta, x, y);
    ui.shortcut = (code) => {
      if (code !== "F3") return false;
      panel.toggle();
      return true;
    };
    panel.toggle();
    Object.assign(window, { __prefabF3: { ui, panel } });
  }
  if (perf) {
    window.__prefabLoadStage = "ready";
    // Warm the existing on-demand diagnostics before sampling so actual
    // quality/debug settings are available in the completed provenance record.
    world.getDiagnostics(true);
    // Private experiment switches use the same F3 path, before probe warmup.
    const captureExperiment = q.get("captureExperiment");
    if (captureExperiment === "cache")
      world.toggleDebugFeature("captureListCache");
    if (captureExperiment === "motion")
      world.toggleDebugFeature("captureOnMotion");
    if (captureExperiment === "globals")
      world.toggleDebugFeature("captureGlobalsOnly");
    const bounded = (
      name: string,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const value = Number(q.get(name) ?? fallback);
      return Number.isFinite(value)
        ? Math.max(min, Math.min(max, Math.floor(value)))
        : fallback;
    };
    const gl = canvas.getContext("webgl2");
    const gpuInfo = gl?.getExtension("WEBGL_debug_renderer_info");
    probe = createPerformanceProbe(scene!, {
      frames: bounded("perfFrames", 300, 60, 3600),
      warmup: bounded("perfWarmup", 180, 60, 1800),
      metadata: {
        source: __PREFAB_SOURCE__,
        prefab: doc.id,
        fleetSize,
        interior,
        crewPosition: [state.localX, state.localY],
        userAgent: navigator.userAgent,
        gpu: gpuInfo ? gl!.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) : null,
        query: location.search,
        delivery: import.meta.env.PROD ? "bundle" : "development modules",
        focusValidation: hostFocusConfirmed
          ? "owner-confirmed embedded preview"
          : "document.hasFocus()",
        interaction: "focus only; object selection/hover input suppressed",
        definitions: {
          renderCpuMs:
            "Raw scene.render() wall duration, including scene observers and targets",
          updateCpuMs:
            "Raw controller duration, identical to F3 diagnostics before static material preparation",
          frameCpuMs:
            "Raw world frame callback duration, identical to F3 diagnostics",
          frameMs:
            "Interval between engine frame starts; fps includes presentation pacing",
          gpuFrameMs:
            "New asynchronously completed engine GPU timer samples; unsupported is null",
          litMaterialBinds:
            "Material onBind events with lighting enabled, positive light cap and an enabled nonzero eligible light; not a GPU draw count",
          draws:
            "Babylon draw counter increments, including fullscreen draws, by currentRenderPassId",
        },
      },
      ready: () => window.__prefabReady === true && !window.__prefabError,
      focused: hostFocusConfirmed ? () => true : undefined,
      completed: () => {
        window.__prefabPerfUpload = { status: "uploading" };
        void fetch("/__prefab-perf-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(probe?.report),
        })
          .then((response) => {
            window.__prefabPerfUpload = response.ok
              ? { status: "saved" }
              : { status: "failed", error: `HTTP ${response.status}` };
          })
          .catch((error) => {
            window.__prefabPerfUpload = {
              status: "failed",
              error: String(error),
            };
          });
      },
      diagnostics: () => world.getDiagnostics(true),
      settings: () => ({
        backend: world.getRenderBackend(),
        aa: world.getAntialiasing(),
        graphics: world.getGraphicsSettings(),
        debugFeatures: world.getDiagnostics(true)?.debugFeatures,
      }),
    });
    window.__prefabPerf = probe.report;
  }
}

main().catch((e) => {
  console.error(e);
  window.__prefabError = String(e?.stack ?? e);
  window.__prefabReady = true;
});
