import { expect, it } from "vitest";
import { systemsDesignLayout } from "./systems-design-layout";
it("keeps inspection panes and actual equipment controls usable in short landscape", () => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [375, 667],
    [844, 390],
    [667, 375],
    [960, 540],
  ]) {
    const l = systemsDesignLayout(width, height);
    for (const r of [
      l.frame,
      l.equipment,
      l.viewport,
      l.inspector,
      l.footer,
      ...l.deckButtons,
      ...l.channelButtons,
    ]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
      expect(r.x + r.w).toBeLessThanOrEqual(width);
      expect(r.y + r.h).toBeLessThanOrEqual(height);
    }
    expect(l.equipment.h - 78).toBeGreaterThanOrEqual(30);
    expect(l.viewport.w).toBeGreaterThanOrEqual(100);
    expect(Math.max(...l.channelButtons.map((r) => r.y + r.h))).toBeLessThan(
      l.viewport.y,
    );
  }
});
it("reserves warning space without covering the scene or inspector", () => {
  const clean = systemsDesignLayout(1280, 800),
    warnings = systemsDesignLayout(1280, 800, 2);
  expect(warnings.viewport.y + warnings.viewport.h).toBeLessThanOrEqual(
    warnings.footer.y - 34,
  );
  expect(warnings.viewport.h).toBeLessThan(clean.viewport.h);
});
