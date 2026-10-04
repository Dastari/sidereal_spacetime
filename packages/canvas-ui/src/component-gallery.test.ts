import { expect, test, vi } from "vitest";
import { createComponentGallery, galleryLayout } from "./component-gallery";
import type { CanvasUI } from "./toolkit";
import type { Rect } from "./layout";

test("gallery viewport bounds remain reachable at all owner review scales", () => {
  for (const [width, height] of [
    [960, 540],
    [1366, 768],
    [1920, 1080],
    [3440, 1440],
    [320, 260],
    [220, 100],
  ])
    for (const scale of [0.75, 1, 1.25, 1.5]) {
      const size = { width: width / scale, height: height / scale };
      const layout = galleryLayout(size.width, size.height);
      for (const rect of [layout.frame, layout.content]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.w).toBeGreaterThanOrEqual(0);
        expect(rect.h).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(size.width);
        expect(rect.y + rect.h).toBeLessThanOrEqual(size.height);
      }
      expect(
        layout.cellWidth * layout.columns + layout.gap * (layout.columns - 1),
      ).toBeCloseTo(layout.content.w);
    }
});

function fixture() {
  const controls = new Map<
    string,
    {
      action: () => void;
      options: { selected?: boolean; disabled?: boolean; pending?: boolean };
    }
  >();
  const ui = {
    width: 640,
    height: 360,
    focus: "",
    keyboard: false,
    modal: false,
    hits: [] as { id: string; label: string; rect: Rect; action: () => void }[],
    invalidate: vi.fn(),
    ctx: { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} },
    windowFrame() {},
    panel() {},
    text() {},
    paragraph() {},
    bar() {},
    input() {},
    slider() {},
    button(
      id: string,
      _label: string,
      r: Rect,
      action: () => void,
      options = {},
    ) {
      controls.set(id, { action, options });
      ui.hits.push({ id, label: _label, rect: r, action });
    },
    toggle(
      id: string,
      _label: string,
      value: boolean,
      _r: unknown,
      change: (v: boolean) => void,
    ) {
      controls.set(id, { action: () => change(!value), options: {} });
    },
  };
  return {
    ui,
    controls,
    gallery: createComponentGallery(ui as unknown as CanvasUI),
  };
}
test("live gallery blocks gameplay, combines control states and closes without domain callbacks", () => {
  const f = fixture();
  expect(f.gallery.draw()).toBe(false);
  f.gallery.open();
  f.gallery.draw();
  expect(f.ui.modal).toBe(true);
  f.controls.get("gallery-next")!.action();
  f.gallery.draw();
  f.controls.get("gallery-selected")!.action();
  f.controls.get("gallery-pending")!.action();
  f.gallery.draw();
  expect(f.controls.get("gallery-composed")!.options).toMatchObject({
    selected: true,
    pending: true,
    disabled: false,
  });
  expect(f.gallery.scroll(100)).toBe(true);
  f.gallery.close();
  expect(f.gallery.isOpen()).toBe(false);
  expect(f.gallery.scroll(100)).toBe(false);
  expect(f.ui.focus).toBe("");
  expect(f.ui.keyboard).toBe(false);
});

test("scrolling clips button hit regions to their painted viewport", () => {
  const f = fixture();
  f.ui.width = 320;
  f.ui.height = 260;
  f.gallery.open();
  f.gallery.draw();
  f.gallery.scroll(53);
  f.ui.hits = [];
  f.gallery.draw();
  const { content } = galleryLayout(f.ui.width, f.ui.height);
  const examples = f.ui.hits.filter(
    (hit) =>
      !["gallery-previous", "gallery-next", "gallery-back"].includes(hit.id),
  );
  expect(examples.length).toBeGreaterThan(0);
  for (const hit of examples) {
    expect(hit.rect.y).toBeGreaterThanOrEqual(content.y);
    expect(hit.rect.y + hit.rect.h).toBeLessThanOrEqual(content.y + content.h);
    expect(hit.rect.h).toBeGreaterThan(0);
  }
});
