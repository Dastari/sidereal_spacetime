/** Developer-only fixture: exact production exterior coordinator, synthetic accepted rows.
 * Never connects to a database or changes authoritative world state. */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { prefabById } from "@sidereal/content/prefabs";
import { publishedShipAccessBytes } from "../../packages/render/src/prefab-ship/wayfarer-access-assets";
import {
  createRemoteShipExteriors,
  type RemoteShipSnapshot,
} from "../../packages/render/src/prefab-ship/remote-exteriors";

const q = new URLSearchParams(location.search);
const count = Math.max(1, Math.min(140, Number(q.get("ships")) || 7));
const ids = [
  "fed.s.wren-fleet",
  "fed.s.petrel-fleet",
  "fed.m.wayfarer-fleet",
  "fed.m.heron-fleet",
  "fed.l.kestrel-fleet",
  "fed.l.albatross-fleet",
];
const screenLayout = q.get("layout") === "screen";
const columns = Math.min(count, screenLayout ? 14 : 7);
const reviewPrefab = q.get("prefab");
if (reviewPrefab && !ids.includes(reviewPrefab))
  throw Error("Unsupported fixture prefab");
const poses = Array.from({ length: count }, (_, i) => ({
  shipId: `fixture-${i}`,
  x: ((i % columns) - (columns - 1) / 2) * (screenLayout ? 80 : 50),
  y: screenLayout
    ? (Math.floor(i / columns) - (Math.ceil(count / columns) - 1) / 2) * 70
    : Math.floor(i / 7) * 52,
}));
const snapshot: RemoteShipSnapshot = {
  epoch: 1,
  shipMotion: poses,
  shipDescription: poses.map((p, i) => {
    const doc = prefabById(reviewPrefab ?? ids[i % ids.length])!;
    return {
      shipId: p.shipId,
      publishedExteriorAssetId: `prefab:${doc.id}`,
      appearanceRevision: BigInt(doc.revision),
    };
  }),
};
const store = {
  getSnapshot: () => snapshot,
  subscribeTable: () => () => {},
  sampleShip: (id: string) => {
    const p = poses[Number(id.slice(8))];
    return p && { x: p.x, y: p.y, heading: 0 };
  },
};
const review = {
  ready: false,
  error: "",
  sample: async (_frames = 120): Promise<unknown> => undefined,
};
Object.assign(window, { __fleetPerformance: review });

