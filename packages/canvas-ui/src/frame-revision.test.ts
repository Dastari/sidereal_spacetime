import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { CanvasUI } from "./toolkit";
import { groundLootRevision } from "./ground-loot";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve() },
    removeEventListener() {},
  });
  const ctx = { setTransform() {}, clearRect() {} };
  const engine = new NullEngine();
  vi.spyOn(engine, "createCanvas").mockReturnValue({
    width: 800,
    height: 600,
    getContext: () => ctx,
    remove() {},
  } as never);
  const scene = new Scene(engine);
  const camera = new FreeCamera("frame", new Vector3(0, 2, -8), scene);
  camera.setTarget(Vector3.Zero());
  const canvas = {
    clientWidth: 800,
    clientHeight: 600,
    style: {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
  } as unknown as HTMLCanvasElement;
  const ui = new CanvasUI(canvas, scene);
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return {
    engine,
    scene,
    camera,
    ui,
    advance: () => {
      now += 16;
    },
    dispose() {
      ui.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
test("a projection change repaints in the current camera frame, with no stale transform or30Hz skip", () => {
  const f = fixture();
  const samples: number[] = [];
  f.ui.frameRevision = () =>
    String(
      Vector3.Project(
        Vector3.Zero(),
        Matrix.IdentityReadOnly,
        f.scene.getTransformMatrix(),
        f.camera.viewport.toGlobal(800, 600),
      ).x,
    );
  f.ui.draw = () => {
    samples.push(Number(f.ui.frameRevision()));
  };
  for (let i = 0; i < 4; i++) {
    f.camera.position.x = i;
    f.scene.render();
    f.advance();
  }
  expect(samples).toHaveLength(4);
  expect(new Set(samples).size).toBe(4);
  expect(samples.at(-1)).toBe(Number(f.ui.frameRevision()));
  f.dispose();
});
test("stationary world projections stay dirty-driven; reach loss and removal paint immediately", () => {
  const f = fixture();
  let rows = [
    {
      id: "item",
      definitionId: "scanner",
      x: 100,
      y: 200,
      reachable: true,
      localX: 0,
      localY: 0,
    },
  ];
  f.ui.frameRevision = () => groundLootRevision(rows);
  const draw = vi.fn();
  f.ui.draw = draw;
  f.ui.paint();
  f.advance();
  f.ui.paint();
  expect(draw).toHaveBeenCalledTimes(1);
  rows = [{ ...rows[0], reachable: false }];
  f.ui.paint();
  expect(draw).toHaveBeenCalledTimes(2);
  rows = [];
  f.ui.paint();
  expect(draw).toHaveBeenCalledTimes(3);
  f.ui.paint();
  expect(draw).toHaveBeenCalledTimes(3);
  f.dispose();
});
test("unrelated static updates retain HUD cadence and resize still uploads immediately", () => {
  const f = fixture();
  const draw = vi.fn();
  f.ui.draw = draw;
  f.ui.paint();
  f.advance();
  f.ui.invalidate();
  f.ui.paint();
  expect(draw).toHaveBeenCalledTimes(1);
  f.ui.scale = 1.5;
  f.ui.paint();
  expect(draw).toHaveBeenCalledTimes(2);
  f.ui.dispose();
  f.scene.onBeforeCameraRenderObservable.notifyObservers(f.camera);
  expect(draw).toHaveBeenCalledTimes(2);
  f.dispose();
});
