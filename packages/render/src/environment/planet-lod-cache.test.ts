import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { createPlanetLODCache } from "./planet-lod-cache";
import type { PlanetLOD } from "./layered-planet";
it("keeps the old LOD visible until ready, swaps in update, and retains all levels", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const finish = new Map<
    PlanetLOD,
    (v: { root: ReturnType<typeof CreateSphere> }) => void
  >();
  const cache = createPlanetLODCache(
    (lod) =>
      new Promise<{ root: ReturnType<typeof CreateSphere> }>((resolve) =>
        finish.set(lod, resolve),
      ),
    (v) => v.root.dispose(),
  );
  const low = CreateSphere("low", {}, scene);
  low.metadata = { role: "planet" };
  low.setEnabled(false);
  cache.update(2, 20);
  finish.get(2)!({ root: low });
  await Promise.resolve();
  cache.update(2, 20);
  expect(low.isEnabled()).toBe(true);
  cache.update(2, 40);
  expect(finish.has(1)).toBe(true);
  expect(low.isEnabled()).toBe(true);
  cache.update(1, 60);
  expect(low.isEnabled()).toBe(true);
  const medium = CreateSphere("medium", {}, scene);
  medium.metadata = { role: "planet" };
  medium.setEnabled(false);
  finish.get(1)!({ root: medium });
  await Promise.resolve();
  expect(low.isEnabled()).toBe(true);
  expect(medium.isEnabled()).toBe(false);
  cache.update(1, 60);
  expect(low.isEnabled()).toBe(false);
  expect(medium.isEnabled()).toBe(true);
  expect(low.isDisposed()).toBe(false);
  cache.update(2, 20);
  expect(low.isEnabled()).toBe(true);
  expect(medium.isEnabled()).toBe(false);
  expect(cache.snapshot().retained.sort()).toEqual([1, 2]);
  cache.dispose();
  expect(low.isDisposed()).toBe(true);
  expect(medium.isDisposed()).toBe(true);
  scene.dispose();
  engine.dispose();
});
it("discards late completion after removal and never publishes an unwanted prefetched level", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  let complete!: (v: { root: ReturnType<typeof CreateSphere> }) => void;
  const cache = createPlanetLODCache(
    () =>
      new Promise<{ root: ReturnType<typeof CreateSphere> }>(
        (r) => (complete = r),
      ),
    (v) => v.root.dispose(),
  );
  cache.request(0);
  cache.dispose();
  const late = CreateSphere("late", {}, scene);
  late.metadata = { role: "planet" };
  late.setEnabled(false);
  complete({ root: late });
  await Promise.resolve();
  expect(late.isDisposed()).toBe(true);
  expect(cache.snapshot().active).toBeUndefined();
  scene.dispose();
  engine.dispose();
});
