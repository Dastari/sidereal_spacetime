import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Material } from "@babylonjs/core/Materials/material";
import { planetRecipe } from "@sidereal/content/environment";
import type { NativePlanetKit } from "./native-planet-composition";
import { buildNativeVolcanicData } from "./native-volcanic-build";
import { createPlanetWorkerClient } from "./planet-worker-client";
import { createNativeVolcanicLODRuntime } from "./native-volcanic-lod-runtime";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("keeps volcanic LOD visible until compiled, retains it, and shares distinct lava materials without resetting animation", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const names = [
    "a",
    "b",
    "c",
    "pillar",
    "crater",
    "molten-core",
    "sealing-core",
    "fall",
    "macro-a",
    "macro-b",
    "basin",
  ];
  const kit: NativePlanetKit = {
    schema: "sidereal.native-planet-kit.v1",
    layout: "volcanic-geology",
    materials: Array.from({ length: 6 }, (_, i) => ({
      name: `role${i}`,
      linearColor: [0.1, 0.04, 0.02],
      roughness: 0.4,
    })),
    variants: names.map((name, i) => ({
      name,
      positions: [0, 0, 0.5, 0.4, 0, -0.5, 0, 0.4, -0.5],
      indices: [0, 1, 2],
      triangleMaterials: [i === 5 ? 3 : i === 10 ? 5 : 0],
    })),
  };
  const recipe = { ...planetRecipe("volcanic", 89), resolution: 64 };
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  const compile = vi
    .spyOn(Material.prototype, "forceCompilationAsync")
    .mockResolvedValue();
  const worker = createPlanetWorkerClient();
  const build = vi
    .spyOn(worker, "nativeVolcanic")
    .mockImplementation(async (_, r, lod) =>
      buildNativeVolcanicData(kit, r, lod),
    );
  const planet = createNativeVolcanicLODRuntime(
    scene,
    "cinder",
    recipe,
    kit,
    "volcanic-r018",
    worker,
    () => {},
  );
  const pump = async () => {
    for (let i = 0; i < 120; i++) {
      await Promise.resolve();
      frames.shift()?.(i);
    }
  };
  planet.updateLOD(2, 20);
  await pump();
  planet.updateLOD(2, 20);
  expect(planet.snapshot().active).toBe(2);
  const low = planet.root.getChildMeshes().filter((m) => m.isEnabled());
  expect(low.length).toBeGreaterThan(0);
  const lava = low.find(
    (m) => m.material?.name === "cinder-molten-material-3",
  )!.material!;
  const moltenTexture = (
    lava as import("@babylonjs/core/Materials/PBR/pbrMaterial").PBRMaterial
  ).emissiveTexture!;
  const vent = low.find(
    (m) => m.material?.name === "cinder-molten-material-5",
  )!.material!;
  expect(lava).not.toBe(vent);
  planet.updateWeather(4, false);
  const color = (
    lava as import("@babylonjs/core/Materials/PBR/pbrMaterial").PBRMaterial
  ).emissiveColor.clone();
  planet.updateLOD(1, 60);
  expect(low.every((m) => m.isEnabled())).toBe(true);
  await pump();
  expect(low.every((m) => m.isEnabled())).toBe(true);
  expect(
    (
      lava as import("@babylonjs/core/Materials/PBR/pbrMaterial").PBRMaterial
    ).emissiveColor.equals(color),
  ).toBe(true);
  planet.updateLOD(1, 60);
  expect(low.every((m) => !m.isEnabled() && !m.isDisposed())).toBe(true);
  expect(
    planet.root
      .getChildMeshes()
      .find((m) => m.isEnabled() && m.material === lava),
  ).toBeTruthy();
  expect(compile).toHaveBeenCalled();
  const count = build.mock.calls.length;
  planet.updateLOD(2, 20);
  expect(low.every((m) => m.isEnabled())).toBe(true);
  expect(build.mock.calls.length).toBe(count);
  expect(
    planet.root.getChildMeshes().every((m) => m.metadata.role === "planet"),
  ).toBe(true);
  planet.dispose();
  worker.dispose();
  expect(scene.materials.includes(lava)).toBe(false);
  expect(scene.materials.includes(vent)).toBe(false);
  expect(scene.textures.includes(moltenTexture)).toBe(false);
  scene.dispose();
  engine.dispose();
});
