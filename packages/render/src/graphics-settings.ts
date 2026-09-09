import type { Scene } from '@babylonjs/core/scene';
import { PostProcess } from '@babylonjs/core/PostProcesses/postProcess';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';

export type GraphicsSettings = { brightness:number;contrast:number;gamma:number;saturation:number };
export const GRAPHICS_DEFAULTS:Readonly<GraphicsSettings>={brightness:1,contrast:1,gamma:1,saturation:1};
export const GRAPHICS_RANGES:Record<keyof GraphicsSettings,readonly[number,number]>={brightness:[.5,1.5],contrast:[.5,1.5],gamma:[.5,2],saturation:[0,2]};
export const GRAPHICS_STORAGE_KEY='sidereal.graphics.v1';
export function normalizeGraphics(input:unknown,base:GraphicsSettings={...GRAPHICS_DEFAULTS}):GraphicsSettings {
 const out={...base};if(!input||typeof input!=='object')return out;
 for(const key of Object.keys(GRAPHICS_DEFAULTS) as (keyof GraphicsSettings)[]){const value=(input as Partial<GraphicsSettings>)[key];if(typeof value==='number'&&Number.isFinite(value)){const [lo,hi]=GRAPHICS_RANGES[key];out[key]=Math.max(lo,Math.min(hi,value));}}
 return out;
}
/** Display-space correction after existing scene tone mapping; neutral is exact identity. */
export function transferGraphics(rgb:readonly number[],settings:GraphicsSettings):number[]{
 const l=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 return rgb.map(v=>Math.pow(Math.max(0,Math.min(1,((l+(v-l)*settings.saturation)*settings.brightness-.5)*settings.contrast+.5)),1/settings.gamma));
}
ShaderStore.ShadersStore.siderealGraphicsFragmentShader=`precision highp float;
varying vec2 vUV;uniform sampler2D textureSampler;uniform vec4 adjustments;
void main(){vec4 pixel=texture2D(textureSampler,vUV);float l=dot(pixel.rgb,vec3(.2126,.7152,.0722));vec3 c=mix(vec3(l),pixel.rgb,adjustments.w);c=(c*adjustments.x-.5)*adjustments.y+.5;c=pow(clamp(c,0.,1.),vec3(1./adjustments.z));gl_FragColor=vec4(c,pixel.a);}`;
type Store=Pick<Storage,'getItem'|'setItem'>;
export function createGraphicsSettings(scene:Scene,storage?:Store){
 if(!storage)try{storage=globalThis.localStorage;}catch{/* storage denied: session preference still works */}
 let settings={...GRAPHICS_DEFAULTS};try{settings=normalizeGraphics(JSON.parse(storage?.getItem(GRAPHICS_STORAGE_KEY)??'null'));}catch{/* malformed local preference */}
 const camera=scene.activeCamera;let pass:PostProcess|undefined,attached=false,disposed=false;
 function reconcile(){
  const active=Object.keys(GRAPHICS_DEFAULTS).some(k=>settings[k as keyof GraphicsSettings]!==1);
  if(!active){if(pass&&attached)camera?.detachPostProcess(pass);attached=false;return;}
  if(!pass){pass=new PostProcess('graphics-display-adjustments','siderealGraphics',['adjustments'],[],1,null,Texture.BILINEAR_SAMPLINGMODE,scene.getEngine());pass.onApply=e=>e.setFloat4('adjustments',settings.brightness,settings.contrast,settings.gamma,settings.saturation);}
 }
 // Never attach an uncompiled pass: settings must not blank the first changed frame.
 const observer=scene.onBeforeRenderObservable.add(()=>{if(!attached&&pass&&pass.isReady()&&Object.values(settings).some(v=>v!==1)){camera?.attachPostProcess(pass);attached=true;}});
 reconcile();
 function set(patch:Partial<GraphicsSettings>){if(disposed)return;settings=normalizeGraphics(patch,settings);reconcile();try{storage?.setItem(GRAPHICS_STORAGE_KEY,JSON.stringify(settings));}catch{}}
 return {snapshot:()=>({...settings}),set,reset:()=>set({...GRAPHICS_DEFAULTS}),dispose(){disposed=true;scene.onBeforeRenderObservable.remove(observer);pass?.dispose(camera??undefined);}};
}
