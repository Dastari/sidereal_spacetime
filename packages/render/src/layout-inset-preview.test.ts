import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import type { loadInsetNativeVisuals } from "./inset-native-visuals";
import { createLayoutInsetPreview } from "./layout-inset-preview";
const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});
function input(clearHeight = 96) {
  const document = emptyLayout("async-preview", "main");
  document.decks[0].ceiling = 6 + clearHeight;
  document.decks[0].roof = true;
  document.tiles = [stampTile("floor", "main", "rectangle", [0, 0])];
  document.tiles[0].vertices = [
    [0, 0],
    [64, 0],
    [64, 64],
    [0, 64],
  ];
  document.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      name: "test",
      revision: "1",
      width: 64,
      length: 64,
      height: 112,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: clearHeight + 16,
      },
    ],
    boundaryTreatments: [],
  };
  return { document, compiled: compileLayout(document), deckId: "main" };
}
function setup() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  type View = Awaited<ReturnType<typeof loadInsetNativeVisuals>>;
  const jobs: {
    resolve: (v: View) => void;
    signal: AbortSignal | undefined;
    parent: TransformNode;
  }[] = [];
  const loader = vi.fn<typeof loadInsetNativeVisuals>(
    (_scene, parent, _requests, options) =>
      new Promise((resolve) =>
        jobs.push({ resolve, parent, signal: options?.signal }),
      ),
  );
  const report = vi.fn(),
    preview = createLayoutInsetPreview(scene, report, loader);
  const view = (job: number) => {
    const roots = ["wall", "roof", "floor"].map((role) => {
      const node = new TransformNode("loaded-" + role + "-" + job, scene);
      node.metadata = { role };
      node.parent = jobs[job].parent;
      return node;
    });
    const meshes = roots.map((root) => {
      const mesh = CreateBox(root.name + "-mesh", {}, scene);
      mesh.parent = root;
      return mesh;
    });
    const dispose = vi.fn(() => {
      for (const root of roots) root.dispose();
    });
    return { roots, meshes, dispose };
  };
  return { scene, jobs, loader, report, preview, view };
}
const visible = { wall: true, roof: true, floor: true };
it("disposes stale completion even when loader ignores abort", async () => {
  const f = setup();
  f.preview.update(input(), visible);
  f.preview.update(input(48), visible);
  expect(f.jobs).toHaveLength(2);
  expect(f.jobs[0].signal?.aborted).toBe(true);
  const current = f.view(1),
    stale = f.view(0);
  f.jobs[1].resolve(current);
  await Promise.resolve();
  f.jobs[0].resolve(stale);
  await f.preview.ready();
  expect(stale.dispose).toHaveBeenCalledTimes(1);
  expect(current.dispose).not.toHaveBeenCalled();
  expect(f.preview.meshes).toEqual(current.meshes);
  expect(
    f.report.mock.calls.filter(([s]) =>
      s.includes("physical qualification pending"),
    ),
  ).toHaveLength(1);
  f.preview.dispose();
  expect(current.dispose).toHaveBeenCalledTimes(1);
});
it("ready remains pending after disposal until ignored in-flight load completes, without late report", async () => {
  const f = setup();
  f.preview.update(input(), visible);
  const late = f.view(0);
  f.preview.dispose();
  const count = f.report.mock.calls.length;
  expect(f.jobs[0].signal?.aborted).toBe(true);
  let ready = false;
  const waiting = f.preview.ready().then(() => {
    ready = true;
  });
  await Promise.resolve();
  expect(ready).toBe(false);
  f.jobs[0].resolve(late);
  await waiting;
  expect(late.dispose).toHaveBeenCalledTimes(1);
  expect(f.report).toHaveBeenCalledTimes(count);
  expect(f.preview.meshes).toEqual([]);
  expect(f.scene.meshes).toHaveLength(0);
  f.preview.dispose();
});
it("changes visibility and camera origin without rebuilding and applies latest state to a pending completion", async () => {
  const f = setup(),
    draft = input();
  f.preview.update(draft, visible);
  f.preview.update(
    draft,
    { wall: false, roof: true, floor: false },
    [10, 20, 30],
  );
  const loaded = f.view(0);
  f.jobs[0].resolve(loaded);
  await f.preview.ready();
  expect(f.loader).toHaveBeenCalledTimes(1);
  expect(loaded.roots.map((r) => r.isEnabled())).toEqual([false, true, false]);
  expect(f.jobs[0].parent.position.asArray()).toEqual([-10, -20, -30]);
  f.preview.update(draft, visible, [1, 2, 3]);
  expect(f.loader).toHaveBeenCalledTimes(1);
  expect(loaded.roots.every((r) => r.isEnabled())).toBe(true);
  expect(f.jobs[0].parent.position.asArray()).toEqual([-1, -2, -3]);
  f.preview.dispose();
});
