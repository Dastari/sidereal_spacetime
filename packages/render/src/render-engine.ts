import { Engine } from "@babylonjs/core/Engines/engine";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { RenderBackend } from "./render-backend";
import type { WebGPUFailureHandler } from "./webgpu-backend";

export interface RenderEngineFactories {
  webgl(): AbstractEngine;
  webgpu(): Promise<AbstractEngine | undefined>;
}
/** A failed GPU context can lock the canvas to WebGPU. In that case the caller
 * must reload with WebGL on a fresh canvas; attempting another context cannot work. */
export async function chooseRenderEngine(
  requested: RenderBackend,
  factories: RenderEngineFactories,
) {
  if (requested === "webgl")
    return { engine: factories.webgl(), active: "webgl" as const };
  let reason = "WebGPU is unavailable in this browser. Using WebGL2.";
  try {
    const engine = await factories.webgpu();
    if (engine) return { engine, active: "webgpu" as const };
  } catch {
    reason = "WebGPU could not initialize. Using WebGL2.";
  }
  try {
    return { engine: factories.webgl(), active: "webgl" as const, reason };
  } catch {
    return {
      engine: undefined,
      active: "webgl" as const,
      reason,
      reloadWithWebGL: true as const,
    };
  }
}
export function createRenderEngine(
  canvas: HTMLCanvasElement,
  requested: RenderBackend,
  onWebGPUFailure?: WebGPUFailureHandler,
) {
  return chooseRenderEngine(requested, {
    webgl: () =>
      // Scene AA is owned by antialiasing-pipeline. The presentation pass is a
      // resolved full-screen image, so a second multisampled target adds cost.
      new Engine(canvas, false, {
        preserveDrawingBuffer: true,
        stencil: true,
        useLargeWorldRendering: true,
      }),
    webgpu: async () =>
      (await import("./webgpu-backend")).createWebGPUEngine(
        canvas,
        onWebGPUFailure,
      ),
  });
}
