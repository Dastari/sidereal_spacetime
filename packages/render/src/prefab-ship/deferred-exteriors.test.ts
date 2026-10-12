import { prefabById } from "@sidereal/content/prefabs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { loadDeferredExterior } from "./deferred-exteriors";
import {
  createRemoteShipExteriors,
  resolvePublishedExterior,
  type RemoteShipSnapshot,
} from "./remote-exteriors";
import { createPrefabShipView } from "./ship-view";
vi.mock("./ship-view", () => ({ createPrefabShipView: vi.fn() }));
const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks();
  vi.mocked(createPrefabShipView).mockReset();
});
function setup() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const resolved = resolvePublishedExterior(
    "prefab:fed.s.wren-fleet",
    BigInt(prefabById("fed.s.wren-fleet")!.revision),
  )!;
  // This pin's actual bundled revision may advance; resolve then require exact.
  resolved.exact = true;
  const build = vi
    .mocked(createPrefabShipView)
    .mockImplementation(async (s, doc, options) => {
      const root = new TransformNode("native:prefab-frame", s);
      root.parent = options?.parent ?? null;
      const mesh = CreateBox("native-hull", {}, s);
      mesh.parent = root;
      mesh.material = new PBRMaterial("native", s);
      return { root, dispose: () => root.dispose(false, true) } as Awaited<
        ReturnType<typeof createPrefabShipView>
      >;
    });
  return { scene, resolved, build };
}
test("140 distant consumers allocate proxies without loading native assets; native demand is shared", async () => {
  const { scene, resolved, build } = setup();
  const prototype = await loadDeferredExterior(scene, resolved);
  const consumers = Array.from({ length: 140 }, (_, i) =>
    prototype.instantiate(new TransformNode(`contact-${i}`, scene), String(i)),
  );
  expect(build).not.toHaveBeenCalled();
  expect(consumers.every((c) => c.proxy.getChildMeshes().length > 0)).toBe(
    true,
  );
  const first = prototype.ensureFull!(),
    second = prototype.ensureFull!();
  expect(first).toBe(second);
  expect(await first).toBe(true);
  expect(build).toHaveBeenCalledTimes(1);
  consumers[0].prepareFull!();
  consumers[1].prepareFull!();
  const a = consumers[0].full.getChildMeshes()[0],
    b = consumers[1].full.getChildMeshes()[0];
  expect(a.geometry).toBe(b.geometry);
  expect(a.material).toBe(b.material);
  expect(prototype.sources.every((m) => !m.isVisible)).toBe(true);
  consumers[0].releaseFull!();
  expect(consumers[1].full.getChildMeshes()).toHaveLength(1);
  prototype.dispose();
  for (const c of consumers) {
    c.full.parent!.dispose();
  }
});
test("source disposal during native loading disposes late results", async () => {
  const { scene, resolved, build } = setup();
  const original = build.getMockImplementation()!;
  let complete!: () => void;
  const gate = new Promise<void>((r) => (complete = r));
  build.mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  const prototype = await loadDeferredExterior(scene, resolved),
    pending = prototype.ensureFull!();
  prototype.dispose();
  complete();
  expect(await pending).toBe(false);
  expect(scene.meshes).toHaveLength(0);
});
test("own warm cancellation stops immediately while another contact retains shared native demand", async () => {
  const { scene, resolved, build } = setup();
  const original = build.getMockImplementation()!;
  let complete!: () => void;
  const gate = new Promise<void>((r) => (complete = r));
  build.mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  const listeners = new Set<() => void>();
  let rows = ["own", "peer"];
  const snapshot = (): RemoteShipSnapshot => ({
    epoch: 1,
    shipMotion: rows.map((shipId) => ({ shipId })),
    shipDescription: rows.map((shipId) => ({
      shipId,
      publishedExteriorAssetId: "pin",
      appearanceRevision: 1n,
    })),
  });
  const store = {
    getSnapshot: snapshot,
    subscribeTable: (_table: string, callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    sampleShip: () => ({ x: 0, y: 0, heading: 0 }),
  };
  const remote = createRemoteShipExteriors(scene, store, {
    localShipId: () => "own",
    resolve: () => resolved,
    load: loadDeferredExterior,
  });
  const warming = remote.warmLocal();
  await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
  rows = ["peer"];
  for (const listener of listeners) listener();
  await warming;
  complete();
  await Promise.resolve();
  await Promise.resolve();
  const camera = new FreeCamera("camera", new Vector3(0, 10, 0), scene);
  for (let i = 0; i < 3; i++) {
    remote.update({ x: 0, y: 0 }, i, camera, 1000);
    await Promise.resolve();
  }
  expect(remote.diagnostics().ships).toHaveLength(1);
  expect(build).toHaveBeenCalledTimes(1);
  remote.dispose();
  expect(scene.getTransformNodeByName("remote-ship-own")).toBeNull();
});

test.each(["document", "catalog", "nonexact", "standin"])(
  "%s changes retain eager admission semantics",
  async (mode) => {
    const f = setup(),
      resolved = { ...f.resolved };
    if (mode === "document")
      resolved.doc = { ...resolved.doc, name: "changed" };
    if (mode === "catalog")
      resolved.catalog = { ...resolved.catalog, get: () => undefined };
    if (mode === "nonexact") resolved.exact = false;
    if (mode === "nonexact") {
      await expect(loadDeferredExterior(f.scene, resolved)).rejects.toThrow(
        "exact published revision",
      );
      expect(f.build).not.toHaveBeenCalled();
      return;
    }
    const prototype = await loadDeferredExterior(f.scene, resolved, {
      standinComponents: mode === "standin",
    });
    expect(prototype.ensureFull).toBeUndefined();
    expect(f.build).toHaveBeenCalledTimes(1);
    prototype.dispose();
  },
);
