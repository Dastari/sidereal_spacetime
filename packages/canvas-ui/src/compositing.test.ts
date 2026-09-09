import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CanvasUI } from "./toolkit";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("composites the existing HUD only after camera effects, without a second layer", () => {
  vi.stubGlobal("window", {
    innerWidth: 900,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve() },
    removeEventListener: vi.fn(),
  });
  const engine = new NullEngine();
  vi.spyOn(engine, "createCanvas").mockReturnValue({
    width: 1,
    height: 1,
    getContext: () => ({}),
    remove: vi.fn(),
  } as unknown as ReturnType<NullEngine["createCanvas"]>);
  const scene = new Scene(engine),
    camera = new FreeCamera("review", Vector3.Zero(), scene);
  const canvas = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    style: {},
  } as unknown as HTMLCanvasElement;
  const ui = new CanvasUI(canvas, scene),
    draw = vi.spyOn(ui.layer, "render").mockImplementation(() => {});
  const component = scene._getComponent("Layer") as unknown as {
    _drawCameraForegroundWithPostProcessing(camera: FreeCamera): void;
    _drawCameraForegroundWithoutPostProcessing(camera: FreeCamera): void;
  };
  component._drawCameraForegroundWithPostProcessing(camera);
  expect(draw).not.toHaveBeenCalled();
  component._drawCameraForegroundWithoutPostProcessing(camera);
  expect(draw).toHaveBeenCalledTimes(1);
  expect(scene.layers).toHaveLength(1);
  expect(scene.customRenderTargets).toHaveLength(0);
  ui.dispose();
  expect(scene.layers).toHaveLength(0);
  scene.dispose();
  engine.dispose();
});
