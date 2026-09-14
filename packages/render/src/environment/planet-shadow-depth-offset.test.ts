import { expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { applyPlanetShadowDepthOffset } from "./planet-shadow-depth-offset";

test("shadow slope offset restores prior engine state on each mesh, unbind and disposal", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const light = new DirectionalLight("sun", Vector3.Down(), scene);
  const shadows = new ShadowGenerator(1024, light);
  const mesh = CreateBox("surface", {}, scene);
  mesh.metadata = { role: "planet" };
  let slope = 3, units = 7;
  vi.spyOn(engine, "getZOffset").mockImplementation(() => slope);
  vi.spyOn(engine, "getZOffsetUnits").mockImplementation(() => units);
  vi.spyOn(engine, "setZOffset").mockImplementation(value => { slope = value; });
  vi.spyOn(engine, "setZOffsetUnits").mockImplementation(value => { units = value; });
  const dispose = applyPlanetShadowDepthOffset(engine, shadows);
  try {
    shadows.onBeforeShadowMapRenderMeshObservable.notifyObservers(mesh);
    expect([slope, units]).toEqual([2, 2]);
    shadows.onAfterShadowMapRenderMeshObservable.notifyObservers(mesh);
    expect([slope, units]).toEqual([3, 7]);
    shadows.onBeforeShadowMapRenderMeshObservable.notifyObservers(mesh);
    shadows.getShadowMap()!.onAfterUnbindObservable.notifyObservers(shadows.getShadowMap()!);
    expect([slope, units]).toEqual([3, 7]);
    shadows.onBeforeShadowMapRenderMeshObservable.notifyObservers(mesh);
    dispose();
    expect([slope, units]).toEqual([3, 7]);
    shadows.onBeforeShadowMapRenderMeshObservable.notifyObservers(mesh);
    expect([slope, units]).toEqual([3, 7]);
    dispose();
  } finally {
    dispose(); vi.restoreAllMocks(); shadows.dispose(); scene.dispose(); engine.dispose();
  }
});
