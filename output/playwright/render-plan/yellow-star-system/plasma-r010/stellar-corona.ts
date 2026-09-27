import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { surfaceVertex } from './shaders';
/** Additive optically thin plasma overlapping the authored PBR limb.
 * One fixed quad supplements native flare geometry; it never replaces the surface.
 * The central disc stays transparent; normal depth testing preserves occlusion. */
export function createStellarCorona(scene: Scene, bodyId: string) {
 const mesh=CreatePlane(`stellar-corona:${bodyId}`,{size:3.0},scene);
 mesh.billboardMode=Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;
 mesh.metadata={role:'effect',bodyId,partId:`${bodyId}:corona`,stellarCorona:true,
  trianglePlacementRanges:[{firstTriangle:0,triangleCount:2,partId:`${bodyId}:corona`}]};
 const material=new ShaderMaterial(`stellar-corona-material:${bodyId}`,scene,{
  vertexSource:surfaceVertex,
  fragmentSource:`precision highp float;
varying vec2 vUV; uniform float time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float turbulence(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.07);}
void main(){
 vec2 p=(vUV-.5)*3.0;float r=length(p);float a=atan(p.y,p.x);
 vec2 direction=p/max(r,.001);
 // Cartesian angular sampling closes the seam at +/- pi. Advect plasma
 // outward through a warped field rather than drawing an oscillating outline.
 float warp=turbulence(direction*7.+vec2(time*.12,-time*.09));
 float flow=turbulence(direction*19.+vec2(r*15.-time*.9,warp*4.));
 float reach=1.055+.19*warp+.085*flow;
 float base=smoothstep(.90,.985,r);
 float outer=base*(1.-smoothstep(1.02,reach,r));
 float hot=base*exp(-pow((r-.995)/(.033+.018*flow),2.));
 float wisp=base*exp(-max(r-1.015,0.)*(17.-6.*warp))*(.25+.75*flow);
 float fade=1.-smoothstep(1.24,1.47,r);
 vec3 orange=vec3(1.,.30,.006);
 vec3 c=(orange*(outer*1.2+wisp*.7)+vec3(1.,.88,.46)*hot*2.8)*fade;
 gl_FragColor=vec4(c,clamp(base*(outer+hot+wisp)*fade,0.,1.));
}`},{attributes:['position','normal','uv'],uniforms:['world','worldViewProjection','time'],needAlphaBlending:true});
 material.alphaMode=Constants.ALPHA_ADD;material.disableDepthWrite=true;material.backFaceCulling=false;
 material.setFloat('time',0);mesh.material=material;
 return {mesh,material,update:(time:number)=>material.setFloat('time',time),dispose:()=>{mesh.dispose();material.dispose();}};
}
