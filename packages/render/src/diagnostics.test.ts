import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { createRenderDiagnostics } from "./diagnostics";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

test("closing and reopening diagnostics releases instrumentation observers", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const diagnostics = createRenderDiagnostics(scene);
  const baseline = scene.onAfterRenderObservable.observers.length;
  expect(diagnostics.read(false)).toBeUndefined();
  for (let i = 0; i < 3; i++) {
    expect(diagnostics.read(true)).toBeUndefined();
    scene.onAfterRenderObservable.notifyObservers(scene);
    const data = diagnostics.read(true)!;
    expect(data.renderWidth).toBe(engine.getRenderWidth());
    expect(scene.onAfterRenderObservable.observers.length).toBeGreaterThan(
      baseline,
    );
    expect(diagnostics.read(true)).toBe(data);
    expect(diagnostics.read(false)).toBeUndefined();
    // Babylon marks removal immediately, then splices deferred observers.
    expect(
      scene.onAfterRenderObservable.observers.filter(
        (o) => !o._willBeUnregistered,
      ).length,
    ).toBe(baseline);
  }
  diagnostics.read(true);
  diagnostics.dispose();
  expect(
    scene.onAfterRenderObservable.observers.filter(
      (o) => !o._willBeUnregistered,
    ).length,
  ).toBe(baseline);
  scene.dispose();
  expect(diagnostics.read(true)).toBeUndefined();
  engine.dispose();
});

test("draw calls are read from a completed frame even after the next frame resets them", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const diagnostics = createRenderDiagnostics(scene);
  expect(diagnostics.read(true)).toBeUndefined();
  engine._drawCalls.fetchNewFrame();
  engine._drawCalls.addCount(42, false);
  scene.onAfterRenderObservable.notifyObservers(scene);
  engine._drawCalls.fetchNewFrame();
  expect(engine._drawCalls.current).toBe(0);
  expect(diagnostics.read(true)?.drawCalls).toBe(42);
  diagnostics.dispose();
  scene.dispose();
  engine.dispose();
});

test("full-loop CPU is distinct from scene CPU and unsupported GPU timing stays unavailable", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    diagnostics = createRenderDiagnostics(scene);
  scene.lightsEnabled = false;
  scene.shadowsEnabled = false;
  diagnostics.recordFrameCpu(9, 7);
  diagnostics.read(true);
  scene.onAfterRenderObservable.notifyObservers(scene);
  const data = diagnostics.read(true)!;
  expect(data.frameCpuMs).toBe(9);
  expect(data.updateCpuMs).toBe(7);
  expect(data.gpuFrameMs).toBeUndefined();
  expect(data.lights).toBe(0);
  expect(data.shadowMaps).toBe(0);
  diagnostics.dispose();
  scene.dispose();
  engine.dispose();
});

test("independently disabled lighting does not hide shadow work Babylon still schedules", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    light = new DirectionalLight("sun", Vector3.Down(), scene);
  new ShadowGenerator(16, light);
  const diagnostics = createRenderDiagnostics(scene);
  scene.lightsEnabled = false;
  scene.shadowsEnabled = true;
  diagnostics.read(true);
  scene.onAfterRenderObservable.notifyObservers(scene);
  expect(diagnostics.read(true)?.lights).toBe(0);
  expect(diagnostics.read(true)?.shadowMaps).toBe(1);
  expect(diagnostics.read(true)?.allocatedShadowMaps).toBe(1);
  diagnostics.dispose();
  scene.dispose();
  engine.dispose();
});
