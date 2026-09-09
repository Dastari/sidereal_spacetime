import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Color4 } from '@babylonjs/core/Maths/math.color';

const vertexSource = `precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
void main() { gl_Position = worldViewProjection * vec4(position, 1.0); }`;
const fragmentSource = `precision highp float;
uniform float selected;
void main() { gl_FragColor = vec4(selected, selected, selected, 1.0); }`;
ShaderStore.ShadersStore.siderealSelectionEdgeFragmentShader = `precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform sampler2D selectionMask;
uniform vec2 texel;
void main() {
  vec4 sceneColor = texture2D(textureSampler, vUV);
  float center = texture2D(selectionMask, vUV).r;
  float nearby = center;
  // A circular three-pixel dilation, minus the union mask itself. No normal
  // expansion, material seams or main-scene stencil dependency.
  for (int x = -3; x <= 3; x++) {
    for (int y = -3; y <= 3; y++) {
      if (x*x + y*y <= 10) nearby = max(nearby,
        texture2D(selectionMask, vUV + vec2(float(x), float(y))*texel).r);
    }
  }
  float edge = clamp(nearby - center, 0.0, 1.0);
  gl_FragColor = vec4(mix(sceneColor.rgb, vec3(0.494, 0.937, 1.0), edge), sceneColor.a);
}`;

/** One cached union mask; no selection render passes while inactive. */
export function createSelectionSilhouette(scene: Scene, meshes: AbstractMesh[], placementId: string) {
  const engine = scene.getEngine();
  const size = () => ({width: engine.getRenderWidth(), height: engine.getRenderHeight()});
  const mask = new RenderTargetTexture('object-selection-mask', size(), scene, false, true,
    undefined, false, Texture.NEAREST_SAMPLINGMODE);
  mask.clearColor = new Color4(0,0,0,1);
  mask.renderParticles = false;
  mask.renderList = meshes;
  mask.activeCamera = scene.activeCamera;
  const materials = [0,1].map(selected => {
    const material = new ShaderMaterial(`selection-mask-${selected}`, scene,
      {vertexSource,fragmentSource}, {attributes:['position'],uniforms:['worldViewProjection','selected']});
    material.setFloat('selected', selected);
    material.backFaceCulling = false;
    return material;
  });
  const camera=scene.activeCamera;
  let selected: string | undefined, attached=false, maskRendered=false;
  // Overrides are confined to this render pass. Visible fading walls still
  // block the mask; disabled cutaway meshes disappear normally. Never include
  // the invisible shadow proxies, which intentionally survive roof cutaway.
  const edge = new PostProcess('object-selection-silhouette','siderealSelectionEdge',
    ['texel'],['selectionMask'],1,null,Texture.NEAREST_SAMPLINGMODE,engine);
  edge.onApply = effect => {
    effect.setTexture('selectionMask',mask);
    effect.setFloat2('texel',1/mask.getSize().width,1/mask.getSize().height);
  };
  const resize = engine.onResizeObservable.add(() => {mask.resize(size());maskRendered=false;});
  mask.onAfterRenderObservable.add(()=>{maskRendered=true;});
  function select(id?:string) {
    selected=id;
    for (const mesh of meshes) mask.setMaterialForRendering(mesh,
      id ? materials[mesh.metadata?.partId===id?1:0] : undefined);
    if (id) {
      if (!scene.customRenderTargets.includes(mask)) scene.customRenderTargets.push(mask);
    } else {
      camera?.detachPostProcess(edge);attached=false;
      const index=scene.customRenderTargets.indexOf(mask);
      if(index>=0)scene.customRenderTargets.splice(index,1);
    }
  }
  // Compiling a new postprocess while it is already attached can blank the
  // camera for a frame. Warm both effects first, then attach on a frame boundary.
  const ready=scene.onBeforeRenderObservable.add(()=>{
    if (!selected || attached || !camera || !maskRendered || !edge.isReady()) return;
    const sample=meshes.find(mesh=>mesh.metadata?.partId===selected);
    if (!sample || !materials.every(material=>material.isReady(sample))) return;
    camera.attachPostProcess(edge);attached=true;
  });
  select(placementId);
  return {
    select,
    dispose() {
      select(undefined);
      scene.onBeforeRenderObservable.remove(ready);
      engine.onResizeObservable.remove(resize);
      edge.dispose(camera ?? undefined);
      const index = scene.customRenderTargets.indexOf(mask);
      if (index >= 0) scene.customRenderTargets.splice(index,1);
      for (const mesh of meshes) mask.setMaterialForRendering(mesh);
      mask.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
