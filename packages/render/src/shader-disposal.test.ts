import { expect, test, vi } from "vitest";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { WebGLPipelineContext } from "@babylonjs/core/Engines/WebGL/webGLPipelineContext";
import { _isRenderingStateCompiled } from "@babylonjs/core/Engines/thinEngine.functions";
import { Observable } from "@babylonjs/core/Misc/observable";
import { getStateObject } from "@babylonjs/core/Engines/thinEngine.functions";
import {
  getCachedPipeline,
  resetCachedPipeline,
} from "@babylonjs/core/Materials/effect.functions";
import { guardShaderDisposal } from "./shader-disposal";

test("a pending compilation poll never queries a deleted WebGL program", () => {
  let deleted = false;
  const query = vi.fn(() => {
    if (deleted) throw Error("GL_INVALID_VALUE: deleted program");
    return false;
  });
  const gl = {
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
    getProgramParameter: query,
  } as unknown as WebGL2RenderingContext;
  const remove = vi.fn(() => {
    deleted = true;
  });
  const engine = {
    isWebGPU: false,
    getCaps: () => ({}),
    onDisposeObservable: new Observable<AbstractEngine>(),
    _deletePipelineContext: remove,
    _isRenderingStateCompiled: (p: WebGLPipelineContext) =>
      _isRenderingStateCompiled(p, gl, false),
  } as unknown as AbstractEngine;
  const pipeline = new WebGLPipelineContext();
  pipeline.isParallelCompiled = true;
  pipeline.program = {} as WebGLProgram;
  pipeline.context = gl;
  pipeline.setEngine(engine);
  expect(pipeline.isReady).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
  guardShaderDisposal(engine);
  const guarded = engine._deletePipelineContext;
  guardShaderDisposal(engine);
  expect(engine._deletePipelineContext).toBe(guarded);
  engine._deletePipelineContext(pipeline);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(pipeline.isReady).toBe(false);
  expect(query).toHaveBeenCalledTimes(1);
});

test("WebGPU retains its native pipeline disposal", () => {
  const remove = vi.fn();
  const engine = {
    isWebGPU: true,
    _deletePipelineContext: remove,
  } as unknown as AbstractEngine;
  guardShaderDisposal(engine);
  expect(engine._deletePipelineContext).toBe(remove);
});

function pendingFixture() {
  let complete = false;
  const gl = {
    getExtension: () => ({ COMPLETION_STATUS_KHR: 0x91b1 }),
    getProgramParameter: vi.fn(() => complete),
    isContextLost: () => false,
    deleteShader: vi.fn(),
  } as unknown as WebGL2RenderingContext;
  const remove = vi.fn((p: WebGLPipelineContext) => resetCachedPipeline(p));
  const engine = {
    isWebGPU: false,
    isDisposed: false,
    getCaps: () => ({
      parallelShaderCompile: { COMPLETION_STATUS_KHR: 0x91b1 },
    }),
    onDisposeObservable: new Observable<AbstractEngine>(),
    _deletePipelineContext: remove,
  } as unknown as AbstractEngine;
  const p = new WebGLPipelineContext() as WebGLPipelineContext & {
    _name?: string;
  };
  p.context = gl;
  p.program = {} as WebGLProgram;
  p.isParallelCompiled = true;
  p.vertexShader = {} as WebGLShader;
  p.fragmentShader = {} as WebGLShader;
  p._name = "same-shader";
  p.onCompiled = vi.fn();
  (p.program as any).__SPECTOR_rebuildProgram = vi.fn();
  getStateObject(gl).cachedPipelines["same-shader"] = p;
  guardShaderDisposal(engine);
  return {
    gl,
    engine,
    p,
    program: p.program,
    remove,
    complete: () => {
      complete = true;
    },
  };
}
test("pending programs retain only shader handles until completion, preserving a same-key replacement", async () => {
  vi.useFakeTimers();
  try {
    const f = pendingFixture();
    f.engine._deletePipelineContext(f.p);
    expect(f.p._isDisposed).toBe(true);
    expect(f.p.onCompiled).toBeUndefined();
    expect(f.p.program).toBeNull();
    expect(f.p.vertexShader).toBeUndefined();
    expect(f.p.fragmentShader).toBeUndefined();
    expect((f.program as any).__SPECTOR_rebuildProgram).toBeNull();
    expect(getCachedPipeline("same-shader", f.gl)).toBeUndefined();
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.gl.deleteShader).not.toHaveBeenCalled();
    const replacement = new WebGLPipelineContext();
    getStateObject(f.gl).cachedPipelines["same-shader"] = replacement;
    await vi.advanceTimersByTimeAsync(32);
    expect(f.remove).not.toHaveBeenCalled();
    f.complete();
    await vi.advanceTimersByTimeAsync(16);
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(f.p.vertexShader).toBeUndefined();
    expect(f.p.fragmentShader).toBeUndefined();
    expect(getCachedPipeline("same-shader", f.gl)).toBe(replacement);
    expect(replacement._isDisposed).toBe(false);
    f.engine._deletePipelineContext(f.p);
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
test("engine shutdown cleans queued handles and cancels their polling", async () => {
  vi.useFakeTimers();
  try {
    const f = pendingFixture();
    f.engine._deletePipelineContext(f.p);
    f.engine.onDisposeObservable.notifyObservers(f.engine);
    const calls = vi.mocked(f.gl.getProgramParameter).mock.calls.length;
    await vi.advanceTimersByTimeAsync(100);
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(f.gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(f.gl.getProgramParameter).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
