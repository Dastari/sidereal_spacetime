import { afterEach, expect, test, vi } from "vitest";
import { CanvasUI } from "./toolkit";
import { drawSteeringControls } from "./controls-menu";
import type { SteeringStyle } from "./control-settings";
afterEach(() => vi.unstubAllGlobals());
test("the shared native controls select one steering style, preserve bounds and can be read-only", () => {
  vi.stubGlobal(
    "Image",
    class {
      complete = false;
    },
  );
  const noop = () => {};
  const ctx = new Proxy(
    {
      measureText: (s: string) => ({ width: s.length * 7 }),
      createLinearGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (object, key) => Reflect.get(object, key) ?? noop,
      set: (object, key, value) => Reflect.set(object, key, value),
    },
  );
  const ui = Object.assign(Object.create(CanvasUI.prototype), {
    ctx,
    hits: [],
    focus: "",
    hover: "",
    opacity: 0.94,
  }) as CanvasUI;
  let style: SteeringStyle = "cursor";
  const change = vi.fn((next: SteeringStyle) => (style = next));
  const rect = { x: 20, y: 20, w: 240, h: 180 };
  drawSteeringControls(ui, rect, style, change);
  expect(ui.hits.map((h) => h.id)).toEqual([
    "steering-cursor",
    "steering-keyboard",
  ]);
  for (const hit of ui.hits) {
    expect(hit.rect.x + hit.rect.w).toBeLessThanOrEqual(rect.x + rect.w);
    expect(hit.rect.y + hit.rect.h).toBeLessThanOrEqual(rect.y + rect.h);
  }
  ui.hits[1].action!();
  expect(style).toBe("keyboard");
  expect(change).toHaveBeenCalledWith("keyboard");
  ui.hits = [];
  drawSteeringControls(ui, rect, style);
  expect(ui.hits.every((h) => h.disabled)).toBe(true);
});
