import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { createIceMaterial } from "./ice-material";
const clamp=(v:number)=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
/** Light-driven local wrap/scatter budget. No transmission claim or added light. */
export function nativeColdResponse(depth:number,thin:number,nv:number,nl:number,shadow:number,intensity:number,snow:boolean) {
 const d=clamp(depth),t=clamp(thin),light=Math.max(0,Math.min(3,Number.isFinite(intensity)?intensity:0));
 const wrap=clamp((nl+.4)/1.4),rim=Math.pow(1-clamp(nv),3),contact=clamp(shadow);
 return snow?Math.min(.48,.18*light*wrap*contact):Math.min(.45,light*(1-d)*(.10*wrap*contact+.16*rim*t+.08*clamp(-nl)*t));
}
class NativeColdPlugin extends MaterialPluginBase {
 private readonly direction=new Vector3(.6,1,-.45).normalize();
 constructor(material:PBRMaterial,private readonly snow:boolean){super(material,"NativeColdFinish",190,{},true,true);}
 override getClassName(){return "NativeColdFinish";}
 override getAttributes(attributes:string[]){attributes.push("nativeOptics");}
 override getUniforms(){return {ubo:[{name:"nativeSunDirection",size:3,type:"vec3"},{name:"nativeSunIntensity",size:1,type:"float"},{name:"nativeSnow",size:1,type:"float"}],fragment:"uniform vec3 nativeSunDirection; uniform float nativeSunIntensity; uniform float nativeSnow;"};}
 override bindForSubMesh(buffer:UniformBuffer,scene:Scene){
  const light=["planet-hero-key","exterior-key","preview-sun"].map(name=>scene.getLightByName(name)).find(l=>l?.isEnabled()) as DirectionalLight|undefined;
  if(light?.direction)this.direction.copyFrom(light.direction).scaleInPlace(-1).normalize();
  buffer.updateVector3("nativeSunDirection",this.direction);
  buffer.updateFloat("nativeSunIntensity",scene.lightsEnabled?Math.min(3,light?.intensity??0):0);
  buffer.updateFloat("nativeSnow",this.snow?1:0);
 }
 override getCustomCode(type:string):Record<string,string>|null{
  if(type==="vertex")return {CUSTOM_VERTEX_DEFINITIONS:"attribute vec2 nativeOptics; varying vec2 vNativeOptics;",CUSTOM_VERTEX_MAIN_END:"vNativeOptics=clamp(nativeOptics,0.0,1.0);"};
  if(type==="fragment")return {CUSTOM_FRAGMENT_DEFINITIONS:"varying vec2 vNativeOptics;",CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION:`
#ifndef UNLIT
 float ncNL=dot(normalW,normalize(nativeSunDirection));
 float ncNV=clamp(dot(normalW,viewDirectionW),0.0,1.0);
 float ncWrap=clamp((ncNL+0.4)/1.4,0.0,1.0);
 float ncShadow=numLights>0.0?clamp(aggShadow,0.0,1.0):0.0;
 float ncRim=pow(1.0-ncNV,3.0);
 float ncDepth=vNativeOptics.x;
 float ncThin=vNativeOptics.y;
 if(nativeSnow>0.5){
  float ncSnow=min(0.48,0.18*nativeSunIntensity*ncWrap*ncShadow);
  finalDiffuse+=surfaceAlbedo*vec3(0.87,0.94,1.0)*ncSnow;
 }else{
  float ncScatter=min(0.45,nativeSunIntensity*(1.0-ncDepth)*(0.10*ncWrap*ncShadow+0.16*ncRim*ncThin+0.08*max(0.0,-ncNL)*ncThin));
  finalDiffuse+=vec3(0.018,0.45,1.0)*ncScatter;
 }
#endif
`};return null;
 }
}
/** Draft native finish; leaves accepted live procedural materials unchanged. */
export function createNativeIceFinish(scene:Scene,name:string,snow:boolean){
 const material=snow?new PBRMaterial(name,scene):createIceMaterial(scene,name);
 material.roughness=snow?.83:.15;
 material.directIntensity=snow?1.6:1.45;
 material.environmentIntensity=snow?.7:1.1;
 material.specularIntensity=snow?.25:1.5;
 if(!snow){material.clearCoat.intensity=.42;material.clearCoat.roughness=.10;}
 material.maxSimultaneousLights=4;
 new NativeColdPlugin(material,snow);
 return material;
}
