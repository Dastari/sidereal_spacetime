import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { surfaceVertex } from './shaders';
/** Additive optically thin plasma outside the authored PBR photosphere.
 * One fixed quad supplements native flare geometry; it never replaces the surface.
 * Disc interior is transparent and normal depth testing preserves occlusion. */
export function createStellarCorona(scene: Scene, bodyId: string) {
 const mesh=CreatePlane(`stellar-corona:${bodyId}`,{size:2.6},scene);
 mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;
 mesh.metadata={role:'effect',bodyId,partId:`${bodyId}:corona`,stellarCorona:true,
  trianglePlacementRanges:[{firstTriangle:0,triangleCount:2,partId:`${bodyId}:corona`}]};
 const material=new ShaderMaterial(`stellar-corona-material:${bodyId}`,scene,{
  vertexSource:surfaceVertex,
  fragmentSource:`precision highp float;
varying vec2 vUV; uniform float time;
void main(){
 vec2 p=(vUV-.5)*2.6;float r=length(p);float a=atan(p.y,p.x);
 float waves=.5+.19*sin(a*17.+time*.71)+.16*sin(a*31.-time*.43)+.12*sin(a*57.+time*1.13);
 float reach=1.045+.14*waves;
 float outer=smoothstep(.985,1.018,r)*(1.-smoothstep(1.018,reach,r));
 float rim=smoothstep(.977,1.003,r)*(1.-smoothstep(1.007,1.037,r));
 float haze=smoothstep(1.01,1.045,r)*exp(-max(0.,r-1.04)*26.)*.16;
 float strands=.58+.42*sin(a*81.+r*37.-time*.9);
 vec3 c=vec3(1.,.72,.17)*rim*1.45+vec3(1.,.19,.008)*(outer*(.38+.3*strands)+haze);
 gl_FragColor=vec4(c,clamp(max(rim,outer)+haze,0.,1.));
}`},{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','time'],needAlphaBlending:true});
 material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=false;
 material.setFloat('time',0);mesh.material=material;
 return {mesh,material,update:(time:number)=>material.setFloat('time',time),dispose:()=>{mesh.dispose();material.dispose();}};
}
