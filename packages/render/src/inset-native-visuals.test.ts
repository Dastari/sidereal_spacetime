import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { CONSTRUCTION_INSET_VISUALS } from "@sidereal/content/construction-inset-visuals";
import { loadInsetNativeVisuals } from "./inset-native-visuals";
const parts = CONSTRUCTION_INSET_VISUALS.parts;
const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("owner", scene);
  const containers: AssetContainer[] = [];
  const fetcher = vi.fn(async (url: string) => {
    const bytes = readFileSync("apps/client/public" + url);
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const loader = vi
    .spyOn(SceneLoader, "LoadAssetContainerAsync")
    .mockImplementation(async () => {
      const c = new AssetContainer(scene),
        node = new TransformNode("imported-transform", scene);
      node.position.set(2, 3, 4);
      const box = CreateBox("native", {}, scene);
      box.parent = node;
      box.position.x = 0.25;
      box.material = new PBRMaterial("native-pbr", scene);
      c.meshes.push(box);
      c.transformNodes.push(node);
      c.materials.push(box.material);
      c.removeAllFromScene();
      containers.push(c);
      return c;
    });
  return { scene, parent, containers, fetcher, loader };
}
const request = (id: string, key = parts[0].key) => ({
  id,
  key,
  originM: [10, 20, 6] as [number, number, number],
  quarterTurns: 1,
});
it("loads a shared source once and preserves bind transforms, material and independent roots", async () => {
  const f = setup();
  const result = await loadInsetNativeVisuals(f.scene, f.parent, [
    request("a"),
    { ...request("b"), yawRadians: Math.PI / 4 },
  ]);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.loader).toHaveBeenCalledTimes(1);
  expect(result.roots).toHaveLength(2);
  expect(result.roots[0].position.asArray()).toEqual([10, 6, -20]);
  expect(result.roots[1].rotationQuaternion!.toEulerAngles().y).toBeCloseTo(
    Math.PI / 4,
  );
  expect(result.meshes[0].position.asArray()).toEqual([2.25, 3, 4]);
  expect(result.meshes[0].geometry).toBe(result.meshes[1].geometry);
  expect(result.meshes[0].material).toBe(result.meshes[1].material);
  result.roots[0].setEnabled(false);
  expect(result.roots[1].isEnabled()).toBe(true);
  expect(result.meshes[0].metadata.role).toBe("wall");
  result.dispose();
  result.dispose();
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.scene.materials).toHaveLength(0);
  expect(f.parent.isDisposed()).toBe(false);
});
it("rejects unknown keys and transforms before fetch", async () => {
  const f = setup();
  for (const r of [
    request("a", "unknown"),
    { ...request("b"), quarterTurns: 4 },
    { ...request("yaw"), yawRadians: NaN },
    { ...request("c"), originM: [NaN, 0, 0] as [number, number, number] },
  ])
    await expect(
      loadInsetNativeVisuals(f.scene, f.parent, [r]),
    ).rejects.toThrow();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it("rejects altered bytes before import", async () => {
  const f = setup();
  f.fetcher.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
  });
  await expect(
    loadInsetNativeVisuals(f.scene, f.parent, [request("a")]),
  ).rejects.toThrow("hash mismatch");
  expect(f.loader).not.toHaveBeenCalled();
  expect(f.scene.meshes).toHaveLength(0);
});
it("cleans a prior import if a later load fails, exposing no partial placements", async () => {
  const f = setup();
  const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url: string) =>
    url === parts[1].url
      ? { ok: false, arrayBuffer: async () => new ArrayBuffer(0) }
      : original(url),
  );
  await expect(
    loadInsetNativeVisuals(f.scene, f.parent, [
      request("a"),
      request("b", parts[1].key),
    ]),
  ).rejects.toThrow("fetch failed");
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.scene.transformNodes).toEqual([f.parent]);
  expect(f.scene.materials).toHaveLength(0);
});
it("awaits in-flight import then disposes it when cancelled", async () => {
  const f = setup(),
    controller = new AbortController();
  const original = f.loader.getMockImplementation()!;
  f.loader.mockImplementation(async (...args) => {
    const container = await original(...args);
    controller.abort();
    return container;
  });
  await expect(
    loadInsetNativeVisuals(f.scene, f.parent, [request("a")], {
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.scene.transformNodes).toEqual([f.parent]);
  expect(f.scene.materials).toHaveLength(0);
});
