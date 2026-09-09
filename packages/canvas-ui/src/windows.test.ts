import { expect, test } from "vitest";
import { WindowStack } from "./windows";
test("floating windows focus independently and close only the selected window", () => {
  const windows = new WindowStack();
  windows.open("inventory", { x: 50, y: 80, w: 460, h: 500 });
  windows.open("character", { x: 20, y: 80, w: 300, h: 480 });
  windows.open("crate", { x: 280, y: 100, w: 330, h: 440 });
  expect(windows.at(300, 120)?.id).toBe("crate");
  windows.focus("inventory");
  expect(windows.at(300, 120)?.id).toBe("inventory");
  windows.close("inventory");
  expect(windows.windows.map((w) => w.id)).toEqual(["character", "crate"]);
  windows.open("character", { x: 0, y: 0, w: 10, h: 10 });
  expect(windows.windows).toHaveLength(2);
  expect(windows.windows[1].rect.w).toBe(300);
});
test("moving one window cannot move its neighbor and resize clamps every titlebar", () => {
  const windows = new WindowStack();
  windows.open("inventory", { x: 50, y: 80, w: 460, h: 500 });
  windows.open("crate", { x: 600, y: 100, w: 330, h: 440 });
  windows.move("inventory", -2000, 3000, 1280, 720);
  expect(windows.windows[0].rect.x).toBe(8);
  expect(windows.windows[0].rect.y).toBe(204);
  expect(windows.windows[1].rect.x).toBe(600);
  windows.clamp(390, 400);
  for (const w of windows.windows) {
    expect(w.rect.x).toBeGreaterThanOrEqual(8);
    expect(w.rect.y).toBeGreaterThanOrEqual(64);
    expect(w.rect.x + w.rect.w).toBeLessThanOrEqual(382);
    expect(w.rect.y + w.rect.h).toBeLessThanOrEqual(384);
  }
  windows.clamp(1280, 900);
  expect(windows.windows.map((w) => [w.rect.w, w.rect.h])).toEqual([
    [460, 500],
    [330, 440],
  ]);
});
