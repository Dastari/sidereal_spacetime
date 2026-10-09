import { describe, expect, it } from "vitest";
import {
  logicalUiScale,
  panelFrameGeometry,
  resolveControlStyle,
  uiTheme,
  uiThemeCss,
  uiThemeCssText,
} from "./theme";

describe("Shared UI contract", () => {
  it("keeps the gameplay shell chamfers and traces within tiny/native viewport bounds", () => {
    for (const [width, height] of [
      [480, 600],
      [16, 10],
      [0, 0],
    ]) {
      const frame = panelFrameGeometry(width, height);
      for (const [x, y] of [...frame.outline, ...frame.accents.flat()]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
      }
    }
    // The bottom-left remains square, unlike the rejected all-corner CSS approximation.
    expect(panelFrameGeometry(480, 600).outline).toContainEqual([0, 600]);
  });
  it("blocks pending controls without losing selection/focus feedback", () => {
    const style = resolveControlStyle({
      selected: true,
      focused: true,
      pending: true,
    });
    expect(style.interactive).toBe(false);
    expect(style.focus).toBe(uiTheme.colors.primary);
    expect(style.border).toBe(uiTheme.colors.primary);
    expect(style.glow).toBe(0);
  });
  it("separates semantic variants before hover", () => {
    expect(resolveControlStyle({ variant: "danger" }).border).toBe(
      uiTheme.colors.danger,
    );
    expect(resolveControlStyle({ variant: "primary" }).fill).not.toBe(
      resolveControlStyle({ variant: "secondary" }).fill,
    );
  });
  it("generates provider variables from the same contract", () => {
    for (const [key, value] of Object.entries(uiThemeCss))
      expect(uiThemeCssText()).toContain(`${key}: ${value};`);
  });
  it("bounds user scale independently of pixel ratio and rejects nonfinite values", () => {
    expect(logicalUiScale(0.25)).toBe(0.75);
    expect(logicalUiScale(2)).toBe(1.5);
    expect(logicalUiScale(NaN)).toBe(1);
  });
});
