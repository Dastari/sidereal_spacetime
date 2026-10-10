import { expect, it, vi } from "vitest";
import { createDiagnosticsUI, type DebugFeature } from "./diagnostics";
import type { CanvasUI } from "./toolkit";
import type { RenderDiagnostics } from "../../render/src/diagnostics";
it("retains local override status after F3 closes and restores through explicit reset", () => {
  const flags = {
    lighting: true,
    equipment: true,
    shadows: true,
    glow: true,
    planets: true,
    characters: true,
    globalIllumination: true,
    skeleton: false,
    lightBounds: false,
    collision: false,
    captureListCache: true,
    captureOnMotion: false,
    captureGlobalsOnly: false,
  };
  const defaults = { ...flags };
  const data = {
    fps: 60,
    frameMs: 16.67,
    renderCpuMs: 4,
    drawCalls: 80,
    activeMeshes: 12,
    totalMeshes: 50,
    activeIndices: 1000,
    materials: 5,
    textures: 8,
    lights: 4,
    shadowMaps: 2,
    renderWidth: 900,
    renderHeight: 620,
    hardwareScale: 1,
    debugFeatures: flags,
  } as RenderDiagnostics;
  const hits = new Map<string, { action: () => void; disabled: boolean }>();
  let close = () => {};
  const ui = {
    width: 900,
    height: 620,
    ctx: new Proxy({}, { get: () => () => {} }),
    invalidate: vi.fn(),
    text: vi.fn(),
    windowFrame: (
      _id: string,
      _title: string,
      _r: unknown,
      _focused: boolean,
      _drag: unknown,
      onClose: () => void,
    ) => {
      close = onClose;
    },
    button: (
      id: string,
      _label: string,
      _rect: unknown,
      action: () => void,
      options?: { disabled?: boolean },
    ) => hits.set(id, { action, disabled: !!options?.disabled }),
  } as unknown as CanvasUI;
  const sample = vi.fn((active: boolean) => (active ? data : undefined)),
    toggle = vi.fn((key: DebugFeature) => {
      flags[key] = !flags[key];
    }),
    reset = vi.fn(() => {
      Object.assign(flags, defaults);
    });
  const panel = createDiagnosticsUI(ui, sample, { toggle, reset });
  panel.toggle();
  panel.draw();
  hits.get("diagnostics-tab-visuals")!.action();
  panel.draw();
  // The render-cost group sits first; scroll to the reset button.
  panel.scroll(1000);
  hits.clear();
  panel.draw();
  expect(hits.get("diagnostics-reset")!.disabled).toBe(true);
  panel.scroll(-1000);
  hits.clear();
  panel.draw();
  hits.get("diagnostics-equipment")!.action();
  expect(toggle).toHaveBeenCalledWith("equipment");
  expect(panel.disabled()).toEqual(["equipment"]);
  close();
  expect(sample).toHaveBeenLastCalledWith(false);
  expect(panel.disabled()).toEqual(["equipment"]);
  expect(reset).not.toHaveBeenCalled();
  panel.toggle();
  panel.draw();
  panel.scroll(1000);
  panel.draw();
  expect(hits.get("diagnostics-reset")!.disabled).toBe(false);
  hits.get("diagnostics-reset")!.action();
  expect(reset).toHaveBeenCalledOnce();
  expect(panel.disabled()).toEqual([]);
  panel.dispose();
});

it("refreshes an open diagnostics window even when world state is idle, and stops on close", () => {
  vi.useFakeTimers();
  try {
    const invalidate = vi.fn(),
      ui = { width: 900, height: 620, invalidate } as unknown as CanvasUI;
    const panel = createDiagnosticsUI(ui);
    panel.toggle();
    invalidate.mockClear();
    vi.advanceTimersByTime(499);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledOnce();
    panel.toggle();
    invalidate.mockClear();
    vi.advanceTimersByTime(2000);
    expect(invalidate).not.toHaveBeenCalled();
    panel.dispose();
  } finally {
    vi.useRealTimers();
  }
});

