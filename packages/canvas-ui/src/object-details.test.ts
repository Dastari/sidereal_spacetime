import { expect, it, vi } from "vitest";
import {
  createObjectDetailsUI,
  objectActionEnabled,
  objectDetailsLayout,
  type ObjectDetailsState,
} from "./object-details";
import type { CanvasUI } from "./toolkit";
import type { Rect } from "./layout";
const state: ObjectDetailsState = {
  placementId: "couch-1",
  name: "Crew couch",
  category: "Seating",
  stats: [{ label: "Width", value: "2.0 m" }],
  reachable: true,
  distance: 1.2,
  actions: [{ id: "sit", label: "Sit", enabled: true }],
};
function fixture() {
  const buttons = new Map<
    string,
    { action: () => void; disabled?: boolean; rect: Rect }
  >();
  let rect: Rect | undefined,
    move: ((x: number, y: number) => void) | undefined;
  const ctx = new Proxy({}, { get: () => () => {} });
  const ui = {
    width: 900,
    height: 650,
    ctx,
    button: (
      id: string,
      _label: string,
      r: Rect,
      action: () => void,
      options?: { disabled?: boolean },
    ) => buttons.set(id, { action, disabled: options?.disabled, rect: r }),
    text: () => {},
    paragraph: () => {},
    invalidate: () => {},
    windowFrame: (
      _id: string,
      _name: string,
      r: Rect,
      _focused: boolean,
      drag: (x: number, y: number) => void,
    ) => {
      rect = { ...r };
      move = drag;
    },
  } as unknown as CanvasUI;
  return {
    ui,
    buttons,
    rect: () => rect!,
    move: (x: number, y: number) => move!(x, y),
  };
}
it("requires supplied permission, proximity and pending state without inventing actions", () => {
  expect(objectActionEnabled(state, "sit")).toBe(true);
  expect(objectActionEnabled(state, "repair")).toBe(false);
  expect(objectActionEnabled({ ...state, reachable: false }, "sit")).toBe(
    false,
  );
  expect(objectActionEnabled(state, "sit", true)).toBe(false);
  expect(
    objectActionEnabled(
      { ...state, actions: [{ id: "sit", label: "Sit", enabled: false }] },
      "sit",
    ),
  ).toBe(false);
});
it("keeps selection position, clamps resize and closes without reopening stale state", () => {
  const f = fixture(),
    action = vi.fn(),
    close = vi.fn(),
    panel = createObjectDetailsUI(f.ui, { action, close });
  panel.draw(state);
  f.move(-120, 30);
  panel.draw({ ...state, placementId: "couch-2" });
  const moved = f.rect();
  expect(moved.x).toBe(434);
  expect(moved.y).toBe(112);
  f.ui.width = 390;
  f.ui.height = 420;
  panel.draw(state);
  expect(f.rect().x + f.rect().w).toBeLessThanOrEqual(382);
  expect(f.rect().y + f.rect().h).toBeLessThanOrEqual(420);
  f.buttons.get("object-action-sit")!.action();
  expect(action).toHaveBeenCalledWith("sit");
  panel.draw({ ...state, reachable: false });
  f.buttons.get("object-action-sit")!.action();
  expect(action).toHaveBeenCalledTimes(1);
  panel.close();
  panel.draw(state);
  expect(panel.isOpen()).toBe(false);
  expect(close).toHaveBeenCalledOnce();
  panel.dispose();
});
it("scrolls long stats while retaining reachable action controls within compact windows", () => {
  const f = fixture();
  f.ui.width = 390;
  f.ui.height = 420;
  const panel = createObjectDetailsUI(f.ui, {
    action: () => {},
    close: () => {},
  });
  panel.draw({
    ...state,
    stats: Array.from({ length: 25 }, (_, i) => ({
      label: "Attribute " + i,
      value: String(i),
    })),
  });
  const r = f.rect();
  expect(panel.scroll(150, r.x + 30, r.y + 80)).toBe(true);
  expect(panel.scroll(150, 0, 0)).toBe(false);
  panel.draw(state);
  const button = f.buttons.get("object-action-sit")!.rect;
  expect(button.y + button.h).toBeLessThanOrEqual(r.y + r.h);
  const layout = objectDetailsLayout(r, 25, 1);
  expect(layout.contentHeight).toBeGreaterThan(layout.viewport.h);
  panel.dispose();
});
it("objects without a rendered image show a measured schematic, not 'Preview unavailable'", () => {
  const f = fixture();
  const texts: string[] = [];
  (f.ui as unknown as { text: (t: string) => void }).text = (t) =>
    texts.push(t);
  const details = createObjectDetailsUI(f.ui, {
    action: vi.fn(),
    close: vi.fn(),
  });
  details.draw({
    ...state,
    name: "Airlock hatch",
    schematic: { widthM: 1.5, depthM: 0.25, heightM: 2.2 },
  });
  expect(texts).toContain("SCHEMATIC");
  expect(texts).toContain("1.50 × 0.25 × 2.20 m");
  expect(texts).not.toContain("Preview unavailable");
  texts.length = 0;
  details.draw({ ...state, placementId: "other" });
  expect(texts).toContain("Preview unavailable");
});

it("keeps movement, retry and cancellation in the same inspector and guards pending dismissal", () => {
  const f = fixture(),
    action = vi.fn(),
    close = vi.fn();
  const panel = createObjectDetailsUI(f.ui, { action, close });
  panel.draw(state);
  f.move(-90, 10);
  const placement = {
    pending: false,
    wall: false,
    snap: true,
    issue: "",
    error: "",
  };
  panel.draw({ ...state, placement });
  const original = f.rect();
  expect(original.x).toBe(464);
  f.buttons.get("object-action-placement-left")!.action();
  expect(action).toHaveBeenLastCalledWith("placement-left");
  panel.draw({ ...state, placement: { ...placement, pending: true } });
  f.buttons.get("object-action-placement-cancel")!.action();
  panel.close();
  expect(panel.isOpen()).toBe(true);
  expect(close).not.toHaveBeenCalled();
  expect(action).toHaveBeenCalledTimes(1);
  f.ui.width = 390;
  f.ui.height = 420;
  panel.draw({
    ...state,
    placement: { ...placement, error: "Move crew clear of the destination." },
  });
  for (const id of [
    "placement-place",
    "placement-cancel",
    "placement-retry",
    "placement-reset",
  ]) {
    const b = f.buttons.get("object-action-" + id)!;
    expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(f.rect().y + f.rect().h);
  }
  expect(f.buttons.get("object-action-placement-place")!.disabled).toBe(true);
  f.buttons.get("object-action-placement-retry")!.action();
  expect(action).toHaveBeenLastCalledWith("placement-retry");
  panel.draw({ ...state, placement: { ...placement, wall: true } });
  // A stale floor rotation callback cannot rotate a wall-mounted object.
  f.buttons.get("object-action-placement-left")!.action();
  expect(action).toHaveBeenCalledTimes(2);
  panel.close();
  expect(close).toHaveBeenCalledOnce();
});
