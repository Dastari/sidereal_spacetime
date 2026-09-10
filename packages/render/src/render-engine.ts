import { Engine } from "@babylonjs/core/Engines/engine";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { RenderBackend } from "./render-backend";

export interface RenderEngineFactories {
  webgl(): AbstractEngine;
  webgpu(): Promise<AbstractEngine | undefined>;
}
/** A failed GPU context can lock the canvas to WebGPU. In that case the caller
 * must reload with WebGL on a fresh canvas; attempting another context cannot work. */
export async function chooseRenderEngine(requested: RenderBackend, factories: RenderEngineFactories) {
  if (requested === "webgl") return {engine:factories.webgl(),active:"webgl" as const};
  let reason = "WebGPU is unavailable. Using WebGL.";
  try {
    const engine = await factories.webgpu();
    if (engine) return {engine,active:"webgpu" as const};
  } catch { reason = "WebGPU could not initialize. Using WebGL."; }
  try { return {engine:factories.webgl(),active:"webgl" as const,reason}; }
  catch { return {engine:undefined,active:"webgl" as const,reason,reloadWithWebGL:true as const}; }
}
export function createRenderEngine(canvas: HTMLCanvasElement, requested: RenderBackend) {
  return chooseRenderEngine(requested, {
    webgl: () => new Engine(canvas, true, {preserveDrawingBuffer:true,stencil:true}),
    webgpu: async () => (await import("./webgpu-backend")).createWebGPUEngine(canvas),
  });
}
