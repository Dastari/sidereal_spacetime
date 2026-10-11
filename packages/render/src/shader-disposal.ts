import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { WebGLPipelineContext } from "@babylonjs/core/Engines/WebGL/webGLPipelineContext";

const installed = new WeakSet<AbstractEngine>();
/** Babylon 9.25.0 deletes a GL program without marking its pipeline disposed.
 * Effect's pending parallel compilation poll reads readiness before its own
 * disposed flag. Mark the context first so that poll never queries deleted GL
 * state. This preserves parallel compilation and immediate private mesh purge. */
export function guardShaderDisposal(engine: AbstractEngine) {
  if (engine.isWebGPU || installed.has(engine)) return;
  installed.add(engine);
  const remove = engine._deletePipelineContext.bind(engine);
  engine._deletePipelineContext = (context) => {
    if (context instanceof WebGLPipelineContext) context.dispose();
    remove(context);
  };
}
