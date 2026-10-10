import { expect, test, vi } from "vitest";
import {
  summarize,
  summarizeRun,
  relativeDifference,
  createPerformanceProbe,
} from "./prefab-render-harness/performance-probe";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";

test("computes raw median and nearest-rank p95, with missing GPU timers explicit", () => {
  expect(summarize([4, 1, 3, 2, NaN])).toEqual({
    samples: 4,
    median: 2.5,
    p95: 4,
  });
  expect(summarize([])).toEqual({ samples: 0, median: null, p95: null });
  expect(summarize(Array.from({ length: 100 }, (_, i) => i + 1)).p95).toBe(95);
  expect(relativeDifference(100, 102)).toBeLessThan(0.03);
  expect(relativeDifference(100, 104)).toBeGreaterThan(0.03);
  expect(relativeDifference(0, 0)).toBe(0);
});
test("includes zero-draw frames for intermittent passes, rather than biasing counts upward", () => {
  const frame = {
    frameMs: 20,
    frameCpuMs: 5,
    renderCpuMs: 4,
    updateCpuMs: 1,
    drawCalls: 2,
    activeIndices: 12,
  };
  const result = summarizeRun([
    { ...frame, passes: { "3": { draws: 2, litMaterialBinds: 2 } } },
    { ...frame, passes: {} },
  ]);
  expect(result.passes["3"].draws).toEqual({ samples: 2, median: 1, p95: 2 });
  expect(result.fps.median).toBe(50);
  expect(result.metrics.gpuFrameMs).toEqual({
    samples: 0,
    median: null,
    p95: null,
  });
});
test("restores its counter and material observers, and preserves a later hook owner", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new PBRMaterial("probe", scene);
  const original = engine._drawCalls.addCount;
  const options = {
    frames: 60,
    warmup: 60,
    metadata: {},
    ready: () => false,
    diagnostics: () => undefined,
    settings: () => ({}),
  };
  const probe = createPerformanceProbe(scene, options);
  expect(engine._drawCalls.addCount).not.toBe(original);
  engine._drawCalls.addCount(3, false);
  expect(engine._drawCalls.current).toBe(3);
  probe.dispose();
  probe.dispose();
  expect(engine._drawCalls.addCount).toBe(original);
  expect(material.onBindObservable.hasObservers()).toBe(false);
  const second = createPerformanceProbe(scene, options);
  const later = () => {};
  engine._drawCalls.addCount = later;
  second.dispose();
  expect(engine._drawCalls.addCount).toBe(later);
  engine._drawCalls.addCount = original;
  scene.dispose();
  engine.dispose();
});

test("waits for focus and readiness, discards interrupted samples and records two complete raw runs", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  let focused = true,
    ready = true,
    now = 0;
  vi.stubGlobal("document", {
    visibilityState: "visible",
    hasFocus: () => focused,
  });
  vi.spyOn(performance, "now").mockImplementation(() => (now += 20));
  vi.spyOn(scene, "isReady").mockReturnValue(true);
  vi.spyOn(engine, "getDeltaTime").mockReturnValue(20);
  const probe = createPerformanceProbe(scene, {
    frames: 2,
    warmup: 1,
    metadata: {},
    ready: () => ready,
    diagnostics: () => undefined,
    settings: () => ({}),
    completed: () => {
      throw new Error("collector unavailable");
    },
  });
  function frame() {
    engine.onBeginFrameObservable.notifyObservers(engine);
    engine._drawCalls.addCount(7, false);
    probe.recordFrame({ renderCpuMs: 4, updateCpuMs: 1, frameCpuMs: 6 });
    engine.onEndFrameObservable.notifyObservers(engine);
  }
  try {
    ready = false;
    frame();
    expect(probe.report.status).toBe("waiting");
    ready = true;
    frame();
    frame();
    expect(probe.report.progress).toBe(1);
    focused = false;
    frame();
    expect(probe.report.progress).toBe(0);
    focused = true;
    for (let i = 0; i < 6; i++) frame();
    expect(probe.report.status).toBe("complete");
    expect(probe.report.runs).toHaveLength(2);
    expect(probe.report.runs[0].metrics.renderCpuMs.median).toBe(4);
    expect(probe.report.runs[0].metrics.drawCalls.median).toBe(7);
    expect(probe.report.repeatability.frameCpuMs.within3Percent).toBe(true);
    probe.report.restart();
    expect(probe.report.runs).toHaveLength(0);
    for (let i = 0; i < 6; i++) frame();
    expect(probe.report.status).toBe("complete");
  } finally {
    probe.dispose();
    vi.unstubAllGlobals();
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
  }
});

test("explicit host focus retains hidden, stalled and zero-delta frame guards", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  let now = 0,
    step = 20,
    delta = 20;
  const documentState = { visibilityState: "visible", hasFocus: () => false };
  vi.stubGlobal("document", documentState);
  vi.spyOn(performance, "now").mockImplementation(() => (now += step));
  vi.spyOn(scene, "isReady").mockReturnValue(true);
  vi.spyOn(engine, "getDeltaTime").mockImplementation(() => delta);
  const probe = createPerformanceProbe(scene, {
    frames: 2,
    warmup: 1,
    metadata: { focusValidation: "owner-confirmed embedded preview" },
    focused: () => true,
    ready: () => true,
    diagnostics: () => undefined,
    settings: () => ({}),
  });
  function frame() {
    engine.onBeginFrameObservable.notifyObservers(engine);
    probe.recordFrame({ renderCpuMs: 4, updateCpuMs: 1, frameCpuMs: 6 });
    engine.onEndFrameObservable.notifyObservers(engine);
  }
  try {
    frame();
    frame();
    expect(probe.report.progress).toBe(1);
    documentState.visibilityState = "hidden";
    frame();
    expect(probe.report.progress).toBe(0);
    documentState.visibilityState = "visible";
    step = 1000;
    frame();
    expect(probe.report.status).toBe("waiting");
    step = 20;
    delta = 0;
    frame();
    expect(probe.report.status).toBe("waiting");
    delta = 20;
    for (let i = 0; i < 6; i++) frame();
    expect(probe.report.status).toBe("complete");
    expect(probe.report.documentFocused).toBe(false);
  } finally {
    probe.dispose();
    vi.unstubAllGlobals();
    scene.dispose();
    engine.dispose();
    vi.restoreAllMocks();
  }
});
