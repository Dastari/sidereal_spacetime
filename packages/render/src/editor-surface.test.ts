import { describe, expect, it } from "vitest";
import {
  editorFitRadius,
  editorGuideStep,
  editorRenderScale,
} from "./editor-surface";
describe("editor surface budgets", () => {
  it("preserves retina resolution within the framebuffer budget", () => {
    expect(editorRenderScale(2, 1000, 700)).toBe(0.5);
    expect(editorRenderScale(3, 1000, 700)).toBe(0.5);
    expect(editorRenderScale(NaN, 1000, 700)).toBe(1);
  });
  it("bounds large and ultrawide framebuffers", () => {
    for (const [width, height] of [
      [3840, 2160],
      [5120, 1440],
    ]) {
      const scale = editorRenderScale(2, width, height);
      expect((width * height) / scale ** 2).toBeLessThanOrEqual(4_000_001);
    }
  });
  it("separates visual guide density from precise placement", () => {
    expect(editorGuideStep(1 / 32)).toBe(0.5);
    expect(editorGuideStep(2)).toBe(2);
    expect(editorGuideStep(NaN)).toBe(1);
  });
});

it("fits portrait canvases without clipping a long ship", () => {
  const landscape = editorFitRadius(
    [10, 3, 22],
    Math.PI / 10,
    Math.PI / 4,
    1.7,
    0.65,
  );
  const portrait = editorFitRadius(
    [10, 3, 22],
    Math.PI / 10,
    Math.PI / 4,
    0.6,
    0.65,
  );
  expect(portrait).toBeGreaterThan(landscape);
  expect(editorFitRadius([0, 0, 0], 0, 0, 1, 0.65)).toBe(3);
});
