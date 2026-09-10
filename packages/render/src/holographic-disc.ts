import { setMeshRole } from './mesh-roles';
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Plane } from "@babylonjs/core/Maths/math.plane";

const vertexSource = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
varying vec4 vClip;
void main() {
  vUV = uv;
  vClip = worldViewProjection * vec4(position, 1.0);
  gl_Position = vClip;
}`;

const fragmentSource = `precision highp float;
varying vec2 vUV;
varying vec4 vClip;
uniform float time;
uniform float motion;
uniform float reflectionEnabled;
uniform sampler2D reflectionSampler;
const float PI = 3.14159265359;
const float TAU = 6.28318530718;
float ring(float r, float radius, float width) {
  float d = abs(r-radius);
  return 1.0-smoothstep(width*.4, width*1.7, d);
}
float arc(float angle, float start, float span) {
  float a = mod(angle-start+TAU*4.0, TAU);
  return smoothstep(0.0,.024,a)*(1.0-smoothstep(span-.024,span,a));
}
void main() {
  vec2 p = (vUV-.5)*2.0;
  float r = length(p), a = atan(p.y,p.x);
  if (r>1.0) discard;
  float t = time*motion;
  float thin = ring(r,.752,.0035)*.5 + ring(r,.78,.0038)*.8;
  thin += ring(r,.61,.0028)*.55 + ring(r,.405,.0027)*.4;
  float broken = arc(a,t*.085,.9)+arc(a,t*.085+2.12,1.15)+arc(a,t*.085+4.35,.8);
  float bright = ring(r,.704,.007)*broken;
  bright += ring(r,.535,.006)*(arc(a,-t*.12+.25,.84)+arc(a,-t*.12+3.2,.84));
  bright += ring(r,.817,.004)*(arc(a,.25,1.25)+arc(a,PI+.25,1.25));
  float tickAngle = abs(fract((a+PI)/TAU*72.0)-.5);
  float ticks = (1.0-smoothstep(.075,.15,tickAngle))*smoothstep(.835,.84,r)*(1.0-smoothstep(.864,.87,r));
  float majorAngle = abs(fract((a+PI)/TAU*12.0)-.5);
  ticks += (1.0-smoothstep(.017,.037,majorAngle))*smoothstep(.79,.795,r)*(1.0-smoothstep(.888,.894,r));
  float sweepAngle = mod(a-t*.18+TAU*4.0,TAU);
  float sweep = exp(-sweepAngle*9.0)*smoothstep(.3,.4,r)*(1.0-smoothstep(.7,.76,r))*.16;
  // Short, softly gated electrical filaments crawl around a ring. The gate
  // is smooth (no strobe); reduced motion fixes both the time and amplitude.
  float filamentRadius = .66 + .008*sin(a*41.0-t*2.2)+.004*sin(a*97.0+t*.8);
  float gate = arc(a,t*.21+1.7,.58)*(motion*.7+.3);
  float filament = ring(r,filamentRadius,.0023)*gate;
  float glow = exp(-pow((r-.714)/.065,2.0))*.13;
  glow += exp(-pow((r-.54)/.038,2.0))*.07;
  float surface = exp(-r*r*5.4)*.065;
  float ink = clamp(thin+bright+ticks*.7+filament*.9,0.0,1.0);
  float alpha = clamp(ink*.88+glow+surface+sweep,0.0,.95);
  vec3 blue = vec3(.025,.42,.95);
  vec3 cyan = vec3(.13,.88,1.0);
  vec3 color = mix(blue,cyan,clamp(ink*.8+filament*.4,0.0,1.0));
  // The real actor reflection is faint and fades before the outer rings.
  vec2 reflectionUV = vClip.xy/vClip.w*.5+.5;
  vec4 reflected = texture2D(reflectionSampler,reflectionUV);
  float reflection = reflected.a*(1.0-smoothstep(.28,.7,r))*.13*reflectionEnabled;
  color = mix(color,reflected.rgb*vec3(.3,.72,1.0),reflection/(alpha+reflection+.001));
  alpha = clamp(alpha+reflection,0.0,.95);
  if (alpha<.001) discard;
  gl_FragColor = vec4(color,alpha);
}`;

/** A two-triangle light projection, never a solid pedestal or gameplay collider.
 * The caller advances it only while visible and owns the surrounding scene. */
export function createHolographicDisc(
  scene: Scene,
  options: {
    radius?: number;
    reflections?: boolean;
    bloom?: boolean;
  } = {},
) {
  const radius = Math.max(0.35, Math.min(2, options.radius ?? 1.08));
  const mesh = CreateGround(
    "portrait-holographic-projection",
    { width: radius * 2, height: radius * 2 },
    scene,
  );
  setMeshRole(mesh, "effect");
  mesh.position.y = 0.004;
  mesh.isPickable = false;
  mesh.metadata = { presentationOnly: true, holographicDisc: true, role: 'effect' };
  const mirror = new MirrorTexture(
    "portrait-floor-reflection",
    256,
    scene,
    false,
  );
  mirror.mirrorPlane = new Plane(0, -1, 0, 0.003);
  mirror.clearColor = new Color4(0, 0, 0, 0);
  mirror.renderParticles = false;
  mirror.renderList = [];
  mirror.wrapU = mirror.wrapV = Texture.CLAMP_ADDRESSMODE;
  mirror.activeCamera = scene.activeCamera;
  const reflections = options.reflections !== false;
  if (reflections) scene.customRenderTargets.push(mirror);
  const material = new ShaderMaterial(
    "portrait-holographic-light",
    scene,
    { vertexSource, fragmentSource },
    {
      attributes: ["position", "uv"],
      uniforms: ["worldViewProjection", "time", "motion", "reflectionEnabled"],
      samplers: ["reflectionSampler"],
      needAlphaBlending: true,
    },
  );
  material.setTexture("reflectionSampler", mirror);
  material.setFloat("reflectionEnabled", reflections ? 1 : 0);
  material.setFloat("time", 0);
  material.setFloat("motion", 1);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alphaMode = Constants.ALPHA_COMBINE;
  mesh.material = material;

  const light = new PointLight(
    "portrait-projector-boot-light",
    new Vector3(0, 0.12, 0),
    scene,
  );
  light.diffuse = new Color3(0.02, 0.62, 1);
  light.specular = new Color3(0.02, 0.5, 0.95);
  light.intensity = 1.1;
  light.range = 1.1;
  const glow =
    options.bloom === false
      ? undefined
      : new GlowLayer("portrait-projection-bloom", scene, {
          mainTextureRatio: 0.5,
          blurKernelSize: 22,
          excludeByDefault: true,
          // Default additive glow preserves zero background alpha, which vanishes
          // when the canvas is composited into the HUD. Accumulate the bloom alpha.
          alphaBlendingMode: Constants.ALPHA_SCREENMODE,
        });
  glow?.addIncludedOnlyMesh(mesh);
  glow?.referenceMeshToUseItsOwnMaterial(mesh);
  if (glow) {
    glow.intensity = 0.94;
    glow.neutralColor = new Color4(0, 0, 0, 0);
    // Opaque subjects write depth into the mask without adding a dark alpha
    // silhouette to the blurred transparent output. The disc uses its shader.
    glow.customEmissiveColorSelector = (_mesh, _subMesh, _material, result) =>
      result.set(0, 0, 0, 0);
  }
  let occluders: Mesh[] = [];
  let disposed = false;
  return {
    mesh,
    light,
    setSubjects(meshes: readonly AbstractMesh[]) {
      if (disposed) return;
      mirror.renderList = meshes.filter(
        (item) => !item.isDisposed() && item.getTotalVertices() > 0,
      );
      light.includedOnlyMeshes = [...mirror.renderList];
      if (glow) {
        for (const item of occluders) glow.removeIncludedOnlyMesh(item);
        occluders = meshes.filter(
          (item): item is Mesh =>
            item instanceof Mesh &&
            !item.isDisposed() &&
            item.getTotalVertices() > 0 &&
            !!item.material &&
            !item.material.needAlphaBlending(),
        );
        for (const item of occluders) glow.addIncludedOnlyMesh(item);
      }
    },
    update(timeSeconds: number, reducedMotion = false) {
      if (disposed) return;
      const t = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
      material.setFloat("time", reducedMotion ? 0 : t % 86400);
      material.setFloat("motion", reducedMotion ? 0 : 1);
      light.intensity = reducedMotion ? 1.1 : 1.1 + Math.sin(t * 0.65) * 0.055;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      occluders = [];
      glow?.dispose();
      const index = scene.customRenderTargets.indexOf(mirror);
      if (index >= 0) scene.customRenderTargets.splice(index, 1);
      mirror.dispose();
      mesh.dispose();
      material.dispose();
      light.dispose();
    },
  };
}
