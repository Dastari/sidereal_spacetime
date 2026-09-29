import { expect, test, vi } from "vitest";
import { drawRenderBackendMenu } from "./render-backend-menu";
import { createRenderBackendPreference } from "@sidereal/render/render-backend";
import type { CanvasUI } from "./toolkit";

test("renderer selection saves a preference before an explicit reload action", () => {
  const store = { getItem: () => null, setItem: vi.fn() };
  // Auto on a browser without WebGPU renders WebGL2.
  const preference = createRenderBackendPreference("webgl", "auto", store);
  const buttons = new Map<string, () => void>(),
    labels = new Map<string, string>(),
    apply = vi.fn();
  const ui = {
    text: vi.fn(),
    paragraph: vi.fn(),
    button: (id: string, label: string, _rect: unknown, click: () => void) => {
      buttons.set(id, click);
      labels.set(id, label);
    },
  } as unknown as CanvasUI;
  const draw = () =>
    drawRenderBackendMenu(
      ui,
      { x: 0, y: 0, w: 420, h: 190 },
      { state: preference.snapshot(), set: preference.set, apply },
    );
  draw();
  expect([...labels.values()]).toEqual(["Auto", "WebGPU", "WebGL2"]);
  expect(buttons.has("graphics-renderer-apply")).toBe(false);
  buttons.get("graphics-renderer-webgl")!();
  draw();
  expect(buttons.has("graphics-renderer-apply")).toBe(false);
  buttons.get("graphics-renderer-webgpu")!();
  expect(store.setItem).toHaveBeenCalled();
  expect(preference.snapshot().active).toBe("webgl");
  expect(apply).not.toHaveBeenCalled();
  buttons.clear();
  draw();
  buttons.get("graphics-renderer-apply")!();
  expect(apply).toHaveBeenCalledOnce();
});

test("the compact F3 renderer group registers only controls inside the scroll viewport", () => {
  const preference = createRenderBackendPreference("webgpu", "auto", {
    getItem: () => null,
    setItem: vi.fn(),
  });
  const ids: string[] = [];
  const texts: string[] = [];
  const ui = {
    text: (value: string) => texts.push(value),
    paragraph: vi.fn(),
    button: (id: string) => ids.push(id),
  } as unknown as CanvasUI;
  drawRenderBackendMenu(
    ui,
    { x: 0, y: 0, w: 320, h: 158 },
    { state: preference.snapshot(), set: preference.set, apply: vi.fn() },
    { compact: true, visible: (b) => b.y >= 30 },
  );
  expect(ids).toEqual([]);
  expect(texts).toContain("Active: WebGPU (Auto)");
});
