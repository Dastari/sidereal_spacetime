import { afterEach, expect, it, vi } from "vitest";
import { createCanvasEntryUI, type EntryState } from "./entry";
import type { Rect } from "./layout";
afterEach(() => vi.unstubAllGlobals());
function create(
  width: number,
  height: number,
  state: EntryState,
  service?: {
    scroll: (delta: number, x?: number, y?: number) => boolean;
    draw: () => void;
  },
) {
  const handlers = new Map<string, Function>(),
    text: { value: string; x: number; y: number; clip?: Rect }[] = [];
  let clip: Rect | undefined, pending: Rect | undefined;
  const stack: (Rect | undefined)[] = [];
  const ctx = {
    save() {
      stack.push(clip);
    },
    restore() {
      clip = stack.pop();
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    setTransform() {},
    drawImage() {},
    rect(x: number, y: number, w: number, h: number) {
      pending = { x, y, w, h };
    },
    clip() {
      clip = pending;
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    measureText: (value: string) => ({ width: value.length * 7 }),
    fillText(value: string, x: number, y: number) {
      text.push({ value, x, y, clip });
    },
  };
  vi.stubGlobal("window", {
    devicePixelRatio: 1,
    addEventListener: (n: string, f: Function) => handlers.set(n, f),
    removeEventListener() {},
  });
  vi.stubGlobal("document", {
    hidden: false,
    fonts: { ready: Promise.resolve() },
    removeEventListener() {},
  });
  vi.stubGlobal("location", { search: "", pathname: "/" });
  vi.stubGlobal("Image", class {});
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const canvas = {
    clientWidth: width,
    clientHeight: height,
    getContext: () => ctx,
    addEventListener: (n: string, f: Function) => handlers.set(n, f),
    removeEventListener() {},
    setAttribute() {},
    closest() {
      return null;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    style: {},
  } as unknown as HTMLCanvasElement;
  const action = vi.fn();
  const ui = createCanvasEntryUI(
    canvas,
    () => state,
    {
      signIn: action,
      signOut: action,
      enter: action,
      create: action,
      development: action,
      retry: action,
      retryPreview: action,
      readService: () => service,
    },
    () => ({ failed: true }),
  );
  return { ui, text, handlers };
}
it("all loadout entries stay clipped above Enter world on portrait and short landscape", () => {
  for (const [w, h] of [
    [375, 667],
    [390, 844],
    [667, 375],
    [844, 390],
  ]) {
    const f = create(w, h, {
      kind: "character",
      pending: false,
      error: "",
      character: {
        id: "sample",
        name: "Sample character",
        shipName: "Sample ship",
        appearance: {},
        health: 100,
        maxHealth: 100,
        equipment: Array.from({ length: 8 }, (_, i) => ({
          name: `Loadout item ${i}`,
          slot: `slot ${i}`,
        })),
      },
    });
    const enter = f.ui
      .snapshot()
      .controls.find((c) => c.id === "enter-world")!.rect;
    const loadout = f.text.filter((t) => t.value.startsWith("Loadout item"));
    expect(loadout).toHaveLength(8);
    for (const line of loadout) {
      expect(line.clip).toBeDefined();
      expect(line.clip!.y + line.clip!.h).toBeLessThan(enter.y);
    }
    f.ui.dispose();
  }
});
it("entry service wheel gestures delegate to the active shared window", () => {
  const scroll = vi.fn(() => true);
  const f = create(
    375,
    667,
    { kind: "character", pending: false, error: "" },
    { scroll, draw() {} },
  );
  f.handlers.get("wheel")!({
    clientX: 100,
    clientY: 100,
    deltaY: 60,
    deltaX: 0,
    deltaMode: 0,
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  expect(scroll).toHaveBeenCalledWith(60, 100, 100);
  f.ui.dispose();
});

it("creation errors appear within the visible content without covering the action button", () => {
  const f = create(667, 375, {
    kind: "character",
    pending: false,
    error: "Creation failure",
  });
  const error = f.text.find((t) => t.value === "Creation failure")!;
  const button = f.ui
    .snapshot()
    .controls.find((c) => c.id === "create-character")!.rect;
  expect(error.clip).toBeDefined();
  expect(error.y).toBeGreaterThan(button.y + button.h);
  expect(error.y).toBeGreaterThanOrEqual(error.clip!.y);
  expect(error.y + 14).toBeLessThanOrEqual(error.clip!.y + error.clip!.h);
  f.ui.dispose();
});
