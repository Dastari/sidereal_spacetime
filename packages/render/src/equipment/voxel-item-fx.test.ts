import { afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { createVoxelFxPlayer } from "./voxel-item-fx";
const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks();
});
function setup(maxIdle = 4) {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine),
    parent = new TransformNode("owner", scene);
  const original = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
  const loader = vi
    .spyOn(SceneLoader, "LoadAssetContainerAsync")
    .mockImplementation((_base, file, s) =>
      original(
        "",
        "data:model/gltf-binary;base64," +
          readFileSync(
            new URL(
              "../../../../assets/runtime/crew/items/r001/" + String(file),
              import.meta.url,
            ),
          ).toString("base64"),
        s,
        undefined,
        ".glb",
      ),
    );
  vi.spyOn(engine, "getDeltaTime").mockReturnValue(100);
  const onMesh = vi.fn();
  const player = createVoxelFxPlayer(scene, parent, {
    maxLive: 4,
    maxIdle,
    onMesh,
  });
  const tick = (frames = 40) => {
    for (let i = 0; i < frames; i++)
      scene.onBeforeRenderObservable.notifyObservers(scene);
  };
  return { scene, parent, player, loader, onMesh, tick };
}
test("real authored clones reuse geometry, reset tint, pose and opacity, and retain separate concurrent materials", async () => {
  const { player, scene, onMesh, tick } = setup();
  await player.spawn("beam-lance", {
    at: Vector3.Zero(),
    direction: Vector3.Right(),
    lengthM: 40,
    tint: Color3.Red(),
    scale: 2,
    holdS: 0.1,
  });
  const first = player.meshes(),
    materials = first
      .map((m) => m.material)
      .filter((m): m is PBRMaterial => m instanceof PBRMaterial);
  tick();
  expect(player.count).toBe(0);
  await player.spawn("beam-lance", { at: new Vector3(3, 4, 5), holdS: 0.1 });
  expect(player.meshes()).toEqual(first);
  const root = scene.getTransformNodeByName("crew-fx:beam-lance")!;
  expect(root.position.asArray()).toEqual([3, 4, 5]);
  expect(root.rotationQuaternion!.asArray()).toEqual([0, 0, 0, 1]);
  expect(root.scaling.asArray()).toEqual([1, 1, 1]);
  expect(materials.some((m) => m.emissiveColor.equals(Color3.Red()))).toBe(
    false,
  );
  expect(materials.every((m) => m.alpha > 0)).toBe(true);
  await player.spawn("beam-lance", {
    at: Vector3.Zero(),
    tint: Color3.Green(),
    holdS: 0.1,
  });
  expect(
    player
      .meshes()
      .slice(first.length)
      .every(
        (m) => !m.material || !materials.includes(m.material as PBRMaterial),
      ),
  ).toBe(true);
  expect(onMesh).toHaveBeenCalledTimes(first.length * 2);
  tick();
  player.dispose();
  expect(scene.meshes).toHaveLength(0);
});
test("hundreds of identical authored bursts create one bundle after warmup", async () => {
  const { player, loader, onMesh, tick, scene } = setup();
  for (let i = 0; i < 200; i++) {
    await player.spawn("muzzle-flash", { at: Vector3.Zero() });
    tick(4);
  }
  expect(player.count).toBe(0);
  expect(loader).toHaveBeenCalledTimes(1);
  const clones = scene.meshes.filter((m) => m.name.startsWith("crew-fx:"));
  expect(onMesh).toHaveBeenCalledTimes(clones.length);
  expect(clones.length).toBeGreaterThan(0);
  player.dispose();
  expect(scene.meshes).toHaveLength(0);
});
test("global idle cap spans files and eviction callbacks fire once before parent disposal", async () => {
  const { player, tick, scene, parent } = setup(2),
    callbacks = Array.from({ length: 6 }, () => vi.fn());
  for (let i = 0; i < 6; i++)
    await player.spawn("beam-lance", {
      at: Vector3.Zero(),
      holdS: 0.1,
      onEnd: callbacks[i],
    });
  expect(player.count).toBe(4);
  expect(callbacks[0]).toHaveBeenCalledTimes(1);
  expect(callbacks[1]).toHaveBeenCalledTimes(1);
  tick();
  expect(callbacks.every((c) => c.mock.calls.length === 1)).toBe(true);
  for (const file of ["muzzle-flash", "impact-spark", "smoke-puff"]) {
    await player.spawn(file, { at: Vector3.Zero() });
    tick(100);
  }
  expect(
    scene.transformNodes.filter(
      (n) => n.parent === parent && n.name.startsWith("crew-fx:"),
    ).length,
  ).toBeLessThanOrEqual(2);
  parent.dispose();
  player.dispose();
  expect(player.count).toBe(0);
  expect(scene.meshes).toHaveLength(0);
  expect(
    scene.materials.filter((m) => m.name.startsWith("crew-fx:")),
  ).toHaveLength(0);
});
test("late asset completion after owner disposal publishes no effect", async () => {
  const f = setup();
  const original = f.loader.getMockImplementation()!;
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => (complete = resolve));
  f.loader.mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  const pending = f.player.spawn("muzzle-flash", { at: Vector3.Zero() });
  f.parent.dispose();
  complete();
  await pending;
  await Promise.resolve();
  expect(f.player.count).toBe(0);
  expect(f.scene.meshes).toHaveLength(0);
});

