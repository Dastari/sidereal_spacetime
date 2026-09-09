import { afterEach, expect, test, vi } from "vitest";
vi.mock("@babylonjs/core/Materials/Textures/dynamicTexture", () => ({
  DynamicTexture: class {
    getContext() {
      return {};
    }
  },
}));
vi.mock("@babylonjs/core/Layers/layer", () => ({
  Layer: class {
    dispose() {}
  },
}));
import { CanvasUI } from "./toolkit";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const handlers = new Map<string, Function>();
  vi.stubGlobal("window", {
    innerWidth: 900,
    addEventListener: (name: string, handler: Function) =>
      handlers.set(name, handler),
    removeEventListener() {},
  });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
  const canvas = {
    addEventListener: (name: string, handler: Function) =>
      handlers.set(name, handler),
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    focus() {},
    setPointerCapture() {},
    hasPointerCapture: () => true,
    releasePointerCapture() {},
    style: {},
  };
  const scene = {
    onBeforeRenderObservable: { add() {}, remove() {} },
    onDisposeObservable: { add() {} },
  };
  const ui = new CanvasUI(
    canvas as unknown as HTMLCanvasElement,
    scene as never,
  );
  const action = vi.fn(),
    drag = vi.fn(),
    drop = vi.fn(),
    context = vi.fn();
  ui.hits = [
    {
      id: "item",
      label: "Item",
      rect: { x: 10, y: 10, w: 100, h: 100 },
      action,
      drag,
      drop,
      context,
    },
  ];
  const pointer = (name: string, x: number, button = 0, shiftKey = false) =>
    handlers.get(name)!({
      clientX: x,
      clientY: 20,
      button,
      shiftKey,
      pointerId: 1,
      preventDefault() {},
      stopImmediatePropagation() {},
    });
  const key = (key: string, code: string, ctrlKey = false) =>
    handlers.get("keydown")!({
      key,
      code,
      ctrlKey,
      preventDefault() {},
      stopImmediatePropagation() {},
    });
  const wheel = (deltaX: number, deltaY: number, shiftKey = false) =>
    handlers.get("wheel")!({
      clientX: 20,
      clientY: 20,
      deltaX,
      deltaY,
      deltaMode: 0,
      shiftKey,
      preventDefault() {},
      stopImmediatePropagation() {},
    });
  return { ui, pointer, key, wheel, action, drag, drop, context };
}
test("trackpad and Shift-wheel preserve the horizontal scroll axis", () => {
  const f = setup();
  f.ui.panels = [{ x: 0, y: 0, w: 100, h: 100 }];
  f.ui.scroll = vi.fn();
  f.wheel(48, 0);
  expect(f.ui.scroll).toHaveBeenLastCalledWith(0, 20, 20, 48);
  f.wheel(0, 48, true);
  expect(f.ui.scroll).toHaveBeenLastCalledWith(0, 20, 20, 48);
  f.wheel(0, 48);
  expect(f.ui.scroll).toHaveBeenLastCalledWith(48, 20, 20, 0);
});
test("search typing accumulates before repaint and select-all clears or replaces the query", () => {
  const f = setup(),
    change = vi.fn();
  f.ui.hits = [
    {
      id: "search",
      label: "Search",
      rect: { x: 10, y: 10, w: 100, h: 40 },
      edit: { value: "", max: 60, change },
    },
  ];
  f.pointer("pointerdown", 20);
  f.pointer("pointerup", 20);
  for (const letter of "scanner") f.key(letter, "Key" + letter.toUpperCase());
  expect(change).toHaveBeenLastCalledWith("scanner");
  f.key("a", "KeyA", true);
  f.key("m", "KeyM");
  expect(change).toHaveBeenLastCalledWith("m");
  f.key("a", "KeyA", true);
  f.key("Backspace", "Backspace");
  expect(change).toHaveBeenLastCalledWith("");
  f.key("Enter", "Enter");
  expect(f.ui.keyboard).toBe(false);
});
test("slow one-pixel pointer movement crosses the drag threshold cumulatively", () => {
  const f = setup();
  f.pointer("pointerdown", 20);
  for (let x = 21; x <= 30; x++) f.pointer("pointermove", x);
  f.pointer("pointerup", 30);
  expect(f.drag.mock.calls.reduce((n, [dx]) => n + dx, 0)).toBe(10);
  expect(f.drop).toHaveBeenCalledWith(30, 20);
  expect(f.action).not.toHaveBeenCalled();
});
test("click jitter remains a click, Shift is retained and right-click opens actions", () => {
  const f = setup();
  f.pointer("pointerdown", 20, 0, true);
  f.pointer("pointermove", 21);
  f.pointer("pointerup", 21, 0, true);
  expect(f.drag).not.toHaveBeenCalled();
  expect(f.action).toHaveBeenCalledWith({
    x: 21,
    y: 20,
    button: 0,
    shiftKey: true,
  });
  f.pointer("pointerdown", 30, 2);
  expect(f.context).toHaveBeenCalledWith({
    x: 30,
    y: 20,
    button: 2,
    shiftKey: false,
  });
});
