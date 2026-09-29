import { describe, expect, it } from "vitest";
import {
  applyRenderQualityQuery,
  hardwareScalingForRenderScale,
  normalizeRenderQuality,
  readStoredRenderQuality,
  RENDER_QUALITY_DEFAULTS,
  RENDER_QUALITY_STORAGE_KEY,
  RENDER_SCALES,
  writeRenderQuality,
} from "./render-quality";

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("render quality switches", () => {
  it("defaults keep the plastic finish and glow on and SSAO off (owner frame-rate report)", () => {
    expect(RENDER_QUALITY_DEFAULTS).toEqual({
      plastic: true,
      ssao: false,
      clearCoat: false,
      glow: true,
      renderScale: 1,
    });
    expect(readStoredRenderQuality(undefined)).toEqual(RENDER_QUALITY_DEFAULTS);
  });

  it("persists locally and survives corrupt or blocked storage", () => {
    const store = memory();
    writeRenderQuality(store, {
      ...RENDER_QUALITY_DEFAULTS,
      plastic: false,
      ssao: true,
      renderScale: 0.75,
    });
    expect(readStoredRenderQuality(store)).toMatchObject({
      plastic: false,
      ssao: true,
      renderScale: 0.75,
    });
    store.data.set(RENDER_QUALITY_STORAGE_KEY, "{not json");
    expect(readStoredRenderQuality(store)).toEqual(RENDER_QUALITY_DEFAULTS);
    const blocked = {
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    };
    expect(readStoredRenderQuality(blocked)).toEqual(RENDER_QUALITY_DEFAULTS);
    expect(() =>
      writeRenderQuality(blocked, RENDER_QUALITY_DEFAULTS),
    ).not.toThrow();
  });

  it("normalises wrong types and clamps the render scale", () => {
    expect(
      normalizeRenderQuality({ plastic: "no", ssao: 1, renderScale: 0.1 }),
    ).toEqual({ ...RENDER_QUALITY_DEFAULTS, renderScale: 0.5 });
    expect(normalizeRenderQuality({ renderScale: 4 }).renderScale).toBe(1);
    for (const s of RENDER_SCALES)
      expect(normalizeRenderQuality({ renderScale: s }).renderScale).toBe(s);
    expect(hardwareScalingForRenderScale(0.5)).toBe(2);
    expect(hardwareScalingForRenderScale(1)).toBe(1);
  });

  it("layers review URL overrides without changing the saved value", () => {
    const base = { ...RENDER_QUALITY_DEFAULTS };
    expect(
      applyRenderQualityQuery(
        base,
        "?ao=1&coat=1&plastic=0&glow=off&renderScale=0.67",
      ),
    ).toEqual({
      plastic: false,
      ssao: true,
      clearCoat: true,
      glow: false,
      renderScale: 0.67,
    });
    expect(applyRenderQualityQuery(base, "?x=1")).toEqual(base);
    expect(base).toEqual(RENDER_QUALITY_DEFAULTS);
  });
});