test("reused short flash retains its first rendered frame when delta exceeds its duration", async () => {
  const f = setup();
  await f.player.spawn("muzzle-flash", { at: Vector3.Zero() });
  f.tick(1);
  expect(f.player.count).toBe(1);
  f.tick(1);
  expect(f.player.count).toBe(0);
  await f.player.spawn("muzzle-flash", { at: Vector3.Zero() });
  f.tick(1);
  expect(f.player.count).toBe(1);
  f.tick(1);
  expect(f.player.count).toBe(0);
  f.player.dispose();
});

test.each(["parent", "player", "throw"])(
  "onMesh %s teardown leaves no cloned material or late effect",
  async (mode) => {
    const f = setup();
    f.player.dispose();
    const player = createVoxelFxPlayer(f.scene, f.parent, {
      onMesh: () => {
        if (mode === "parent") f.parent.dispose();
        else if (mode === "player") player.dispose();
        else throw Error("callback failed");
      },
    });
    if (mode === "throw")
      await expect(
        player.spawn("muzzle-flash", { at: Vector3.Zero() }),
      ).rejects.toThrow("callback failed");
    else await player.spawn("muzzle-flash", { at: Vector3.Zero() });
    player.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(player.count).toBe(0);
    expect(f.scene.meshes).toHaveLength(0);
    expect(
      f.scene.materials.filter((m) => m.name.startsWith("crew-fx:")),
    ).toHaveLength(0);
    const calls = f.loader.mock.calls.length;
    await player.spawn("muzzle-flash", { at: Vector3.Zero() });
    expect(f.loader).toHaveBeenCalledTimes(calls);
  },
);

test.each(["explicit", "parent", "scene"])(
  "%s teardown drains every effect when an onEnd throws",
  async (mode) => {
    const f = setup(),
      peerEnd = vi.fn();
    await f.player.spawn("muzzle-flash", {
      at: Vector3.Zero(),
      onEnd: () => {
        throw Error("callback failed");
      },
    });
    await f.player.spawn("muzzle-flash", {
      at: Vector3.Zero(),
      onEnd: peerEnd,
    });
    if (mode === "explicit")
      expect(() => f.player.dispose()).toThrow("callback failed");
    else if (mode === "parent") expect(() => f.parent.dispose()).not.toThrow();
    else expect(() => f.scene.dispose()).not.toThrow();
    f.player.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.player.count).toBe(0);
    expect(peerEnd).toHaveBeenCalledTimes(1);
    expect(f.scene.meshes).toHaveLength(0);
    expect(
      f.scene.materials.filter((m) => m.name.startsWith("crew-fx:")),
    ).toHaveLength(0);
  },
);
