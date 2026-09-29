import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
// TAA/prepass need MRT, which Babylon's tree-shaken engine entry does not register.
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import glslangJs from "@babylonjs/core/assets/glslang/glslang.js?url";
import glslangWasm from "@babylonjs/core/assets/glslang/glslang.wasm?url";
import twgslJs from "@babylonjs/core/assets/twgsl/twgsl.js?url";
import twgslWasm from "@babylonjs/core/assets/twgsl/twgsl.wasm?url";

/** Called once with a short reason when WebGPU cannot render the scene correctly. */
export type WebGPUFailureHandler = (reason: string) => void;

type EngineInternals = {
  _compileRawShaderToSpirV(source: string, stage: string): unknown;
  _device?: GPUDevice;
};

/** Compiler assets are bundled from the pinned Babylon dependency, never a CDN. */
export async function createWebGPUEngine(
  canvas: HTMLCanvasElement,
  onFailure?: WebGPUFailureHandler,
) {
  if (!(await WebGPUEngine.IsSupportedAsync)) return undefined;
  const engine = new WebGPUEngine(canvas, {
    antialias: true,
    stencil: true,
    useLargeWorldRendering: true,
    // Request the adapter's limits rather than the WebGPU defaults: per-stage uniform
    // buffers bound how many lights Babylon lets a material use under WebGPU.
    setMaximumLimits: true,
  });
  try {
    await engine.initAsync(
      { jsPath: glslangJs, wasmPath: glslangWasm },
      { jsPath: twgslJs, wasmPath: twgslWasm },
    );
    if (onFailure) watchWebGPUFailures(engine, onFailure);
    return engine;
  } catch (error) {
    engine.dispose();
    throw error;
  }
}

/**
 * Reports the failures that leave a WebGPU scene visibly broken: a GLSL shader glslang
 * rejects (Babylon otherwise only logs an unhandled rejection), an invalid shader module or
 * render pipeline, and a lost device. The failing shader is logged with line numbers.
 */
export function watchWebGPUFailures(
  engine: WebGPUEngine,
  onFailure: WebGPUFailureHandler,
) {
  let reported = false;
  const fail = (reason: string) => {
    if (reported) return;
    reported = true;
    onFailure(reason);
  };
  const internals = engine as unknown as EngineInternals;
  const compile = internals._compileRawShaderToSpirV.bind(engine);
  internals._compileRawShaderToSpirV = (source, stage) => {
    try {
      return compile(source, stage);
    } catch (error) {
      console.error(
        `WebGPU ${stage} shader failed to compile (glslang log above):\n` +
          source
            .split("\n")
            .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
            .join("\n"),
      );
      fail(`${stage} shader compilation failed`);
      throw error;
    }
  };
  internals._device?.addEventListener("uncapturederror", (event) => {
    const message = (event as GPUUncapturedErrorEvent).error?.message ?? "";
    if (/ShaderModule|RenderPipeline|WGSL/i.test(message))
      fail(`invalid shader pipeline: ${message.split("\n")[0]!.slice(0, 120)}`);
  });
  engine.onContextLostObservable.addOnce(() => fail("GPU device lost"));
}
