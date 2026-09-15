import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
// TAA/prepass need MRT, which Babylon's tree-shaken engine entry does not register.
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender";
import glslangJs from "@babylonjs/core/assets/glslang/glslang.js?url";
import glslangWasm from "@babylonjs/core/assets/glslang/glslang.wasm?url";
import twgslJs from "@babylonjs/core/assets/twgsl/twgsl.js?url";
import twgslWasm from "@babylonjs/core/assets/twgsl/twgsl.wasm?url";

/** Compiler assets are bundled from the pinned Babylon dependency, never a CDN. */
export async function createWebGPUEngine(canvas: HTMLCanvasElement) {
  if (!await WebGPUEngine.IsSupportedAsync) return undefined;
  const engine = new WebGPUEngine(canvas, {antialias:true,stencil:true,useLargeWorldRendering:true});
  try {
    await engine.initAsync({jsPath:glslangJs,wasmPath:glslangWasm}, {jsPath:twgslJs,wasmPath:twgslWasm});
    return engine;
  } catch (error) {
    engine.dispose();
    throw error;
  }
}
