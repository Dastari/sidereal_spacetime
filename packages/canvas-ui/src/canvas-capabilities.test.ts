import { afterEach, expect, it, vi } from "vitest";
import { CanvasUI } from "./toolkit";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("clipped controls intercept only the visible intersection in both axes", () => {
  const ui = Object.assign(Object.create(CanvasUI.prototype), {
    ctx: { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} },
    hits: [],
  }) as CanvasUI;
  ui.scrollRegion({ x: 10, y: 20, w: 80, h: 60 }, () => {
    ui.hits.push(
      { id: "partial", label: "partial", rect: { x: 0, y: 10, w: 50, h: 50 } },
      {
        id: "outside",
        label: "outside",
        rect: { x: 100, y: 30, w: 30, h: 30 },
      },
    );
  });
  expect(ui.hits.map((h) => h.id)).toEqual(["partial"]);
  expect(ui.hits[0].rect).toEqual({ x: 10, y: 20, w: 40, h: 40 });
});
it("composites a full-canvas UI and restores a cropped3D camera viewport", () => {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve() },
    removeEventListener() {},
  });
  const engine = new NullEngine();
  vi.spyOn(engine, "createCanvas").mockReturnValue({
    width: 1,
    height: 1,
    getContext: () => ({}),
    remove() {},
  } as never);
  const scene = new Scene(engine);
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    style: {},
  } as unknown as HTMLCanvasElement;
  const ui = new CanvasUI(canvas, scene);
  const cropped = new Viewport(0.2, 0.1, 0.6, 0.7);
  engine.setViewport(cropped);
  ui.layer!.onBeforeRenderObservable.notifyObservers(ui.layer!);
  expect(engine.currentViewport).toMatchObject({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  ui.layer!.onAfterRenderObservable.notifyObservers(ui.layer!);
  expect(engine.currentViewport).toMatchObject(cropped);
  expect(scene.layers).toHaveLength(1);
  ui.dispose();
  scene.dispose();
  engine.dispose();
});
it("raster entry uses the same painter/input lifecycle with no GPU and cancels on disposal", () => {
  const queue = vi.fn(() => 42),
    cancel = vi.fn(),
    handlers = new Map<string, Function>();
  vi.stubGlobal("requestAnimationFrame", queue);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("window", {
    addEventListener: (n: string, f: Function) => handlers.set(n, f),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve() },
    removeEventListener() {},
  });
  const context = {};
  const canvas = {
    getContext: () => context,
    addEventListener: (n: string, f: Function) => handlers.set(n, f),
    removeEventListener: vi.fn(),
    style: {},
  } as unknown as HTMLCanvasElement;
  const ui = new CanvasUI(canvas);
  expect(ui.ctx).toBe(context);
  expect(ui.layer).toBeUndefined();
  expect(queue).toHaveBeenCalledOnce();
  ui.dispose();
  expect(cancel).toHaveBeenCalledWith(42);
  ui.dispose();
  expect(cancel).toHaveBeenCalledOnce();
});
