import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { WebGLPipelineContext } from "@babylonjs/core/Engines/WebGL/webGLPipelineContext";
import {
  getCachedPipeline,
  resetCachedPipeline,
} from "@babylonjs/core/Materials/effect.functions";

type NamedPipeline = WebGLPipelineContext & { _name?: string };
const installed = new WeakSet<AbstractEngine>();
/** Retire private GPU bindings immediately, but let parallel compilation finish
 * before deleting its generic program. The reviewed ANGLE backend reports a
 * delayed GL error when a still-compiling program is deleted. No meshes,
 * materials, callbacks or owner data are retained by this cleanup queue. */
export function guardShaderDisposal(engine: AbstractEngine) {
  if (engine.isWebGPU || installed.has(engine)) return;
  installed.add(engine);
  const remove = engine._deletePipelineContext.bind(engine);
  const retired = new WeakSet<WebGLPipelineContext>();
  const pending = new Map<
    WebGLPipelineContext,
    ReturnType<typeof setTimeout>
  >();
  const finish = (context: WebGLPipelineContext) => {
    const timer = pending.get(context);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(context);
    const gl = context.context!;
    if (context.vertexShader) gl.deleteShader(context.vertexShader);
    if (context.fragmentShader) gl.deleteShader(context.fragmentShader);
    context.vertexShader = context.fragmentShader = undefined;
    remove(context);
  };
  engine.onDisposeObservable.addOnce(() => {
    for (const context of pending.keys()) finish(context);
  });
  engine._deletePipelineContext = (value) => {
    if (!(value instanceof WebGLPipelineContext)) return remove(value);
    const context = value as NamedPipeline;
    if (retired.has(context)) return;
    retired.add(context);
    context.dispose(); // Pending Babylon readiness polls must not bind it again.
    context.onCompiled = undefined;
    if (context.program)
      (
        context.program as WebGLProgram & { __SPECTOR_rebuildProgram?: unknown }
      ).__SPECTOR_rebuildProgram = null;
    if (
      context.context &&
      context._name &&
      getCachedPipeline(context._name, context.context) === context
    )
      resetCachedPipeline(context);
    // The SDK's deferred reset must not evict a newly compiled same-key program.
    context._name = undefined;
    const gl = context.context;
    if (!gl) return remove(context);
    // Keep a fresh handle-only context, never the original uniform-value caches.
    const cleanup = new WebGLPipelineContext();
    cleanup.context = gl;
    cleanup.program = context.program;
    cleanup.vertexShader = context.vertexShader;
    cleanup.fragmentShader = context.fragmentShader;
    cleanup.isParallelCompiled = context.isParallelCompiled;
    cleanup.dispose();
    context.program = null;
    context.vertexShader = context.fragmentShader = undefined;
    const status =
      engine.getCaps().parallelShaderCompile?.COMPLETION_STATUS_KHR;
    const poll = () => {
      if (
        !cleanup.program ||
        !cleanup.isParallelCompiled ||
        !status ||
        engine.isDisposed ||
        gl.isContextLost() ||
        gl.getProgramParameter(cleanup.program, status)
      )
        finish(cleanup);
      else pending.set(cleanup, setTimeout(poll, 16));
    };
    poll();
  };
}
