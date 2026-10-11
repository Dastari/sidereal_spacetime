import { expect, test, vi } from "vitest";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { WebGLPipelineContext } from "@babylonjs/core/Engines/WebGL/webGLPipelineContext";
import { _isRenderingStateCompiled } from "@babylonjs/core/Engines/thinEngine.functions";
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
    _deletePipelineContext: remove,
    _isRenderingStateCompiled: (p: WebGLPipelineContext) =>
      _isRenderingStateCompiled(p, gl, false),
  } as unknown as AbstractEngine;
  const pipeline = new WebGLPipelineContext();
  pipeline.isParallelCompiled = true;
  pipeline.program = {} as WebGLProgram;
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