async function main() {
  const started = performance.now();
  const engine = new Engine(document.querySelector("canvas")!, true, {
    stencil: true,
  });
  engine.setSize(1280, 800);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.02, 0.03, 0.07, 1);
  const camera = new FreeCamera(
    "fixture-camera",
    screenLayout ? new Vector3(0, 1050, 0) : new Vector3(0, 100, 100),
    scene,
  );
  const reviewCamera = q.get("cam")?.split(",").map(Number);
  if (reviewCamera?.length === 5 && reviewCamera.every(Number.isFinite))
    camera.position.set(reviewCamera[0], reviewCamera[1], reviewCamera[2]);
  camera.fov = 0.8;
  camera.minZ = 0.1;
  camera.maxZ = 5000;
  camera.setTarget(
    reviewCamera?.length === 5 && reviewCamera.every(Number.isFinite)
      ? new Vector3(reviewCamera[3], 0, reviewCamera[4])
      : screenLayout
        ? Vector3.Zero()
        : new Vector3(0, 0, -90),
  );
  const fill = new HemisphericLight("fill", Vector3.Up(), scene);
  fill.intensity = 0.75;
  fill.groundColor = new Color3(0.22, 0.12, 0.35);
  const key = new DirectionalLight("key", new Vector3(0.45, -1, 0.3), scene);
  key.intensity = 2.4;
  const errors: string[] = [];
  const remote = createRemoteShipExteriors(scene, store, {
    localShipId: () => undefined,
    intermediateExteriors: q.get("intermediate") !== "0",
    accessResolver: publishedShipAccessBytes,
    fullDetailBudget: q.get("allFull") === "1" ? count : undefined,
    fullDetailShipIds: () =>
      new Set(q.get("allFull") === "1" ? poses.map((p) => p.shipId) : []),
    onError: (e) => errors.push(String(e)),
  });
  Object.assign(review, { scene, remote, camera, engine });
  const instrument = new SceneInstrumentation(scene);
  instrument.captureFrameTime = true;
  const updates: number[] = [],
    renders: number[] = [],
    intervals: number[] = [];
  let collecting = false,
    previous: number | undefined;
  engine.runRenderLoop(() => {
    const start = performance.now();
    camera.getViewMatrix(true);
    remote.update({ x: 0, y: 0 }, start, camera, 800);
    const updated = performance.now();
    scene.render();
    const end = performance.now();
    if (collecting) {
      updates.push(updated - start);
      renders.push(end - updated);
      if (previous !== undefined) intervals.push(start - previous);
      previous = start;
    }
  });
  await remote.settled();
  // Warm shaders and wait for asynchronous native access assembly; cap waits on failure.
  for (
    let i = 0;
    i < 60 &&
    (i < 3 ||
      remote
        .diagnostics()
        .ships.some((s) => s.accessPending || !s.detailReady));
    i++
  )
    await new Promise<void>((resolve) =>
      engine.onEndFrameObservable.addOnce(() => resolve()),
    );
  await scene.whenReadyAsync();
  const readyMs = performance.now() - started;
  function distribution(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    return {
      p50: at(0.5),
      p95: at(0.95),
      p99: at(0.99),
      mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
    };
  }
  review.sample = async (frames = 120) => {
    updates.length = renders.length = intervals.length = 0;
    previous = undefined;
    collecting = true;
    for (let i = 0; i < frames; i++)
      await new Promise<void>((resolve) =>
        engine.onEndFrameObservable.addOnce(() => resolve()),
      );
    collecting = false;
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    return {
      count,
      layout: screenLayout ? "screen" : "mixed",
      sampleFrames: updates.length,
      activeContacts: new Set(
        scene
          .getActiveMeshes()
          .data.slice(0, scene.getActiveMeshes().length)
          .flatMap((mesh) => {
            let node: import("@babylonjs/core/node").Node | null = mesh;
            while (node) {
              if (node.metadata?.remoteShipId)
                return [node.metadata.remoteShipId as string];
              node = node.parent;
            }
            return [];
          }),
      ).size,
      readyMs,
      viewport: [engine.getRenderWidth(), engine.getRenderHeight()],
      backend: engine.getClassName(),
      driver: engine.getGlInfo(),
      updateMs: distribution(updates),
      renderMs: distribution(renders),
      frameMs: distribution(intervals),
      draws: instrument.drawCallsCounter.current,
      indices: scene.getActiveIndices(),
      meshes: scene.meshes.length,
      activeMeshes: scene.getActiveMeshes().length,
      nodes: scene.transformNodes.length,
      materials: scene.materials.length,
      textures: scene.textures.length,
      assets: {
        requests: resources.length,
        transfer: resources.reduce((n, r) => n + r.transferSize, 0),
        decoded: resources.reduce((n, r) => n + r.decodedBodySize, 0),
      },
      prototypes: remote.diagnostics().prototypes,
      tiers: remote
        .diagnostics()
        .ships.reduce<Record<string, number>>(
          (n, s) => ((n[s.tier] = (n[s.tier] ?? 0) + 1), n),
          {},
        ),
      errors,
    };
  };
  Object.assign(review, { scene, remote, camera, engine });
  review.ready = true;
  document.getElementById("hud")!.textContent =
    `${count} exact authored ships. Ready in ${Math.round(readyMs)} ms. Call __fleetPerformance.sample().`;
}
main().catch((e) => {
  review.error = String(e?.stack ?? e);
  review.ready = true;
  document.getElementById("hud")!.textContent = review.error;
});
