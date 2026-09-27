import { withSceneCoordinateContext } from "./scene-coordinate-context";
import { expect, it } from "vitest";
import {
  NullEngine,
  Scene,
  FreeCamera,
  Vector3,
  Matrix,
  Effect,
} from "@babylonjs/core";
import { FloatingOriginCurrentScene } from "@babylonjs/core/Materials/floatingOriginMatrixOverrides";

it("preserves main-world matrix uploads after a nested portrait render", () => {
  const engine = new NullEngine({
    renderWidth: 100,
    renderHeight: 100,
    textureSize: 64,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
    useHighPrecisionMatrix: true,
  });
  const world = new Scene(engine, { useFloatingOrigin: true });
  const camera = new FreeCamera(
    "world",
    new Vector3(24701760, 180, -100),
    world,
  );
  camera.setTarget(new Vector3(24701760, -85, 0));
  const portrait = new Scene(engine);
  new FreeCamera("portrait", new Vector3(0, 1, -5), portrait);
  const uploaded: number[][] = [];
  const effect = Object.create(Effect.prototype) as Effect;
  Object.assign(effect, {
    _pipelineContext: {
      setMatrix: (_name: string, matrix: Matrix) =>
        uploaded.push(Array.from(matrix.asArray())),
    },
  });
  const position = Matrix.Translation(24701760, -85, 0);
  const observer = world.onBeforeRenderObservable.add(() => {
    withSceneCoordinateContext(portrait, () => portrait.render());
    effect.setMatrix("world", position);
  });
  try {
    world.render();
    expect(FloatingOriginCurrentScene.getScene()).toBe(world);
    expect(uploaded[0][12]).toBeCloseTo(0, 6);
    expect(uploaded[0][13]).toBeCloseTo(-265, 6);
    expect(uploaded[0][14]).toBeCloseTo(100, 6);
  } finally {
    world.onBeforeRenderObservable.remove(observer);
    portrait.dispose();
    world.dispose();
    engine.dispose();
  }
});

it("restores the caller after disposal of another engine's last scene and after errors", () => {
  const engine = new NullEngine();
  const world = new Scene(engine, { useFloatingOrigin: true });
  const camera = new FreeCamera("world", new Vector3(12, 100, -30), world);
  camera.getViewMatrix(true);
  const getter = () => world;
  FloatingOriginCurrentScene.getScene = getter;
  FloatingOriginCurrentScene.eyeAtCamera = false;
  try {
    expect(() =>
      withSceneCoordinateContext(undefined, () => {
        expect(FloatingOriginCurrentScene.getScene()).toBeUndefined();
        expect(FloatingOriginCurrentScene.eyeAtCamera).toBe(true);
        const portraitEngine = new NullEngine();
        const portrait = new Scene(portraitEngine);
        portrait.dispose();
        portraitEngine.dispose();
        throw new Error("portrait failed");
      }),
    ).toThrow("portrait failed");
    expect(FloatingOriginCurrentScene.getScene).toBe(getter);
    expect(FloatingOriginCurrentScene.eyeAtCamera).toBe(false);
    let uploaded: Matrix | undefined;
    const effect = Object.create(Effect.prototype) as Effect;
    Object.assign(effect, {
      _pipelineContext: {
        setMatrix: (_name: string, matrix: Matrix) => {
          uploaded = matrix.clone();
        },
      },
    });
    effect.setMatrix("world", Matrix.Translation(10, 0, 0));
    expect(uploaded!.getTranslation().asArray()).toEqual([-2, -100, 30]);
  } finally {
    FloatingOriginCurrentScene.eyeAtCamera = true;
    world.dispose();
    engine.dispose();
  }
});
