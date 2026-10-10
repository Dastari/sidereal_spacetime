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
    onBeforeRenderObservable = { add() {} };
    onAfterRenderObservable = { add() {} };
    dispose() {}
  },
}));
import { CanvasUI } from "./toolkit";
import { COMBAT_CURSOR } from "./combat-cursor";
import { cursorValue, gameCursors } from "./cursors";
afterEach(() => vi.unstubAllGlobals());
function setup() {
  const handlers = new Map<string, Function>();
  vi.stubGlobal("window", {
    innerWidth: 900,
    // The window-level pointermove only re-reads the cursor after scene listeners ran.
    addEventListener: (name: string, handler: Function) =>
      name === "pointermove" || handlers.set(name, handler),
    removeEventListener() {},
  });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
  let inert = false;
  const canvas = {
    closest: (selector: string) =>
      selector === "[inert]" && inert ? canvas : null,
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
    getEngine: () => ({ currentViewport: null, setViewport() {} }),
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
  return {
    ui,
    pointer,
    key,
    wheel,
    action,
    drag,
    drop,
    context,
    setInert: (value: boolean) => {
      inert = value;
    },
  };
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

test("combat reticle yields to controls and menus and resets without mouse movement", () => {
  const f = setup(),
    cursors = gameCursors();
  f.pointer("pointermove", 400);
  f.ui.setWorldCursor(COMBAT_CURSOR);
  expect(f.ui.canvas.style.cursor).toBe(COMBAT_CURSOR);
  f.pointer("pointermove", 30);
  expect(f.ui.canvas.style.cursor).toBe(cursors.interact);
  f.pointer("pointermove", 400);
  f.ui.modal = true;
  f.ui.setWorldCursor(COMBAT_CURSOR);
  expect(f.ui.canvas.style.cursor).toBe(cursors.default);
  f.ui.modal = false;
  f.ui.setWorldCursor("default");
  expect(f.ui.canvas.style.cursor).toBe(cursors.default);
});
test("themed cursors: interact, grab while dragging or holding, not-allowed and text", () => {
  const f = setup(),
    cursors = gameCursors();
  f.pointer("pointermove", 30);
  expect(f.ui.canvas.style.cursor).toBe(cursors.interact);
  f.pointer("pointerdown", 30);
  f.pointer("pointermove", 60);
  expect(f.ui.canvas.style.cursor).toBe(cursors.grab);
  f.pointer("pointerup", 60);
  expect(f.ui.canvas.style.cursor).toBe(cursors.interact);
  f.ui.holding = true;
  f.pointer("pointermove", 400);
  expect(f.ui.canvas.style.cursor).toBe(cursors.grab);
  f.ui.holding = false;
  f.ui.hits[0].disabled = true;
  f.pointer("pointermove", 30);
  expect(f.ui.canvas.style.cursor).toBe(cursors["not-allowed"]);
  f.ui.hits[0] = {
    id: "search",
    label: "Search",
    rect: { x: 10, y: 10, w: 100, h: 100 },
    edit: { value: "", max: 10, change() {} },
  };
  f.pointer("pointermove", 30);
  expect(f.ui.canvas.style.cursor).toBe(cursors.text);
  // Every themed cursor is an OS-drawn image with a keyword fallback: nothing trails the pointer.
  for (const value of Object.values(cursors))
    expect(value).toMatch(
      /^url\("data:image\/svg\+xml,.+"\) \d+ \d+, [a-z-]+$/,
    );
});
test("hi-DPI cursors prefer image-set with a 2x image when the browser supports it", () => {
  const value = cursorValue("grab", (v) => v.startsWith("image-set("));
  expect(value.startsWith("image-set(")).toBe(true);
  expect(value).toContain(" 1x, ");
  expect(value).toContain(" 2x) 16 16, grabbing");
  expect(decodeURIComponent(value)).toContain('width="64" height="64"');
  expect(cursorValue("text", () => false)).toMatch(/\) 16 16, text$/);
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

test("loading surface blocks window keyboard shortcuts until inert is cleared", () => {
  const f = setup();
  f.ui.shortcut = vi.fn(() => true);
  f.setInert(true);
  f.key("v", "KeyV");
  expect(f.ui.shortcut).not.toHaveBeenCalled();
  f.setInert(false);
  f.key("v", "KeyV");
  expect(f.ui.shortcut).toHaveBeenCalledExactlyOnceWith("KeyV");
});

test("clipboard paste preserves selection and length limits on the actual canvas input", async () => {
  const f = setup(),
    change = vi.fn();
  let resolve!: (text: string) => void;
  vi.stubGlobal("navigator", {
    clipboard: {
      readText: () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    },
  });
  f.ui.hits = [
    {
      id: "transfer",
      label: "Code",
      rect: { x: 0, y: 0, w: 200, h: 40 },
      edit: { value: "old", max: 6, change },
    },
  ];
  f.ui.focus = "transfer";
  f.ui.keyboard = true;
  f.key("a", "KeyA", true);
  f.key("v", "KeyV", true);
  resolve("abcdefghi\n");
  await Promise.resolve();
  expect(change).toHaveBeenLastCalledWith("abcdef");
});
test("late clipboard reads cannot change a replaced, blurred or disposed field", async () => {
  for (const reason of ["focus", "replacement", "disposed"]) {
    const f = setup(),
      change = vi.fn();
    let resolve!: (text: string) => void;
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      },
    });
    f.ui.hits = [
      {
        id: "transfer",
        label: "Code",
        rect: { x: 0, y: 0, w: 200, h: 40 },
        edit: { value: "", max: 66, change },
      },
    ];
    f.ui.focus = "transfer";
    f.ui.keyboard = true;
    f.key("v", "KeyV", true);
    if (reason === "focus") f.ui.focus = "other";
    if (reason === "replacement") f.ui.hits[0].edit!.change = vi.fn();
    if (reason === "disposed") f.ui.dispose();
    resolve("a".repeat(64));
    await Promise.resolve();
    expect(change).not.toHaveBeenCalled();
  }
});
