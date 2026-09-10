import { expect, it, vi } from "vitest";
import { drawAntialiasingMenu } from "./antialiasing-menu";
import type { CanvasUI } from "./toolkit";
import type { AntialiasingSnapshot } from "@sidereal/render/antialiasing-settings";
const draw = (state: AntialiasingSnapshot) => {
  const ui = { text: vi.fn(), paragraph: vi.fn(), button: vi.fn() },
    set = vi.fn();
  drawAntialiasingMenu(
    ui as unknown as CanvasUI,
    { x: 0, y: 0, w: 260, h: 340 },
    { state, set },
  );
  return { ui, set };
};
it("renders six explicit modes without mutating settings and reports fallback rather than the requested label", () => {
  const { ui, set } = draw({
    requested: { mode: "taa", samples: 4 },
    effective: {
      mode: "fxaa",
      samples: 1,
      fxaa: true,
      renderScale: 1,
      reason: "Motion buffers unavailable",
    },
    pending: false,
  });
  expect(set).not.toHaveBeenCalled();
  expect(ui.button.mock.calls).toHaveLength(9);
  expect(ui.text.mock.calls.some((c) => c[0] === "Active: FXAA")).toBe(true);
  expect(ui.paragraph.mock.calls[0][0]).toBe("Motion buffers unavailable");
  const mode = ui.button.mock.calls.find(
    (c) => c[0] === "graphics-aa-msaa-fxaa",
  )!;
  mode[3]();
  expect(set).toHaveBeenCalledWith({ mode: "msaa-fxaa" });
  expect(
    ui.button.mock.calls
      .filter((c) => c[0].includes("samples"))
      .every((c) => c[4].disabled),
  ).toBe(true);
});
it("labels FSAA supersampling as four times the pixels and never edits brightness or display scale", () => {
  const { ui, set } = draw({
    requested: { mode: "ssaa", samples: 4 },
    effective: { mode: "ssaa", samples: 1, fxaa: false, renderScale: 2 },
    pending: false,
  });
  expect(ui.text.mock.calls.some((c) => c[0].includes("4× pixels"))).toBe(true);
  expect(ui.paragraph.mock.calls[0][0]).toContain(
    "display scale stays unchanged",
  );
  expect(set).not.toHaveBeenCalled();
});
