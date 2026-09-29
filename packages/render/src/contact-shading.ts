/**
 * Soft, short-range contact shading (SSAO) for the molded-plastic look: ~10-20 % darkening where
 * plates, walls, props and boots meet, deeper only in real cavities. Optional and cheap:
 *
 * - screen-space at half resolution through Babylon's pre-pass renderer (depth and normals come
 *   from the main pass's extra render targets, so no geometry is drawn twice; the cost is four
 *   full-screen passes);
 * - OFF by default since the owner's live frame-rate report (2026-09-29); switched live from the
 *   F3 debug window or `?ao=1` (render-quality.ts), and automatically off where the pre-pass
 *   renderer is unsupported or while SSAA/TAA own the scene target (they size and jitter it
 *   differently);
 * - MSAA coverage moves to the pre-pass target (same sample count as the antialiasing plan).
 *
 * Presentation only.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";
import "@babylonjs/core/Rendering/prePassRendererSceneComponent";

export const CONTACT_SHADING = {
  /** SSAO and blur resolution relative to the canvas. */
  ratio: 0.5,
  /** World-space sample radius (metres): short range, joins not rooms. */
  radius: 0.5,
  /**
   * Darkening per occluded sample fraction (Babylon SSAO2: ao = 1 - strength * occludedFraction).
   * A 90-degree join occludes roughly a third of the hemisphere samples (~15 % darker); only a
   * real cavity approaches the 50 % ceiling.
   */
  totalStrength: 0.5,
  /** Added after occlusion (clamped); 0 keeps the strength above as the only control. */
  base: 0,
  samples: 8,
  /** Depth range considered (metres from the camera). */
  maxZ: 150,
  minZAspect: 0.3,
} as const;

/** Antialiasing modes whose scene target can be shared with the pre-pass renderer. */
export function contactShadingCompatible(mode: string) {
  return (
    mode === "off" || mode === "msaa" || mode === "fxaa" || mode === "msaa-fxaa"
  );
}

export interface ContactShading {
  /** Whether the SSAO pipeline is currently attached. */
  readonly active: boolean;
  /** Whether SSAO is wanted (it still steps aside under TAA/SSAA). Applied on the next frame. */
  enabled: boolean;
  dispose(): void;
}

export function createContactShading(
  scene: Scene,
  camera: Camera,
  antialiasing: {
    snapshot(): { effective: { mode: string; samples: number } };
  },
  enabled: boolean,
): ContactShading {
  let pipeline: SSAO2RenderingPipeline | undefined;
  let samples = 0;
  let wanted = enabled;
  const supported = SSAO2RenderingPipeline.IsSupported;
  const attach = () => {
    const p = new SSAO2RenderingPipeline(
      "molded-contact-shading",
      scene,
      { ssaoRatio: CONTACT_SHADING.ratio, blurRatio: CONTACT_SHADING.ratio },
      [camera],
    );
    p.radius = CONTACT_SHADING.radius;
    p.totalStrength = CONTACT_SHADING.totalStrength;
    p.base = CONTACT_SHADING.base;
    p.samples = CONTACT_SHADING.samples;
    p.maxZ = CONTACT_SHADING.maxZ;
    p.minZAspect = CONTACT_SHADING.minZAspect;
    p.expensiveBlur = false;
    return p;
  };
  const detach = () => {
    pipeline?.dispose(true);
    pipeline = undefined;
    // The pre-pass renderer disables itself once no effect needs it (TAA may still use it).
    samples = 0;
  };
  const frame = supported
    ? scene.onBeforeRenderObservable.add(() => {
        const plan = antialiasing.snapshot().effective;
        const want = wanted && contactShadingCompatible(plan.mode);
        if (want && !pipeline) pipeline = attach();
        else if (!want && pipeline) detach();
        // MSAA coverage now lives on the pre-pass target.
        const target = Math.max(1, plan.samples);
        if (pipeline && samples !== target) {
          pipeline.textureSamples = target;
          samples = target;
        }
      })
    : undefined;
  return {
    get active() {
      return !!pipeline;
    },
    get enabled() {
      return wanted;
    },
    set enabled(value: boolean) {
      wanted = value;
    },
    dispose() {
      if (frame) scene.onBeforeRenderObservable.remove(frame);
      if (pipeline) detach();
    },
  };
}
