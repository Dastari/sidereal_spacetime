import { afterEach, expect, test, vi } from "vitest";
import { CanvasUI } from "./toolkit";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test("every resized HUD texture is painted and uploaded before returning, even within the paint throttle", () => {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const events: string[] = [];
  const canvas = { clientWidth: 800, clientHeight: 600, setAttribute: vi.fn() };
  const texture = { scaleTo: vi.fn(() => events.push("resize")), update: vi.fn(() => events.push("upload")) };
  // Exercise the actual paint method without a WebGL context or DOM listeners.
  const ui = Object.assign(Object.create(CanvasUI.prototype), {
    canvas, texture, ctx: { setTransform: vi.fn(), clearRect: vi.fn() },
    scale: 1, revision: "", backingWidth: 1, backingHeight: 1,
    dirty: true, lastPaint: 999, disposed: false, hits: [], panels: [],
    draw: () => events.push("draw"),
  }) as CanvasUI;
  ui.paint();
  expect(events).toEqual(["resize", "draw", "upload"]);
  events.length = 0;
  for (let i = 0; i < 6; i++) {
    canvas.clientWidth += 10; now += 4; ui.paint();
    expect(events.splice(0)).toEqual(["resize", "draw", "upload"]);
  }
  ui.scale = 1.35; now += 1; ui.paint();
  expect(events.splice(0)).toEqual(["draw", "upload"]);
  expect(texture.scaleTo).toHaveBeenCalledTimes(7);
  ui.invalidate(); ui.paint();
  expect(events).toEqual([]); // unchanged viewport still uses the normal throttle
  now += 34; ui.paint();
  expect(events).toEqual(["draw", "upload"]);
});
