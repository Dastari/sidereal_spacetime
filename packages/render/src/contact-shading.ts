/**
 * Soft, short-range contact shading (SSAO) for the molded-plastic look: ~10-20 % darkening where
 * plates, walls, props and boots meet, deeper only in real cavities. Optional and cheap:
 *
 * - screen-space at half resolution through Babylon's pre-pass renderer (depth and normals come
 *   from the main pass's extra render targets, so no geometry is drawn twice; the cost is four
 *   full-screen passes);
 * - off with `?ao=0` or localStorage `sidereal.contactShading.v1 = "off"`, and automatically off
 *   where the pre-pass renderer is unsupported or while SSAA/TAA own the scene target (they size
 *   and jitter it differently);
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

export const CONTACT_SHADING_STORAGE_KEY = "sidereal.contactShading.v1";

/** Preference: on unless the URL (`ao=0`) or stored preference turns it off. */
export function contactShadingRequested(
  storage: Pick<Storage, "getItem"> | undefined,
  search = "",
) {
  const query = new URLSearchParams(search).get("ao");
  if (query === "0" || query === "off") return false;
  if (query === "1" || query === "on") return true;
  try {
    return storage?.getItem(CONTACT_SHADING_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Antialiasing modes whose scene target can be shared with the pre-pass renderer. */
export function contactShadingCompatible(mode: string) {
  return (
    mode === "off" || mode === "msaa" || mode === "fxaa" || mode === "msaa-fxaa"
  );
}

export interface ContactShading {
  /** Whether the SSAO pipeline is currently attached. */
  readonly active: boolean;
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
  const supported = enabled && SSAO2RenderingPipeline.IsSupported;
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
        const want = contactShadingCompatible(plan.mode);
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
    dispose() {
      if (frame) scene.onBeforeRenderObservable.remove(frame);
      if (pipeline) detach();
    },
  };
}
