import { afterEach, expect, test, vi } from "vitest";
import { Scene } from "@babylonjs/core/scene";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HULL_ACCESS_SOURCE } from "@sidereal/content/hull-access-profile";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabConstructionDocument } from "@sidereal/sim/prefab-construction";
import { loadPrefabShipPresentation } from "./prefab-ship-presentation";
const fixtures = vi.hoisted(() => ({
  viewDispose: vi.fn(),
  exhaustDispose: vi.fn(),
  doorsDispose: vi.fn(),
  doors: vi.fn(),
}));
vi.mock("./prefab-ship/ship-view", () => ({
  createPrefabShipView: vi.fn(async (_scene, _doc, options) => ({
    root: options.parent,
    dispose: fixtures.viewDispose,
  })),
}));
vi.mock("./prefab-ship/exhaust", () => ({
  createShipExhaust: () => ({ dispose: fixtures.exhaustDispose }),
  prefabExhaustJets: vi.fn(),
}));
vi.mock("./prefab-ship/wayfarer-access-doors", () => ({
  createWayfarerHullAccessDoors: fixtures.doors,
}));
afterEach(() => vi.clearAllMocks());
const documentJson = JSON.stringify(
  prefabConstructionDocument(
    HULL_ACCESS_SOURCE,
    defaultPrefabComponentCatalog(),
  ),
);
test("a delayed door failure disposes previously prepared view and exhaust", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("visit", scene);
  let fail!: (error: Error) => void;
  fixtures.doors.mockImplementationOnce(
    () => new Promise((_resolve, reject) => (fail = reject)),
  );
  const load = loadPrefabShipPresentation(
    scene,
    root,
    documentJson,
    undefined,
    undefined,
    async () => Uint8Array.of(),
  );
  try {
    await vi.waitFor(() => expect(fixtures.doors).toHaveBeenCalledTimes(1));
    fail(Error("door fetch failed"));
    await expect(load).rejects.toThrow("door fetch failed");
    expect(fixtures.viewDispose).toHaveBeenCalledTimes(1);
    expect(fixtures.exhaustDispose).toHaveBeenCalledTimes(1);
    expect(root.metadata?.prefabView).toBeUndefined();
    expect(scene.onBeforeRenderObservable.observers).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
test("revocation while doors load releases all completed per-visit consumers", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("visit", scene);
  let finish!: (doors: { dispose: typeof fixtures.doorsDispose }) => void;
  fixtures.doors.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const load = loadPrefabShipPresentation(
    scene,
    root,
    documentJson,
    undefined,
    undefined,
    async () => Uint8Array.of(),
  );
  try {
    await vi.waitFor(() => expect(fixtures.doors).toHaveBeenCalledTimes(1));
    root.dispose();
    finish({ dispose: fixtures.doorsDispose });
    await expect(load).rejects.toThrow("load cancelled");
    expect(fixtures.doorsDispose).toHaveBeenCalledTimes(1);
    expect(fixtures.exhaustDispose).toHaveBeenCalledTimes(1);
    expect(fixtures.viewDispose).toHaveBeenCalledTimes(1);
    expect(scene.onBeforeRenderObservable.observers).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
