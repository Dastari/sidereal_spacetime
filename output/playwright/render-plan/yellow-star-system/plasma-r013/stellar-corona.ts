import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector4 } from "@babylonjs/core/Maths/math.vector";
import { stellarEruptionState } from "./stellar-eruption";
import { surfaceVertex } from "./shaders";
/** Additive optically thin plasma overlapping the authored PBR limb.
 * One fixed quad carries corona and rare broad eruptions, never the PBR surface.
 * The central disc stays transparent; normal depth testing preserves occlusion. */
export function createStellarCorona(scene: Scene, bodyId: string) {
  const mesh = CreatePlane(`stellar-corona:${bodyId}`, { size: 3.8 }, scene);
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.metadata = {
    role: "effect",
    bodyId,
    partId: `${bodyId}:corona`,
    stellarCorona: true,
    trianglePlacementRanges: [
      { firstTriangle: 0, triangleCount: 2, partId: `${bodyId}:corona` },
    ],
  };
  const material = new ShaderMaterial(
    `stellar-corona-material:${bodyId}`,
    scene,
    {
      vertexSource: surfaceVertex,
      fragmentSource: `precision highp float;
varying vec2 vUV; uniform float time; uniform vec4 eruption;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float turbulence(vec2 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.07);}
void main(){
 vec2 p=(vUV-.5)*3.8;float r=length(p);float a=atan(p.y,p.x);
 vec2 direction=p/max(r,.001);
 // Cartesian angular sampling closes the seam at +/- pi. Advect plasma
 // outward through a warped field rather than drawing an oscillating outline.
 float warp=turbulence(direction*7.+vec2(time*.12,-time*.09));
 float flow=turbulence(direction*19.+vec2(r*15.-time*.9,warp*4.));
 float reach=1.10+.31*warp+.12*flow;
 float base=smoothstep(.90,.985,r);
 float outer=base*(1.-smoothstep(1.02,reach,r));
 float hot=base*exp(-pow((r-.995)/(.035+.026*flow),2.));
 float wisp=base*exp(-max(r-1.015,0.)*(9.-3.*warp))*(.25+.75*flow);
 float fade=1.-smoothstep(1.55,1.85,r);
 vec3 orange=vec3(1.,.205,.002);
 vec3 c=(orange*(outer*1.5+wisp*1.1)+vec3(1.,.65,.10)*hot*(1.3+flow))*fade;
 // A broad, ragged plasma curtain grows from a limb sector, arches sideways
 // and dissipates outward. It shares the corona field, never a solid tube.
 float da=atan(sin(a-eruption.x),cos(a-eruption.x));
 float age=eruption.y, strength=eruption.z;
 float height=.16+.32*smoothstep(0.,.72,age);
 float h=(r-.97)/height;
 float bend=.17*sin(clamp(h,0.,1.)*3.14159)*smoothstep(0.,.45,age);
 float curtain=turbulence(vec2(da*15.+time*.34,h*6.-time*1.7)+warp*2.);
 float width=.20+.085*curtain;
 float spread=exp(-pow((da-bend)/width,2.));
 float radial=smoothstep(.93,1.015,r)*(1.-smoothstep(.45+.33*curtain,1.08,h));
 float ragged=smoothstep(.15,.73,curtain);
 float plume=spread*radial*strength*(.30+ragged);
 float rootHeat=plume*exp(-max(h,0.)*3.8);
 c+=vec3(1.,.29,.004)*plume*2.+vec3(1.,.74,.15)*rootHeat*1.4;
 float opacity=clamp(base*(outer+hot+wisp)*fade+plume,0.,1.);
 gl_FragColor=vec4(c,opacity);
}`,
    },
    {
      attributes: ["position", "normal", "uv"],
      uniforms: ["world", "worldViewProjection", "time", "eruption"],
      needAlphaBlending: true,
    },
  );
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.setFloat("time", 0);
  const eruptionUniform = new Vector4(0, 0, 0, 0);
  material.setVector4("eruption", eruptionUniform);
  mesh.material = material;
  return {
    mesh,
    material,
    update: (time: number) => {
      const event = stellarEruptionState(time);
      material.setFloat("time", time);
      eruptionUniform.set(event.angle, event.progress, event.strength, 0);
      material.setVector4("eruption", eruptionUniform);
    },
    dispose: () => {
      mesh.dispose();
      material.dispose();
    },
  };
}
