import { describe, expect, it } from "vitest";
import {
  ANTIALIASING_DEFAULTS,
  antialiasingPassOrder,
  normalizeAntialiasing,
  resolveAntialiasing,
} from "./antialiasing-settings";
const caps = {
  maxSamples: 4,
  maxTextureSize: 8192,
  width: 1920,
  height: 1080,
  temporalReprojection: true,
  temporalResetIntegrated: true,
};
describe("antialiasing preferences and actual capabilities", () => {
  it("defaults enabled and ignores corrupt or unbounded preferences", () => {
    expect(normalizeAntialiasing(null)).toEqual(ANTIALIASING_DEFAULTS);
    expect(normalizeAntialiasing({ mode: "magic", samples: Infinity })).toEqual(
      ANTIALIASING_DEFAULTS,
    );
    expect(normalizeAntialiasing({ mode: "off", samples: 1024 })).toEqual({
      mode: "off",
      samples: 4,
    });
    expect(
      normalizeAntialiasing({ samples: 2 }, { mode: "fxaa", samples: 8 }),
    ).toEqual({ mode: "fxaa", samples: 2 });
  });
  it("bounds samples without pretending unsupported MSAA was enabled", () => {
    expect(
      resolveAntialiasing({ mode: "msaa-fxaa", samples: 8 }, caps),
    ).toMatchObject({
      mode: "msaa-fxaa",
      samples: 4,
      fxaa: true,
      renderScale: 1,
    });
    expect(
      resolveAntialiasing(
        { mode: "msaa", samples: 4 },
        { ...caps, maxSamples: 1 },
      ),
    ).toMatchObject({
      mode: "fxaa",
      samples: 1,
      fxaa: true,
      reason: expect.any(String),
    });
    expect(
      resolveAntialiasing({ mode: "off", samples: 8 }, caps),
    ).toMatchObject({ mode: "off", samples: 1, fxaa: false });
  });
  it("requires both real temporal motion buffers and reset integration", () => {
    expect(resolveAntialiasing({ mode: "taa", samples: 4 }, caps).mode).toBe(
      "taa",
    );
    for (const missing of [
      { temporalReprojection: false },
      { temporalResetIntegrated: false },
    ])
      expect(
        resolveAntialiasing(
          { mode: "taa", samples: 4 },
          { ...caps, ...missing },
        ),
      ).toMatchObject({ mode: "fxaa", reason: expect.any(String) });
  });
  it("supersamples actual scene pixels only within texture and allocation budgets", () => {
    expect(
      resolveAntialiasing({ mode: "ssaa", samples: 4 }, caps),
    ).toMatchObject({ renderScale: 2, samples: 1, fxaa: false });
    for (const size of [
      { width: 3840, height: 2160 },
      { width: 5000, height: 1 },
      { width: NaN, height: 100 },
      { width: 0, height: 100 },
    ])
      expect(
        resolveAntialiasing({ mode: "ssaa", samples: 4 }, { ...caps, ...size })
          .mode,
      ).toBe("fxaa");
  });
  it("preserves external display/selection pass order and keeps only one final FXAA", () => {
    const capture = {},
      display = {},
      selection = {},
      fxaa = {};
    expect(
      antialiasingPassOrder(
        [display, null, fxaa, selection, capture, fxaa],
        [capture],
        [fxaa],
      ),
    ).toEqual([capture, display, selection, fxaa]);
    expect(
      antialiasingPassOrder(
        [capture, display, selection, fxaa],
        [capture],
        [fxaa],
      ),
    ).toEqual([capture, display, selection, fxaa]);
  });
});
