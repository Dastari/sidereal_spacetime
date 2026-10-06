/** Developer CPU benchmark, not a socket/client/server capacity qualification.
 * Run: npx tsx scripts/prefab-render-harness/fleet-reconcile-benchmark.ts [ships] [bursts]
 * Emits accepted-row callback cost; excludes SDK decoding, store sorting, UI and GPU work. */
import { performance } from "node:perf_hooks";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { prefabById } from "@sidereal/content/prefabs";
import {
  createRemoteShipExteriors,
  resolvePublishedExterior,
  type RemoteShipSnapshot,
} from "../../packages/render/src/prefab-ship/remote-exteriors";
const ships = Math.max(1, Math.min(140, Number(process.argv[2]) || 140));
const bursts = Math.max(1, Math.min(1000, Number(process.argv[3]) || 200));
const doc = prefabById("fed.s.wren-fleet")!;
const rows = Array.from({ length: ships }, (_, i) => ({ shipId: `ship-${i}` }));
let snapshot: RemoteShipSnapshot = {
  epoch: 1,
  shipMotion: rows,
  shipDescription: rows.map((p) => ({
    shipId: p.shipId,
    publishedExteriorAssetId: `prefab:${doc.id}`,
    appearanceRevision: BigInt(doc.revision),
  })),
};
const listeners = new Set<() => void>();
const engine = new NullEngine();
const scene = new Scene(engine);
let resolves = 0;
const remote = createRemoteShipExteriors(
  scene,
  {
    getSnapshot: () => snapshot,
    subscribeTable: (_table, listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    sampleShip: () => ({ x: 0, y: 0, heading: 0 }),
  },
  {
    localShipId: () => undefined,
    resolve: (asset, revision) => {
      resolves++;
      return resolvePublishedExterior(asset, revision);
    },
    load: async (_scene, resolved) => ({
      key: resolved.key,
      exact: true,
      radius: 8,
      sources: [],
      theme: resolved.doc.theme,
      nozzles: [],
      metrics: { exteriorMeshes: 0, exteriorTriangles: 0, proxyTriangles: 0 },
      instantiate: (parent, id) => {
        const full = new TransformNode(`${id}:full`, scene);
        const proxy = new TransformNode(`${id}:proxy`, scene);
        full.parent = proxy.parent = parent;
        return { full, proxy };
      },
      dispose: () => {},
    }),
  },
);
try {
  await remote.settled();
  const burst = () => {
    for (let i = 0; i < ships; i++) {
      snapshot = { ...snapshot, shipMotion: [...rows] };
      for (const listener of listeners) listener();
    }
  };
  for (let i = 0; i < 20; i++) burst();
  resolves = 0;
  const samples: number[] = [];
  for (let i = 0; i < bursts; i++) {
    const start = performance.now();
    burst();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const at = (p: number) =>
    samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
  console.log(
    JSON.stringify({
      ships,
      bursts,
      rowCallbacks: ships * bursts,
      resolveCalls: resolves,
      burstMs: {
        p50: at(0.5),
        p95: at(0.95),
        p99: at(0.99),
        mean: samples.reduce((a, b) => a + b, 0) / samples.length,
      },
    }),
  );
} finally {
  remote.dispose();
  engine.dispose();
}
