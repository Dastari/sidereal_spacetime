/**
 * Screen-space silhouette outline for hovered and selected objects (owner live feedback
 * 2026-09-29: "when 'selecting' objects/components etc things we should use silhouette outline
 * selection not box selection"). Presentation only.
 *
 * - One mask render target draws only the given proxy meshes (layerMask 0, never in the main
 *   pass): the selected proxy into the red channel, the hovered one into green. Nothing else is
 *   drawn into it, so the cost is one or two small draws plus one full-screen pass, and zero
 *   while nothing is hovered or selected (the target and the pass are detached).
 * - One post-process dilates each channel and keeps only the ring outside the object:
 *   selected = a strong 3 px cyan edge, hover = a thin 1 px pale edge.
 * - Callers supply per-object proxy geometry, so batched ship meshes outline only the picked
 *   object (see prefab-ship-interaction.ts, which cuts the object's triangles out of the batch).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const vertexSource = `precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
void main() { gl_Position = worldViewProjection * vec4(position, 1.0); }`;
const fragmentSource = `precision highp float;
uniform vec3 channel;
void main() { gl_FragColor = vec4(channel, 1.0); }`;

/** Outline colours (linear-ish sRGB mixed after grading) and widths. */
export const OBJECT_OUTLINE = {
  selected: { colour: [0.494, 0.937, 1.0], radiusPx: 3 },
  hover: { colour: [0.86, 0.93, 1.0], radiusPx: 1, strength: 0.75 },
} as const;

ShaderStore.ShadersStore.siderealObjectOutlineFragmentShader = `precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D outlineMask;
uniform vec2 texel;
void main() {
  vec4 sceneColor = texture2D(textureSampler, vUV);
  vec2 center = texture2D(outlineMask, vUV).rg;
  vec2 near = center;
  for (int x = -3; x <= 3; x++) {
    for (int y = -3; y <= 3; y++) {
      vec2 m = texture2D(outlineMask, vUV + vec2(float(x), float(y)) * texel).rg;
      float d = float(x * x + y * y);
      if (d <= 10.0) near.r = max(near.r, m.r);
      if (d <= 2.0) near.g = max(near.g, m.g);
    }
  }
  float selectedEdge = clamp(near.r - center.r - center.g, 0.0, 1.0);
  float hoverEdge = clamp(near.g - center.g - center.r, 0.0, 1.0) * ${OBJECT_OUTLINE.hover.strength.toFixed(2)};
  vec3 c = mix(sceneColor.rgb, vec3(${OBJECT_OUTLINE.hover.colour.map((v) => v.toFixed(3)).join(", ")}), hoverEdge);
  c = mix(c, vec3(${OBJECT_OUTLINE.selected.colour.map((v) => v.toFixed(3)).join(", ")}), selectedEdge);
  gl_FragColor = vec4(c, sceneColor.a);
}`;

export type OutlineKind = "selected" | "hover";

export function createObjectOutline(scene: Scene) {
  const engine = scene.getEngine();
  const size = () => ({
    width: Math.max(1, engine.getRenderWidth()),
    height: Math.max(1, engine.getRenderHeight()),
  });
  const mask = new RenderTargetTexture(
    "object-outline-mask",
    size(),
    scene,
    false,
    true,
    undefined,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  mask.clearColor = new Color4(0, 0, 0, 1);
  mask.renderParticles = false;
  mask.renderSprites = false;
  mask.renderList = [];
  const material = (kind: OutlineKind) => {
    const m = new ShaderMaterial(
      `object-outline-${kind}`,
      scene,
      { vertexSource, fragmentSource },
      {
        attributes: ["position"],
        uniforms: ["worldViewProjection", "channel"],
      },
    );
    m.setVector3(
      "channel",
      new Vector3(kind === "selected" ? 1 : 0, kind === "hover" ? 1 : 0, 0),
    );
    m.backFaceCulling = false;
    return m;
  };
  const materials = {
    selected: material("selected"),
    hover: material("hover"),
  };
  const current: Record<OutlineKind, Mesh | undefined> = {
    selected: undefined,
    hover: undefined,
  };
  const edge = new PostProcess(
    "object-outline",
    "siderealObjectOutline",
    ["texel"],
    ["outlineMask"],
    1,
    null,
    Texture.NEAREST_SAMPLINGMODE,
    engine,
  );
  edge.onApply = (effect) => {
    effect.setTexture("outlineMask", mask);
    effect.setFloat2(
      "texel",
      1 / mask.getSize().width,
      1 / mask.getSize().height,
    );
  };
  let camera = scene.activeCamera;
  let attached = false;
  let maskRendered = false;
  mask.onAfterRenderObservable.add(() => {
    maskRendered = true;
  });
  const resize = engine.onResizeObservable.add(() => {
    mask.resize(size());
    maskRendered = false;
  });
  const active = () => !!(current.selected || current.hover);
  const detach = () => {
    if (attached) camera?.detachPostProcess(edge);
    attached = false;
    const index = scene.customRenderTargets.indexOf(mask);
    if (index >= 0) scene.customRenderTargets.splice(index, 1);
    maskRendered = false;
  };
  // Warm the mask and the edge effect first, then attach on a frame boundary (compiling an
  // attached post-process can blank the camera for a frame).
  const frame = scene.onBeforeRenderObservable.add(() => {
    if (!active()) return;
    if (scene.activeCamera !== camera) {
      if (attached) camera?.detachPostProcess(edge);
      attached = false;
      camera = scene.activeCamera;
    }
    mask.activeCamera = camera;
    if (attached || !camera || !maskRendered || !edge.isReady()) return;
    for (const kind of ["selected", "hover"] as const) {
      const m = current[kind];
      if (m && !materials[kind].isReady(m)) return;
    }
    camera.attachPostProcess(edge);
    attached = true;
  });
  function set(kind: OutlineKind, mesh: Mesh | undefined) {
    const previous = current[kind];
    if (previous === mesh) return;
    if (previous) {
      mask.setMaterialForRendering(previous);
      mask.renderList = (mask.renderList ?? []).filter((m) => m !== previous);
    }
    current[kind] = mesh;
    if (mesh) {
      mask.renderList = [...(mask.renderList ?? []), mesh];
      mask.setMaterialForRendering(mesh, materials[kind]);
    }
    if (active()) {
      if (!scene.customRenderTargets.includes(mask))
        scene.customRenderTargets.push(mask);
    } else detach();
  }
  return {
    set,
    /** Whether the outline pass is attached (diagnostics/tests). */
    get attached() {
      return attached;
    },
    get active() {
      return active();
    },
    dispose() {
      set("selected", undefined);
      set("hover", undefined);
      detach();
      scene.onBeforeRenderObservable.remove(frame);
      engine.onResizeObservable.remove(resize);
      edge.dispose(camera ?? undefined);
      mask.dispose();
      materials.selected.dispose();
      materials.hover.dispose();
    },
  };
}
export type ObjectOutline = ReturnType<typeof createObjectOutline>;
