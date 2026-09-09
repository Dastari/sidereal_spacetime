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
  };
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
      for (const key of Object.keys(flags) as DebugFeature[]) flags[key] = true;
    });
  const panel = createDiagnosticsUI(ui, sample, { toggle, reset });
  panel.toggle();
  panel.draw();
  expect(hits.get("diagnostics-reset")!.disabled).toBe(true);
  hits.get("diagnostics-equipment")!.action();
  expect(toggle).toHaveBeenCalledWith("equipment");
  expect(panel.disabled()).toEqual(["equipment"]);
  close();
  expect(sample).toHaveBeenLastCalledWith(false);
  expect(panel.disabled()).toEqual(["equipment"]);
  expect(reset).not.toHaveBeenCalled();
  panel.toggle();
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
