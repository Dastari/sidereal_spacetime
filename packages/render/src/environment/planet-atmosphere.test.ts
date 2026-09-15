import { PerformanceConfigurator } from "@babylonjs/core/Engines/performanceConfigurator";
import { expect, it } from "vitest";
import {
  NullEngine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Matrix,
  Effect,
  Color3,
  TransformNode,
} from "@babylonjs/core";
import { createPlanetAtmosphere } from "./planet-atmosphere";

it("keeps the atmosphere centered while orbiting a distant parented planet", () => {
  // NullEngine calls its base constructor without WebGL options; initialize the
  // tracked shared scratch matrices just as the real large-world engine does.
  PerformanceConfigurator.SetMatrixPrecision(true);
  const engine = new NullEngine({
    renderWidth: 1574,
    renderHeight: 907,
    textureSize: 64,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
    useHighPrecisionMatrix: true,
  });
  const scene = new Scene(engine, { useFloatingOrigin: true });
  const center = new Vector3(24701760.125, -85, -8321590.375);
  const root = new TransformNode("body", scene);
  root.position.copyFrom(center);
  root.scaling.setAll(36);
  const camera = new ArcRotateCamera("observe", 0.4, 0.955, 180, center, scene);
  camera.fov = 0.5;
  camera.minZ = 0.1;
  camera.maxZ = 1600;
  const halo = createPlanetAtmosphere(scene, "test", 1, Color3.White(), 1);
  halo.mesh.parent = root;
  const uploaded = new Map<string, Matrix>();
  const effect = Object.create(Effect.prototype) as Effect;
  Object.assign(effect, {
    _pipelineContext: new Proxy(
      {},
      {
        get: (_target, name) =>
          name === "setMatrix"
            ? (key: string, m: Matrix) =>
                uploaded.set(
                  key,
                  Matrix.FromArray(new Float32Array(m.asArray())),
                )
            : () => {},
      },
    ),
  });
  try {
    for (let step = 0; step < 40; step++) {
      camera.alpha = step * 0.17;
      scene.render();
      scene.resetCachedMaterial();
      halo.material.bind(halo.mesh.computeWorldMatrix(true), halo.mesh, effect);
      const projection =
        uploaded.get("worldViewProjection") ??
        uploaded.get("world")!.multiply(uploaded.get("viewProjection")!);
      const actual = Vector3.TransformCoordinates(Vector3.Zero(), projection);
      expect(Math.hypot(actual.x, actual.y)).toBeLessThan(0.0001);
    }
  } finally {
    halo.material.dispose();
    scene.dispose();
    engine.dispose();
  }
});