it("scrolls every new visual option into reach on compact screens without offscreen hit regions", () => {
  const flags = {
    lighting: true,
    equipment: true,
    shadows: true,
    glow: true,
    planets: true,
    characters: true,
    globalIllumination: true,
    skeleton: false,
    lightBounds: false,
    collision: false,
    captureListCache: true,
    captureOnMotion: false,
    captureGlobalsOnly: false,
  };
  const defaults = { ...flags };
  const data = {
    fps: 60,
    frameMs: 16,
    renderCpuMs: 4,
    drawCalls: 4,
    activeMeshes: 4,
    totalMeshes: 4,
    activeIndices: 12,
    materials: 2,
    textures: 2,
    lights: 2,
    shadowMaps: 0,
    renderWidth: 500,
    renderHeight: 340,
    hardwareScale: 1,
    debugFeatures: flags,
    debugOverlays: {
      skeletons: 0,
      lights: 0,
      collisionFrames: 0,
      collisionScopes: [
        "No admitted collision source; private moving cargo is unavailable.",
      ],
    },
  } as RenderDiagnostics;
  type Rect = { x: number; y: number; w: number; h: number };
  const hits = new Map<
    string,
    { rect: Rect; action: () => void; disabled: boolean }
  >();
  let window: Rect = { x: 0, y: 0, w: 0, h: 0 };
  const text = vi.fn();
  const ui = {
    width: 500,
    height: 340,
    ctx: new Proxy({}, { get: () => () => {} }),
    invalidate: vi.fn(),
    text,
    windowFrame: (_id: string, _label: string, r: Rect) => {
      window = r;
    },
    button: (
      id: string,
      _label: string,
      rect: Rect,
      action: () => void,
      options?: { disabled?: boolean },
    ) => hits.set(id, { rect, action, disabled: !!options?.disabled }),
  } as unknown as CanvasUI;
  const panel = createDiagnosticsUI(ui, () => data, {
    toggle: (key) => {
      flags[key] = !flags[key];
    },
    reset: () => Object.assign(flags, defaults),
    quality: () => {},
  });
  panel.toggle();
  panel.draw();
  hits.get("diagnostics-tab-visuals")!.action();
  const seen = new Set<string>();
  for (let step = 0; step < 12; step++) {
    hits.clear();
    panel.draw();
    for (const [id, hit] of hits) {
      if (
        id.startsWith("diagnostics-tab-") ||
        id === "diagnostics-up" ||
        id === "diagnostics-down"
      )
        continue;
      seen.add(id);
      expect(hit.rect.y).toBeGreaterThanOrEqual(window.y + 99);
      expect(hit.rect.y + hit.rect.h).toBeLessThanOrEqual(
        window.y + window.h - 22,
      );
      if (id === "diagnostics-lightBounds" && !flags.lightBounds) hit.action();
    }
    panel.scroll(60);
  }
  // Glow moved into the render-cost switches with plastic, SSAO, clear coat and render scale.
  for (const key of Object.keys(flags))
    expect(
      seen.has(
        key === "glow" ? "diagnostics-quality-glow" : "diagnostics-" + key,
      ),
    ).toBe(true);
  for (const id of [
    "diagnostics-quality-plastic",
    "diagnostics-quality-ssao",
    "diagnostics-quality-clearCoat",
    "diagnostics-scale-50",
    "diagnostics-scale-100",
  ])
    expect(seen.has(id)).toBe(true);
  expect(seen.has("diagnostics-reset")).toBe(true);
  expect(flags.lightBounds).toBe(true);
  expect(panel.disabled()).toEqual([]);
  expect(
    text.mock.calls.some(([value]) =>
      String(value).includes("No admitted collision source"),
    ),
  ).toBe(true);
  panel.dispose();
});

it("switches the render-cost settings live through the quality control", () => {
  const quality = {
    plastic: true,
    ssao: false,
    clearCoat: false,
    glow: true,
    renderScale: 1,
  };
  const data = {
    fps: 42,
    frameMs: 23.8,
    renderCpuMs: 4,
    drawCalls: 212,
    activeMeshes: 4,
    totalMeshes: 4,
    activeIndices: 12,
    materials: 2,
    textures: 2,
    lights: 2,
    shadowMaps: 0,
    renderWidth: 1280,
    renderHeight: 720,
    hardwareScale: 1,
    debugFeatures: {
      lighting: true,
      equipment: true,
      shadows: true,
      glow: true,
      planets: true,
      characters: true,
      globalIllumination: true,
      skeleton: false,
      lightBounds: false,
      collision: false,
      captureListCache: true,
      captureOnMotion: false,
      captureGlobalsOnly: false,
    },
    renderQuality: quality,
  } as RenderDiagnostics;
  const hits = new Map<string, { action: () => void; label: string }>();
  const text = vi.fn();
  const ui = {
    width: 1280,
    height: 900,
    ctx: new Proxy({}, { get: () => () => {} }),
    invalidate: vi.fn(),
    text,
    windowFrame: () => {},
    button: (id: string, label: string, _r: unknown, action: () => void) =>
      hits.set(id, { action, label }),
  } as unknown as CanvasUI;
  const set = vi.fn((patch: Partial<typeof quality>) =>
    Object.assign(quality, patch),
  );
  const panel = createDiagnosticsUI(ui, () => data, {
    toggle: () => {},
    reset: () => {},
    quality: set,
  });
  panel.toggle();
  panel.draw();
  hits.get("diagnostics-tab-visuals")!.action();
  hits.clear();
  panel.draw();
  expect(hits.get("diagnostics-quality-ssao")!.label).toBe("SSAO: Off");
  expect(hits.get("diagnostics-quality-plastic")!.label).toBe(
    "Plastic finish: On",
  );
  expect(
    text.mock.calls.some(([v]) =>
      String(v).includes("42 fps · 23.8 ms · 212 draws"),
    ),
  ).toBe(true);
  hits.get("diagnostics-quality-plastic")!.action();
  expect(set).toHaveBeenLastCalledWith({ plastic: false });
  hits.get("diagnostics-quality-ssao")!.action();
  expect(set).toHaveBeenLastCalledWith({ ssao: true });
  hits.get("diagnostics-scale-75")!.action();
  expect(set).toHaveBeenLastCalledWith({ renderScale: 0.75 });
  hits.clear();
  panel.draw();
  expect(hits.get("diagnostics-quality-plastic")!.label).toBe(
    "Plastic finish: Off",
  );
  expect(hits.get("diagnostics-quality-ssao")!.label).toBe("SSAO: On");
  panel.dispose();
});
