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
