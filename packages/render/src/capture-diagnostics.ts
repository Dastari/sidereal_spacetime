import type { Scene } from "@babylonjs/core/scene";
import type { RenderTargetWrapper } from "@babylonjs/core/Engines/renderTargetWrapper";
import type { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";

export interface CaptureDiagnostics {
  name: string;
  width?: number;
  height?: number;
  samples?: number;
}
/** Read allocated targets, never infer MSAA from settings or temporal sample count. */
export function readSceneCapture(scene: Scene): CaptureDiagnostics | undefined {
  const prepass = scene.prePassRenderer;
  if (prepass?.enabled && prepass.defaultRT.enabled) {
    const target = prepass.defaultRT;
    return describe(target.name, target.renderTarget);
  }
  const first = scene.activeCamera?._postProcesses.find((pass) => !!pass);
  if (!first) return undefined;
  // Babylon 9.25 activate() chooses these before its own allocated input target.
  const pass = first as unknown as {
    _shareOutputWithPostProcess?: PostProcess;
    _forcedOutputTexture?: RenderTargetWrapper;
  };
  return describe(
    first.name,
    pass._shareOutputWithPostProcess?.inputTexture ??
      pass._forcedOutputTexture ??
      first.inputTexture,
  );
}
function describe(
  name: string,
  target: RenderTargetWrapper | null | undefined,
): CaptureDiagnostics {
  return target
    ? {
        name,
        width: target.width,
        height: target.height,
        samples: target.samples,
      }
    : { name };
}
