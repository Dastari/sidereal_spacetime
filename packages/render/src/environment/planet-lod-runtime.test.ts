import { expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Material } from "@babylonjs/core/Materials/material";
import { planetRecipe } from "@sidereal/content/environment";
import { buildPlanetData, buildPlanetWeather } from "./planet-build";
import { createPlanetLODRuntime } from "./planet-lod-runtime";
it("precompiles retained levels with shared body materials and disposes ownership once", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (i: number) => frames.delete(i));
  const compile = vi
    .spyOn(Material.prototype, "forceCompilationAsync")
    .mockResolvedValue();
  const recipe = {
    ...planetRecipe("temperate", 17),
    resolution: 12,
    cloudCoverage: 0,
  };
  const worker = {
    nativeIce: async () => {
      throw new Error("not used");
    },
    nativeVolcanic: async () => {
      throw new Error("not used");
    },
    nextFrame: () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    build: async (_: unknown, lod: 0 | 1 | 2) => buildPlanetData(recipe, lod),
    weather: async (_: unknown, lod: 0 | 1 | 2, phase: number) =>
      buildPlanetWeather(recipe, lod, phase),
    snapshot: () => ({
      pendingBuilds: 0,
      pendingWeatherBuilds: 0,
      lastBuildMs: 0,
    }),
    dispose() {},
  };
  const planet = createPlanetLODRuntime(scene, "test", recipe, worker);
  const pump = async () => {
    for (let i = 0; i < 80; i++) {
      await Promise.resolve();
      const work = [...frames];
      frames.clear();
      for (const [, cb] of work) cb(i);
    }
  };
  planet.updateLOD(2, 20);
  await pump();
  planet.updateLOD(2, 20);
  expect(planet.snapshot().active).toBe(2);
  const low = planet.root
    .getChildMeshes()
    .find((m) => m.metadata?.voxelPlanet)!;
  expect(low.isEnabled()).toBe(true);
  planet.updateLOD(1, 60);
  expect(low.isEnabled()).toBe(true);
  await pump();
  planet.updateLOD(1, 60);
  expect(planet.snapshot().active).toBe(1);
  expect(low.isEnabled()).toBe(false);
  expect(low.isDisposed()).toBe(false);
  const high = planet.root
    .getChildMeshes()
    .find((m) => m.metadata?.voxelPlanet && m !== low)!;
  expect(high.material).toBe(low.material);
  expect(high.isEnabled()).toBe(true);
  expect(compile).toHaveBeenCalled();
  const mat = high.material!;
  planet.dispose();
  expect(scene.materials.includes(mat)).toBe(false);
  expect(frames.size).toBe(0);
  compile.mockRestore();
  vi.unstubAllGlobals();
  scene.dispose();
  engine.dispose();
});
