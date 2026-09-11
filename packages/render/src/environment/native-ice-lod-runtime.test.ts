import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Material } from "@babylonjs/core/Materials/material";
import { planetRecipe } from "../../../content/src/environment";
import type { NativePlanetKit } from "./native-planet-composition";
import { createPlanetWorkerClient } from "./planet-worker-client";
import { createNativeIceLODRuntime } from "./native-ice-lod-runtime";
import {
  createNativePlanetCache,
  createNativeIcePlanet,
} from "./native-planet";
import { buildNativeIceData } from "./native-ice-build";
const form = {
  positions: [-0.5, -0.5, -0.4, 0.5, -0.5, -0.4, 0.5, 0.5, 0.4, -0.5, 0.5, 0.4],
  indices: [0, 1, 2, 0, 2, 3],
  triangleMaterials: [0, 0],
};
const kit: NativePlanetKit = {
  schema: "sidereal.native-planet-kit.v1",
  layout: "glacial-interior",
  materials: [{ name: "snow", linearColor: [1, 1, 1], roughness: 0.83 }],
  variants: [
    "snow-a",
    "snow-b",
    "snow-c",
    "ice-a",
    "ice-b",
    "floor",
    "sealing-core",
  ].map((name) => ({ ...form, name })),
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("preserves native ice geometry and optics exactly at GPU precision", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    recipe = planetRecipe("ice", 47);
  const legacy = createNativeIcePlanet(
    scene,
    "reference",
    recipe,
    2,
    kit,
    createNativePlanetCache(kit),
  );
  const data = buildNativeIceData(kit, recipe, 2),
    mesh = legacy.root.getChildMeshes()[0];
  expect([...data.batches[0].positions]).toEqual(
    Array.from(mesh.getVerticesData("position")!, Math.fround),
  );
  expect([...data.batches[0].normals]).toEqual(
    Array.from(mesh.getVerticesData("normal")!, Math.fround),
  );
  expect([...data.batches[0].optics]).toEqual(
    Array.from(mesh.getVerticesData("iceOptics")!, Math.fround),
  );
  expect([...data.batches[0].indices]).toEqual(Array.from(mesh.getIndices()!));
  legacy.dispose();
  scene.dispose();
  engine.dispose();
});
it("publishes ice only after compilation, retains lower LOD and shares materials", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  const compile = vi
    .spyOn(Material.prototype, "forceCompilationAsync")
    .mockResolvedValue();
  const worker = createPlanetWorkerClient(),
    build = vi.spyOn(worker, "nativeIce");
  const planet = createNativeIceLODRuntime(
    scene,
    "frost",
    planetRecipe("ice", 47),
    kit,
    worker,
    () => {},
  );
  const pump = async () => {
    for (let i = 0; i < 100; i++) {
      await Promise.resolve();
      frames.shift()?.(i);
    }
  };
  planet.updateLOD(2, 20);
  await pump();
  planet.updateLOD(2, 20);
  const low = planet.root.getChildMeshes()[0];
  expect(low.isEnabled()).toBe(true);
  planet.updateLOD(0, 200);
  await pump();
  expect(low.isEnabled()).toBe(true);
  planet.updateLOD(0, 200);
  expect(low.isEnabled()).toBe(false);
  expect(low.isDisposed()).toBe(false);
  const high = planet.root.getChildMeshes().find((m) => m.isEnabled())!;
  expect(high.material).toBe(low.material);
  expect(compile).toHaveBeenCalled();
  const calls = build.mock.calls.length;
  planet.updateLOD(2, 20);
  expect(low.isEnabled()).toBe(true);
  expect(build.mock.calls.length).toBe(calls);
  expect(
    planet.root.getChildMeshes().every((m) => m.metadata.role === "planet"),
  ).toBe(true);
  const material = low.material;
  planet.dispose();
  worker.dispose();
  expect(scene.materials.includes(material!)).toBe(false);
  scene.dispose();
  engine.dispose();
});
