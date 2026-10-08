import { afterEach, expect, test, vi } from "vitest";
const context = vi.hoisted(() => ({
  save() {},
  restore() {},
  beginPath() {},
  moveTo() {},
  lineTo() {},
  closePath() {},
  fill() {},
  stroke() {},
  fillRect() {},
  strokeRect() {},
  fillText() {},
  measureText: (text: string) => ({ width: text.length * 8 }),
}));
vi.mock("@babylonjs/core/Materials/Textures/dynamicTexture", () => ({
  DynamicTexture: class {
    getContext() {
      return context;
    }
  },
}));
vi.mock("@babylonjs/core/Layers/layer", () => ({
  Layer: class {
    dispose() {}
  },
}));
import { CanvasUI } from "./toolkit";
import { uiTheme } from "@sidereal/ui/theme";
import {
  canvasControlState,
  controlAction,
  controlCornerCut,
} from "./component-state";
afterEach(() => vi.unstubAllGlobals());

test("repainted pending state prevents a held pointer from invoking a stale action", () => {
  const handlers = new Map<string, (e: unknown) => void>();
  vi.stubGlobal("window", {
    innerWidth: 900,
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
  const canvas = {
    style: {},
    focus() {},
    setPointerCapture() {},
    hasPointerCapture: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name: string, handler: (e: unknown) => void) =>
      handlers.set(name, handler),
    removeEventListener() {},
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
    rect = { x: 0, y: 0, w: 120, h: 44 };
  ui.button("save", "Save", rect, action);
  const pointer = {
    clientX: 20,
    clientY: 20,
    button: 0,
    pointerId: 1,
    preventDefault() {},
    stopImmediatePropagation() {},
  };
  handlers.get("pointerdown")!(pointer);
  ui.hits = [];
  ui.button("save", "Save", rect, action, { pending: true });
  handlers.get("pointerup")!(pointer);
  expect(action).not.toHaveBeenCalled();
  ui.hits = [];
  ui.button("save", "Save", rect, action);
  handlers.get("pointerdown")!(pointer);
  handlers.get("pointerup")!(pointer);
  expect(action).toHaveBeenCalledOnce();
  ui.dispose();
});

test("selection, focus, press and pending compose without changing semantic variant", () => {
  const active = canvasControlState({
    variant: "danger",
    selected: true,
    focused: true,
    pressed: true,
  });
  expect(active.interactive).toBe(true);
  expect(active.border).toBe(uiTheme.colors.danger);
  expect(active.focus).toBe(uiTheme.colors.primary);
  const pending = canvasControlState({
    variant: "danger",
    selected: true,
    focused: true,
    pressed: true,
    pending: true,
  });
  expect(pending.interactive).toBe(false);
  expect(pending.border).toBe(active.border);
  expect(pending.focus).toBe(active.focus);
  expect(pending.fill).not.toBe(active.fill);
  expect(pending.glow).toBe(0);
});

test("pending and disabled suppress direct activation; a resolved operation can act again", () => {
  let options = { pending: false, disabled: false };
  const action = vi.fn(),
    guarded = controlAction(action, () => options);
  guarded();
  options.pending = true;
  guarded();
  options = { pending: false, disabled: true };
  guarded();
  expect(action).toHaveBeenCalledTimes(1);
  options.disabled = false;
  guarded();
  expect(action).toHaveBeenCalledTimes(2);
});

test("legacy accent keeps warning semantics and an explicit variant takes precedence", () => {
  expect(canvasControlState({ accent: true, hovered: true }).border).toBe(
    uiTheme.colors.warning,
  );
  expect(
    canvasControlState({ accent: true, variant: "success", hovered: true })
      .border,
  ).toBe(uiTheme.colors.success);
});

test("compact cut geometry stays within key and close controls", () => {
  for (const [width, height] of [
    [28, 27],
    [16, 16],
    [1, 20],
    [160, 44],
    [0, 0],
  ]) {
    const cut = controlCornerCut(width, height, 10);
    expect(cut).toBeGreaterThanOrEqual(0);
    expect(cut).toBeLessThanOrEqual(Math.min(width, height) / 4);
  }
});

const luminance = (hex: string) => {
  const components = hex
    .slice(1)
    .match(/../g)!
    .map((value) => {
      const channel = Number.parseInt(value, 16) / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return (
    components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722
  );
};
test("action labels remain readable in composed enabled and pending states", () => {
  for (const variant of [
    "primary",
    "secondary",
    "danger",
    "warning",
    "success",
    "ghost",
  ] as const)
    for (const pending of [true, false]) {
      const style = canvasControlState({
        variant,
        selected: true,
        hovered: true,
        pressed: true,
        pending,
      });
      const a = luminance(style.text),
        b = luminance(style.fill);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    }
});
